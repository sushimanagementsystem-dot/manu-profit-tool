import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  addCall,
  ledgerOf,
  summarize,
  type AiLedger,
  type UsageSummary,
} from './ai-ledger';

/** The token counts the Messages API returns with every response. */
export type ApiUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

/**
 * Keeps a running count of the tokens each job has used, by model, so what an analysis cost can be
 * shown. Counts only, never content. Recording is best-effort at the call sites: a failure to
 * count must never fail a client's request.
 */
@Injectable()
export class AiUsageService {
  constructor(private readonly prisma: PrismaService) {}

  recordChat(jobId: string, model: string, usage: ApiUsage): Promise<void> {
    return this.record(jobId, (ledger) =>
      addCall(ledger, 'chat', model, {
        input: usage.input_tokens,
        output: usage.output_tokens,
        cacheWrite: usage.cache_creation_input_tokens ?? 0,
        cacheRead: usage.cache_read_input_tokens ?? 0,
      }),
    );
  }

  /** One extraction call, as reported back by the n8n workflow. */
  recordExtraction(
    jobId: string,
    usage: { model?: string; inputTokens?: number; outputTokens?: number },
  ): Promise<void> {
    return this.record(
      jobId,
      (ledger) =>
        addCall(ledger, 'extraction', usage.model ?? 'unknown', {
          input: usage.inputTokens ?? 0,
          output: usage.outputTokens ?? 0,
        }),
      // The totals this column has always held, kept so nothing that reads them breaks.
      (aiUsage) => ({
        inputTokens:
          (Number(aiUsage.inputTokens) || 0) + (usage.inputTokens ?? 0),
        outputTokens:
          (Number(aiUsage.outputTokens) || 0) + (usage.outputTokens ?? 0),
        calls: (Number(aiUsage.calls) || 0) + 1,
      }),
    );
  }

  async summary(jobId: string): Promise<UsageSummary> {
    const job = await this.prisma.analysisJob.findUniqueOrThrow({
      where: { id: jobId },
      select: { aiUsage: true },
    });
    return summarize(ledgerOf(job.aiUsage));
  }

  /**
   * Read, change and write one job's usage under a row lock. Several extraction callbacks can
   * arrive together, and without the lock two of them would both read the old totals and one
   * would overwrite the other.
   */
  private async record(
    jobId: string,
    change: (ledger: AiLedger) => AiLedger,
    legacy?: (aiUsage: Record<string, unknown>) => Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "AnalysisJob" WHERE id = ${jobId}::uuid FOR UPDATE`;
      const job = await tx.analysisJob.findUniqueOrThrow({
        where: { id: jobId },
        select: { aiUsage: true },
      });
      const current = (job.aiUsage ?? {}) as Record<string, unknown>;
      await tx.analysisJob.update({
        where: { id: jobId },
        data: {
          aiUsage: {
            ...current,
            ...(legacy?.(current) ?? {}),
            ledger: change(ledgerOf(current)),
          } as never,
        },
      });
    });
  }
}
