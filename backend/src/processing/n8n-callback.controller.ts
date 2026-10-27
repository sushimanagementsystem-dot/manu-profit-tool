import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';

import { Problems } from '../common/problem';
import type { AppConfig } from '../config/env.schema';
import { InjectConfig } from '../config/config.module';
import {
  EXTRACTION_SCHEMA_VERSION,
  invoiceExtractionSchema,
  menuExtractionSchema,
  posExtractionSchema,
  type DocumentExtraction,
} from '../extraction/extraction.schemas';
import { ExtractionIngestService } from '../extraction/extraction-ingest.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertCallbackAuthentic } from './callback-auth';
import { RetryableTaskError, TaskRunnerService, UnrecoverableTaskError } from './task-runner.service';

const callbackSchema = z.object({
  schemaVersion: z.string(),
  taskId: z.string().uuid(),
  attempt: z.number().int().positive(),
  status: z.enum(['SUCCEEDED', 'FAILED']),
  executionId: z.string().max(100).nullish(),
  result: z.unknown().nullish(),
  error: z.object({ code: z.string().max(100), message: z.string().max(1000) }).nullish(),
  usage: z
    .object({ model: z.string().max(100).optional(), inputTokens: z.number().optional(), outputTokens: z.number().optional() })
    .nullish(),
});

const RESULT_SCHEMAS = {
  MENU: menuExtractionSchema,
  POS: posExtractionSchema,
  INVOICE: invoiceExtractionSchema,
};

/**
 * Receives extraction results from the n8n MP-01 workflow. Authentication is an HMAC over
 * `timestamp.rawBody`; a result is only accepted while its task is DISPATCHED with the same
 * attempt, which makes duplicate and late callbacks harmless no-ops.
 */
@Controller('internal/n8n')
export class N8nCallbackController {
  constructor(
    @InjectConfig() private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly ingest: ExtractionIngestService,
    private readonly runner: TaskRunnerService,
  ) {}

  @Post('callbacks')
  @HttpCode(200)
  async handle(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-mp-timestamp') timestamp: string | undefined,
    @Headers('x-mp-signature') signature: string | undefined,
    @Headers('x-mp-callback-key') callbackKey: string | undefined,
  ) {
    const rawBody = request.rawBody?.toString('utf8');
    if (!rawBody) throw Problems.badRequest('Missing request body.');
    this.authenticate(rawBody, timestamp, signature, callbackKey);

    const body = callbackSchema.parse(JSON.parse(rawBody));
    if (body.schemaVersion !== EXTRACTION_SCHEMA_VERSION) {
      throw Problems.validation(`Unsupported schemaVersion "${body.schemaVersion}".`);
    }

    const task = await this.prisma.processingTask.findUnique({
      where: { id: body.taskId },
      select: { id: true, jobId: true, fileId: true, attempt: true, status: true },
    });
    if (!task || task.status !== 'DISPATCHED' || task.attempt !== body.attempt) {
      return { accepted: false, reason: 'duplicate' };
    }

    await this.prisma.processingTask.update({
      where: { id: task.id },
      data: { n8nExecutionId: body.executionId ?? null, usage: body.usage ?? {} },
    });
    await this.recordUsage(task.jobId, body.usage);

    if (body.status === 'FAILED') {
      await this.runner.failTask(task, new RetryableTaskError(body.error?.code ?? 'ai_error', 'The AI extraction service could not read this file.'));
      return { accepted: true };
    }

    const file = await this.prisma.uploadedFile.findUniqueOrThrow({ where: { id: task.fileId as string } });
    const parsed = RESULT_SCHEMAS[file.category].safeParse(body.result);
    if (!parsed.success) {
      await this.runner.failTask(task, new RetryableTaskError('invalid_ai_output', 'The AI extraction returned data in an unexpected format.'));
      return { accepted: true };
    }

    try {
      const warnings = await this.ingest.ingest(task.jobId, file.id, {
        category: file.category,
        data: parsed.data,
      } as DocumentExtraction, true);
      await this.runner.succeed(task, file.id, warnings);
    } catch {
      await this.runner.failTask(task, new UnrecoverableTaskError('ingest_failed', 'The extracted data could not be stored.'));
    }
    return { accepted: true };
  }

  private authenticate(
    rawBody: string,
    timestamp: string | undefined,
    signature: string | undefined,
    callbackKey: string | undefined,
  ): void {
    assertCallbackAuthentic(
      rawBody,
      { timestamp, signature, callbackKey },
      {
        callbackSecret: this.config.N8N_CALLBACK_SECRET,
        callbackKey: this.config.N8N_CALLBACK_KEY,
      },
    );
  }

  private async recordUsage(jobId: string, usage: z.infer<typeof callbackSchema>['usage']): Promise<void> {
    if (!usage) return;
    const job = await this.prisma.analysisJob.findUniqueOrThrow({ where: { id: jobId }, select: { aiUsage: true } });
    const current = (job.aiUsage ?? {}) as { inputTokens?: number; outputTokens?: number; calls?: number };
    await this.prisma.analysisJob.update({
      where: { id: jobId },
      data: {
        aiUsage: {
          inputTokens: (current.inputTokens ?? 0) + (usage.inputTokens ?? 0),
          outputTokens: (current.outputTokens ?? 0) + (usage.outputTokens ?? 0),
          calls: (current.calls ?? 0) + 1,
        },
      },
    });
  }
}
