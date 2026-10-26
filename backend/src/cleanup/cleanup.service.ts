import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const BATCH_SIZE = 25;
/** Tombstones (an expired job with no data) are kept so the link can say "expired". */
const TOMBSTONE_RETENTION_DAYS = 7;
const MAX_CLEANUP_ATTEMPTS = 5;

/**
 * Enforces the retention policy (docs/SECURITY_AND_RETENTION.md §4–5): expired analyses are
 * purged, raw uploads are deleted earlier than the rest, and orphaned files are swept up.
 * Every step is idempotent, so a failed run is simply retried on the next tick.
 */
@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly jobs: JobsService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async run(): Promise<void> {
    await this.purgeExpiredJobs();
    await this.deleteExpiredRawFiles();
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runDaily(): Promise<void> {
    await this.deleteOldTombstones();
  }

  private async purgeExpiredJobs(): Promise<void> {
    const due = await this.prisma.analysisJob.findMany({
      where: {
        expiresAt: { lt: new Date() },
        status: { not: 'EXPIRED' },
        cleanupAttempts: { lt: MAX_CLEANUP_ATTEMPTS },
      },
      select: { id: true, cleanupAttempts: true },
      take: BATCH_SIZE,
    });

    for (const job of due) {
      try {
        await this.jobs.purge(job.id, 'EXPIRED');
      } catch (error) {
        const attempts = job.cleanupAttempts + 1;
        await this.prisma.analysisJob.update({
          where: { id: job.id },
          data: { cleanupAttempts: attempts, lastCleanupError: 'purge_failed' },
        });
        const message = error instanceof Error ? error.message : String(error);
        if (attempts >= MAX_CLEANUP_ATTEMPTS) {
          this.logger.error({ jobId: job.id, attempts }, `Giving up on cleanup: ${message}`);
        } else {
          this.logger.warn({ jobId: job.id, attempts }, `Cleanup failed, will retry: ${message}`);
        }
      }
    }
  }

  /**
   * Uploaded files go before the rest of the analysis: the extracted data stays usable, but
   * the original documents are no longer held.
   */
  private async deleteExpiredRawFiles(): Promise<void> {
    const files = await this.prisma.uploadedFile.findMany({
      where: {
        status: { not: 'DELETED' },
        job: { rawFilesExpireAt: { lt: new Date() }, status: { not: 'EXPIRED' } },
      },
      select: { id: true, storageKey: true },
      take: BATCH_SIZE * 4,
    });

    for (const file of files) {
      try {
        await this.storage.delete(file.storageKey);
        await this.prisma.uploadedFile.update({
          where: { id: file.id },
          data: { status: 'DELETED', deletedAt: new Date() },
        });
      } catch (error) {
        this.logger.warn({ fileId: file.id }, error instanceof Error ? error.message : String(error));
      }
    }
  }

  private async deleteOldTombstones(): Promise<void> {
    const cutoff = new Date(Date.now() - TOMBSTONE_RETENTION_DAYS * 86_400_000);
    const jobs = await this.prisma.analysisJob.findMany({
      where: { status: 'EXPIRED', purgedAt: { lt: cutoff } },
      select: { id: true },
      take: BATCH_SIZE,
    });
    for (const job of jobs) {
      await this.storage.deleteJob(job.id);
      await this.prisma.analysisJob.delete({ where: { id: job.id } });
    }
  }
}
