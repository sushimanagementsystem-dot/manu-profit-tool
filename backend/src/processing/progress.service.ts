import { Injectable } from '@nestjs/common';

import type { JobStatus } from '../generated/prisma/enums';
import type { JobProgress, ProgressMessage } from '../jobs/job-state';
import { stagePercent } from '../jobs/job-state';
import { PrismaService } from '../prisma/prisma.service';

const MAX_MESSAGES = 100;

/** Keeps the job's `progress` JSON (shown to the client while polling) up to date. */
@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async setStage(jobId: string, stage: JobStatus): Promise<void> {
    const progress = await this.read(jobId);
    const { completed, total } = await this.taskCounts(jobId);
    await this.write(jobId, {
      ...progress,
      stage,
      completedTasks: completed,
      totalTasks: total,
      percent: stagePercent(stage, completed, total),
    });
  }

  /** Recalculates task counts and appends messages, keeping the current stage. */
  async update(jobId: string, messages: ProgressMessage[] = []): Promise<void> {
    const progress = await this.read(jobId);
    const { completed, total } = await this.taskCounts(jobId);
    await this.write(jobId, {
      ...progress,
      completedTasks: completed,
      totalTasks: total,
      percent: stagePercent(progress.stage, completed, total),
      messages: [...progress.messages, ...messages].slice(-MAX_MESSAGES),
    });
  }

  private async read(jobId: string): Promise<JobProgress> {
    const job = await this.prisma.analysisJob.findUniqueOrThrow({
      where: { id: jobId },
      select: { progress: true, status: true },
    });
    const stored = job.progress as Partial<JobProgress>;
    return {
      stage: stored.stage ?? job.status,
      completedTasks: stored.completedTasks ?? 0,
      totalTasks: stored.totalTasks ?? 0,
      percent: stored.percent ?? 0,
      messages: stored.messages ?? [],
    };
  }

  private async write(jobId: string, progress: JobProgress): Promise<void> {
    await this.prisma.analysisJob.update({ where: { id: jobId }, data: { progress } });
  }

  private async taskCounts(jobId: string) {
    const tasks = await this.prisma.processingTask.groupBy({
      by: ['status'],
      where: { jobId },
      _count: { _all: true },
    });
    const count = (statuses: string[]) =>
      tasks.filter((task) => statuses.includes(task.status)).reduce((total, task) => total + task._count._all, 0);
    return { completed: count(['SUCCEEDED', 'FAILED']), total: count(['PENDING', 'RUNNING', 'DISPATCHED', 'SUCCEEDED', 'FAILED']) };
  }
}
