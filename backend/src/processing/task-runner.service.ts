import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { ExtractionIngestService } from '../extraction/extraction-ingest.service';
import { N8nClient } from '../extraction/n8n.client';
import type { TaskType } from '../generated/prisma/enums';
import { parseSpreadsheetDocument } from '../parsing/document-parser';
import { TableFormatError } from '../parsing/table-parsers';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PipelineService } from './pipeline.service';
import { ProgressService } from './progress.service';

/** Backoff per attempt (ms): 30 s, 2 min, 5 min. */
const RETRY_DELAYS_MS = [30_000, 120_000, 300_000];
const DISPATCH_DEADLINE_MS = 5 * 60_000;
const MAX_CONCURRENT_TASKS = 4;

type ClaimedTask = { id: string; jobId: string; fileId: string | null; type: TaskType; attempt: number };

/**
 * Claims and executes processing tasks. Spreadsheet parsing runs in process; PDFs and images
 * are dispatched to n8n, which answers asynchronously through the callback controller.
 * A cron tick drives both new work and the re-dispatch of timed-out tasks, so nothing is
 * lost if the process restarts.
 */
@Injectable()
export class TaskRunnerService {
  private readonly logger = new Logger(TaskRunnerService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ingest: ExtractionIngestService,
    private readonly n8n: N8nClient,
    private readonly pipeline: PipelineService,
    private readonly progress: ProgressService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async tick(): Promise<void> {
    await this.requeueTimedOut();
    await this.drain();
  }

  /** Processes due tasks until none are left; safe to call concurrently. */
  async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        const tasks = await this.claimTasks();
        if (!tasks.length) return;
        await Promise.all(tasks.map((task) => this.execute(task)));
      }
    } finally {
      this.running = false;
    }
  }

  /**
   * Atomically marks due tasks as RUNNING. `SKIP LOCKED` keeps two workers (or two ticks)
   * from picking the same row.
   */
  private async claimTasks(): Promise<ClaimedTask[]> {
    return this.prisma.$queryRaw<ClaimedTask[]>`
      UPDATE "ProcessingTask" AS t
      SET status = 'RUNNING', attempt = t.attempt + 1, "updatedAt" = now()
      WHERE t.id IN (
        SELECT id FROM "ProcessingTask"
        WHERE status = 'PENDING' AND "nextAttemptAt" <= now()
        ORDER BY "nextAttemptAt"
        LIMIT ${MAX_CONCURRENT_TASKS}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING t.id, t."jobId", t."fileId", t.type, t.attempt`;
  }

  private async execute(task: ClaimedTask): Promise<void> {
    try {
      if (task.type === 'PARSE_FILE') await this.parseFile(task);
      else await this.dispatchToN8n(task);
    } catch (error) {
      await this.failTask(task, error);
    }
  }

  private async parseFile(task: ClaimedTask): Promise<void> {
    const file = await this.prisma.uploadedFile.findUniqueOrThrow({ where: { id: task.fileId as string } });
    await this.prisma.uploadedFile.update({
      where: { id: file.id },
      data: { status: 'PROCESSING', extractionMethod: 'DETERMINISTIC' },
    });

    const buffer = await this.storage.read(file.storageKey);
    const extraction = await parseSpreadsheetDocument(buffer, file.mimeType, file.category);
    const warnings = await this.ingest.ingest(task.jobId, file.id, extraction, false);
    await this.succeed(task, file.id, warnings);
  }

  private async dispatchToN8n(task: ClaimedTask): Promise<void> {
    const file = await this.prisma.uploadedFile.findUniqueOrThrow({ where: { id: task.fileId as string } });
    if (!this.n8n.isConfigured) {
      await this.failTask(
        task,
        new UnrecoverableTaskError(
          'ai_extraction_unavailable',
          `"${file.originalName}" is a PDF or photo. Reading those needs the AI extraction service, which is not connected yet. Please upload this data as CSV or Excel for now.`,
        ),
      );
      return;
    }

    const job = await this.prisma.analysisJob.findUniqueOrThrow({
      where: { id: task.jobId },
      select: { currency: true },
    });
    await this.prisma.uploadedFile.update({
      where: { id: file.id },
      data: { status: 'PROCESSING', extractionMethod: 'AI' },
    });
    await this.n8n.dispatchExtraction({
      jobId: task.jobId,
      taskId: task.id,
      attempt: task.attempt,
      file: { id: file.id, category: file.category, mimeType: file.mimeType, pageCount: file.pageCount },
      currency: job.currency,
    });
    await this.prisma.processingTask.update({
      where: { id: task.id },
      data: { status: 'DISPATCHED', deadlineAt: new Date(Date.now() + DISPATCH_DEADLINE_MS) },
    });
  }

  /** Marks a task successful and reports its warnings on the job's progress. */
  async succeed(task: { id: string; jobId: string }, fileId: string | null, warnings: string[]): Promise<void> {
    await this.prisma.processingTask.update({
      where: { id: task.id },
      data: { status: 'SUCCEEDED', resultReceivedAt: new Date() },
    });
    if (fileId) {
      await this.prisma.uploadedFile.update({ where: { id: fileId }, data: { status: 'PROCESSED' } });
    }
    await this.progress.update(
      task.jobId,
      warnings.map((text) => ({ level: 'warning' as const, code: 'extraction_warning', text, fileId: fileId ?? undefined })),
    );
    await this.pipeline.onTaskFinished(task.jobId);
  }

  /**
   * Schedules a retry, or gives up after the last attempt. The job itself continues: one
   * unreadable file becomes a reported issue rather than a failed analysis.
   */
  async failTask(task: { id: string; jobId: string; fileId: string | null; attempt: number }, error: unknown): Promise<void> {
    const { code, message, retryable } = describeError(error);
    const row = await this.prisma.processingTask.findUnique({
      where: { id: task.id },
      select: { maxAttempts: true },
    });
    const canRetry = retryable && task.attempt < (row?.maxAttempts ?? 3);

    if (canRetry) {
      const delay = RETRY_DELAYS_MS[Math.min(task.attempt - 1, RETRY_DELAYS_MS.length - 1)];
      await this.prisma.processingTask.update({
        where: { id: task.id },
        data: {
          status: 'PENDING',
          nextAttemptAt: new Date(Date.now() + delay),
          errorCode: code,
          errorMessage: message,
        },
      });
      this.logger.warn({ taskId: task.id, attempt: task.attempt, code }, 'Task failed, retrying');
      return;
    }

    await this.prisma.processingTask.update({
      where: { id: task.id },
      data: { status: 'FAILED', errorCode: code, errorMessage: message },
    });
    if (task.fileId) {
      await this.prisma.uploadedFile.update({
        where: { id: task.fileId },
        data: { status: 'FAILED', statusMessage: message },
      });
    }
    await this.prisma.jobEvent.create({
      data: { jobId: task.jobId, type: 'TASK_FAILED', meta: { taskId: task.id, code } },
    });
    await this.pipeline.onTaskFinished(task.jobId);
  }

  /** n8n never answered: put the task back in the queue (or fail it after the last attempt). */
  private async requeueTimedOut(): Promise<void> {
    const stale = await this.prisma.processingTask.findMany({
      where: { status: 'DISPATCHED', deadlineAt: { lt: new Date() } },
      select: { id: true, jobId: true, fileId: true, attempt: true },
    });
    for (const task of stale) {
      await this.failTask(task, new RetryableTaskError('extraction_timeout', 'The AI extraction service did not respond in time.'));
    }
  }
}

/** An error worth another attempt (network, provider rate limit, timeout). */
export class RetryableTaskError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** An error that will fail again the same way (bad file format, unsupported input). */
export class UnrecoverableTaskError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function describeError(error: unknown): { code: string; message: string; retryable: boolean } {
  if (error instanceof UnrecoverableTaskError) return { code: error.code, message: error.message, retryable: false };
  if (error instanceof RetryableTaskError) return { code: error.code, message: error.message, retryable: true };
  if (error instanceof TableFormatError) return { code: 'unreadable_table', message: error.message, retryable: false };
  return {
    code: 'processing_error',
    message: 'The file could not be processed.',
    retryable: true,
  };
}
