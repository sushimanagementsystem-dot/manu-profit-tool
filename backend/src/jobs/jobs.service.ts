import { Injectable } from '@nestjs/common';

import { generateToken, sha256Hex } from '../common/crypto';
import { Problems } from '../common/problem';
import { FilesService, type FileView } from '../files/files.service';
import { UPLOAD_LIMITS } from '../files/upload-limits';
import type { JobStatus } from '../generated/prisma/enums';
import type { AppConfig } from '../config/env.schema';
import { InjectConfig } from '../config/config.module';
import { PipelineService } from '../processing/pipeline.service';
import { TaskRunnerService } from '../processing/task-runner.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ACTIVE_STATUSES, type JobProgress } from './job-state';
import type { CreateJobDto, SubmitJobDto } from './jobs.dto';

const HOUR_MS = 3_600_000;

export type ReadinessIssue = { code: string; category?: string; message: string };

export type JobStatusView = {
  jobId: string;
  status: JobStatus;
  progress: JobProgress;
  files: FileView[];
  currentRevision: number;
  isActive: boolean;
  failure: { code: string; message: string } | null;
  expiresAt: Date;
  rawFilesExpireAt: Date | null;
};

@Injectable()
export class JobsService {
  constructor(
    @InjectConfig() private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly storage: StorageService,
    private readonly pipeline: PipelineService,
    private readonly runner: TaskRunnerService,
  ) {}

  /** Creates a draft job and returns its access token — the only time the token is ever shown. */
  async create(dto: CreateJobDto) {
    const token = generateToken();
    const job = await this.prisma.analysisJob.create({
      data: {
        accessTokenHash: sha256Hex(token),
        currency: dto.currency,
        expiresAt: new Date(Date.now() + this.config.DRAFT_TTL_HOURS * HOUR_MS),
      },
      select: { id: true, status: true, expiresAt: true },
    });
    await this.prisma.jobEvent.create({ data: { jobId: job.id, type: 'CREATED' } });
    return { jobId: job.id, accessToken: token, status: job.status, expiresAt: job.expiresAt };
  }

  async getStatus(jobId: string): Promise<JobStatusView> {
    const job = await this.prisma.analysisJob.findUniqueOrThrow({ where: { id: jobId } });
    return {
      jobId: job.id,
      status: job.status,
      progress: job.progress as JobProgress,
      files: await this.files.list(jobId),
      currentRevision: job.currentRevision,
      isActive: ACTIVE_STATUSES.includes(job.status),
      failure: job.failureCode ? { code: job.failureCode, message: job.failureMessage ?? '' } : null,
      expiresAt: job.expiresAt,
      rawFilesExpireAt: job.rawFilesExpireAt,
    };
  }

  /** At least one file per category, and nothing over the limits. */
  async readiness(jobId: string): Promise<{ ready: boolean; issues: ReadinessIssue[] }> {
    const files = await this.prisma.uploadedFile.findMany({
      where: { jobId, status: { not: 'DELETED' } },
      select: { category: true },
    });
    const labels = { MENU: 'menu', INVOICE: 'supplier invoice', POS: 'POS sales report' };
    const issues: ReadinessIssue[] = (['MENU', 'INVOICE', 'POS'] as const)
      .filter((category) => !files.some((file) => file.category === category))
      .map((category) => ({
        code: 'missing_category',
        category,
        message: `Upload at least one ${labels[category]}.`,
      }));
    return { ready: issues.length === 0, issues };
  }

