import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

import { safeEqual, sha256Hex } from '../common/crypto';
import { Problems } from '../common/problem';
import type { JobStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type JobContext = { id: string; status: JobStatus; currentRevision: number };

type RequestWithJob = Request & { job?: JobContext };

/**
 * Per-job authorization for every `/jobs/:jobId/**` route.
 * A missing job and a wrong token both answer 404, so job IDs can't be probed.
 */
@Injectable()
export class JobAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithJob>();
    const jobId = request.params.jobId;
    const token = this.bearerToken(request);
    if (typeof jobId !== 'string' || !UUID_RE.test(jobId) || !token) {
      throw Problems.jobNotFound();
    }

    const job = await this.prisma.analysisJob.findUnique({
      where: { id: jobId },
      select: { id: true, status: true, currentRevision: true, accessTokenHash: true },
    });
    if (!job || !safeEqual(job.accessTokenHash, sha256Hex(token))) {
      throw Problems.jobNotFound();
    }
    if (job.status === 'EXPIRED') throw Problems.jobExpired();

    request.job = { id: job.id, status: job.status, currentRevision: job.currentRevision };
    return true;
  }

  private bearerToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    const token = header.slice('Bearer '.length).trim();
    return token.length >= 32 && token.length <= 128 ? token : null;
  }
}

/** The job resolved by JobAccessGuard. */
export const CurrentJob = createParamDecorator(
  (_: unknown, context: ExecutionContext): JobContext => {
    const job = context.switchToHttp().getRequest<RequestWithJob>().job;
    if (!job) throw new Error('CurrentJob used on a route without JobAccessGuard.');
    return job;
  },
);
