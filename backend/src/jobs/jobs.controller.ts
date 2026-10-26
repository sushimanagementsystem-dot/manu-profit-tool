import { Body, Controller, Delete, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { ZodBodyPipe } from '../common/zod-body.pipe';
import { publicUploadLimits } from '../files/upload-limits';
import { CurrentJob, JobAccessGuard, type JobContext } from './job-access.guard';
import { createJobSchema, submitJobSchema, type CreateJobDto, type SubmitJobDto } from './jobs.dto';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  async create(@Body(new ZodBodyPipe(createJobSchema)) body: CreateJobDto) {
    const job = await this.jobs.create(body);
    return { ...job, limits: publicUploadLimits() };
  }

  @Get(':jobId')
  @UseGuards(JobAccessGuard)
  status(@CurrentJob() job: JobContext) {
    return this.jobs.getStatus(job.id);
  }

  @Get(':jobId/readiness')
  @UseGuards(JobAccessGuard)
  readiness(@CurrentJob() job: JobContext) {
    return this.jobs.readiness(job.id);
  }

  @Post(':jobId/submit')
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @UseGuards(JobAccessGuard)
  submit(@CurrentJob() job: JobContext, @Body(new ZodBodyPipe(submitJobSchema)) body: SubmitJobDto) {
    return this.jobs.submit(job.id, body);
  }

  @Post(':jobId/retry')
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @UseGuards(JobAccessGuard)
  retry(@CurrentJob() job: JobContext) {
    return this.jobs.retry(job.id, job.status);
  }

  @Delete(':jobId')
  @HttpCode(204)
  @UseGuards(JobAccessGuard)
  async remove(@CurrentJob() job: JobContext): Promise<void> {
    await this.jobs.purge(job.id, 'DELETED');
  }
}
