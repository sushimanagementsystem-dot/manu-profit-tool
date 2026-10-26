import { Injectable, Logger } from '@nestjs/common';

import { SnapshotService } from '../costing/snapshot.service';
import { SPREADSHEET_TYPES, MIME_BY_TYPE } from '../files/upload-limits';
import type { JobStatus } from '../generated/prisma/enums';
import { MatchingService } from '../matching/matching.service';
import { NormalizationService } from '../normalization/normalization.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressService } from './progress.service';

const SPREADSHEET_MIME_TYPES = SPREADSHEET_TYPES.map((type) => MIME_BY_TYPE[type]);

/**
 * Drives a submitted job through its stages:
 * EXTRACTING (one task per file) → NORMALIZING → MATCHING → CALCULATING → READY.
 * Stage changes use conditional updates, so concurrent callers can't advance a job twice.
 */
@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly progress: ProgressService,
    private readonly normalization: NormalizationService,
    private readonly matching: MatchingService,
    private readonly snapshots: SnapshotService,
  ) {}

  /** Creates one processing task per uploaded file and moves the job to EXTRACTING. */
  async start(jobId: string): Promise<void> {
    const files = await this.prisma.uploadedFile.findMany({
      where: { jobId, status: 'UPLOADED' },
      select: { id: true, mimeType: true },
    });
    await this.prisma.processingTask.createMany({
      data: files.map((file) => ({
        jobId,
        fileId: file.id,
        type: SPREADSHEET_MIME_TYPES.includes(file.mimeType) ? ('PARSE_FILE' as const) : ('EXTRACT_FILE' as const),
      })),
    });
    await this.transition(jobId, 'QUEUED', 'EXTRACTING');
  }

  /** Called whenever a task finishes; advances the job once every file task is done. */
  async onTaskFinished(jobId: string): Promise<void> {
    await this.progress.update(jobId);
    const open = await this.prisma.processingTask.count({
      where: { jobId, status: { in: ['PENDING', 'RUNNING', 'DISPATCHED'] } },
    });
    if (open === 0) await this.analyse(jobId);
  }

  /** Re-queues failed file tasks of a FAILED job. */
  async retry(jobId: string): Promise<void> {
    await this.prisma.processingTask.updateMany({
      where: { jobId, status: 'FAILED' },
      data: { status: 'PENDING', attempt: 0, nextAttemptAt: new Date(), errorCode: null, errorMessage: null },
    });
    await this.prisma.uploadedFile.updateMany({
      where: { jobId, status: 'FAILED' },
      data: { status: 'UPLOADED', statusMessage: null },
    });
    await this.prisma.analysisJob.update({
      where: { id: jobId },
      data: { status: 'EXTRACTING', failureCode: null, failureMessage: null },
    });
    await this.progress.setStage(jobId, 'EXTRACTING');
    await this.onTaskFinished(jobId);
  }

  private async analyse(jobId: string): Promise<void> {
    if (!(await this.transition(jobId, 'EXTRACTING', 'NORMALIZING'))) return;
    try {
      await this.resetDerivedData(jobId);
      await this.normalization.run(jobId);

      await this.transition(jobId, 'NORMALIZING', 'MATCHING');
      const { menuBuiltFromPos } = await this.matching.run(jobId);
      if (menuBuiltFromPos) {
        await this.progress.update(jobId, [
          { level: 'warning', code: 'menu_from_pos', text: 'No menu items could be read, so the menu was built from the POS report.' },
        ]);
      }

      const [menuItems, posLines] = await Promise.all([
        this.prisma.menuItem.count({ where: { jobId } }),
        this.prisma.posSalesLine.count({ where: { jobId } }),
      ]);
      if (menuItems === 0 && posLines === 0) {
        await this.fail(jobId, 'no_usable_data', 'None of the files contained readable menu or sales data.');
        return;
      }

      await this.transition(jobId, 'MATCHING', 'CALCULATING');
      await this.snapshots.recompute(this.prisma, jobId, 0);
      await this.transition(jobId, 'CALCULATING', 'READY');
    } catch (error) {
      this.logger.error({ jobId }, error instanceof Error ? error.stack : String(error));
      await this.fail(jobId, 'processing_error', 'Something went wrong while analysing the files. Please try again.');
    }
  }

  /** Analysis is rebuilt from extracted rows each time, so a retry starts from a clean slate. */
  private async resetDerivedData(jobId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.resultSnapshot.deleteMany({ where: { jobId } }),
      this.prisma.matchSuggestion.deleteMany({ where: { jobId } }),
      this.prisma.ingredientPrice.deleteMany({ where: { jobId } }),
      this.prisma.ingredient.deleteMany({ where: { jobId } }),
      this.prisma.menuItem.deleteMany({ where: { jobId, sourceFileId: null } }),
      this.prisma.posSalesLine.updateMany({ where: { jobId }, data: { menuItemId: null, isDuplicate: false } }),
    ]);
  }

  private async transition(jobId: string, from: JobStatus, to: JobStatus): Promise<boolean> {
    const { count } = await this.prisma.analysisJob.updateMany({
      where: { id: jobId, status: from },
      data: { status: to },
    });
    if (count) {
      await this.progress.setStage(jobId, to);
      await this.prisma.jobEvent.create({ data: { jobId, type: 'STAGE_CHANGED', meta: { from, to } } });
    }
    return count > 0;
  }

  private async fail(jobId: string, code: string, message: string): Promise<void> {
    await this.prisma.analysisJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', failureCode: code, failureMessage: message },
    });
    await this.progress.setStage(jobId, 'FAILED');
  }
}