  /** Stores the submitted assumptions, starts processing, and extends the job's lifetime. */
  async submit(jobId: string, dto: SubmitJobDto): Promise<JobStatusView> {
    const job = await this.prisma.analysisJob.findUniqueOrThrow({
      where: { id: jobId },
      select: { status: true },
    });
    if (job.status !== 'DRAFT') {
      throw Problems.invalidState('This analysis has already been submitted.');
    }
    const { ready, issues } = await this.readiness(jobId);
    if (!ready) throw Problems.validation('Some required files are missing.', issues.map((issue) => ({ path: issue.category ?? 'files', code: issue.code, message: issue.message })));

    const submittedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.analysisJob.update({
        where: { id: jobId },
        data: {
          status: 'QUEUED',
          submittedAt,
          expiresAt: new Date(submittedAt.getTime() + this.config.JOB_TTL_HOURS * HOUR_MS),
          rawFilesExpireAt: new Date(submittedAt.getTime() + this.config.RAW_FILE_TTL_HOURS * HOUR_MS),
        },
      }),
      ...this.assumptionWrites(jobId, dto),
      this.prisma.jobEvent.create({ data: { jobId, type: 'SUBMITTED' } }),
    ]);

    await this.pipeline.start(jobId);
    void this.runner.drain();
    return this.getStatus(jobId);
  }

  async retry(jobId: string, status: JobStatus): Promise<JobStatusView> {
    if (status !== 'FAILED') throw Problems.invalidState('This analysis is not in a failed state.');
    await this.pipeline.retry(jobId);
    void this.runner.drain();
    return this.getStatus(jobId);
  }

  /** Deletes all of a job's data and files immediately, leaving an expired tombstone. */
  async purge(jobId: string, reason: 'DELETED' | 'EXPIRED'): Promise<void> {
    await this.storage.deleteJob(jobId);
    await this.prisma.$transaction([
      this.prisma.uploadedFile.deleteMany({ where: { jobId } }),
      this.prisma.processingTask.deleteMany({ where: { jobId } }),
      this.prisma.posSalesLine.deleteMany({ where: { jobId } }),
      this.prisma.invoiceLine.deleteMany({ where: { jobId } }),
      this.prisma.supplierInvoice.deleteMany({ where: { jobId } }),
      this.prisma.ingredientPrice.deleteMany({ where: { jobId } }),
      this.prisma.recipeLine.deleteMany({ where: { jobId } }),
      this.prisma.ingredient.deleteMany({ where: { jobId } }),
      this.prisma.matchSuggestion.deleteMany({ where: { jobId } }),
      this.prisma.menuItem.deleteMany({ where: { jobId } }),
      this.prisma.assumption.deleteMany({ where: { jobId } }),
      this.prisma.revision.deleteMany({ where: { jobId } }),
      this.prisma.resultSnapshot.deleteMany({ where: { jobId } }),
      this.prisma.chatMessage.deleteMany({ where: { jobId } }),
      this.prisma.reportExport.deleteMany({ where: { jobId } }),
      this.prisma.analysisJob.update({
        where: { id: jobId },
        data: {
          status: 'EXPIRED',
          purgedAt: new Date(),
          progress: {},
          aiUsage: {},
          cleanupAttempts: 0,
          lastCleanupError: null,
        },
      }),
      this.prisma.jobEvent.create({ data: { jobId, type: reason } }),
    ]);
  }

  private assumptionWrites(jobId: string, dto: SubmitJobDto) {
    const values: { key: string; value: unknown }[] = [];
    const { vatRate, vatRateDrink, menuPricesIncludeVat } = dto.assumptions;
    if (vatRate !== undefined) values.push({ key: 'VAT_RATE', value: vatRate });
    if (vatRateDrink !== undefined) values.push({ key: 'VAT_RATE_DRINK', value: vatRateDrink });
    if (menuPricesIncludeVat !== undefined) {
      values.push({ key: 'MENU_PRICES_INCLUDE_VAT', value: menuPricesIncludeVat });
    }
    return values.map((entry) =>
      this.prisma.assumption.upsert({
        where: { jobId_key: { jobId, key: entry.key } },
        create: { jobId, key: entry.key, value: entry.value as never, source: 'USER' },
        update: { value: entry.value as never, source: 'USER' },
      }),
    );
  }
}
