import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';

import { ZodBodyPipe } from '../common/zod-body.pipe';
import { CurrentJob, JobAccessGuard, type JobContext } from '../jobs/job-access.guard';
import { ExportsService } from './exports.service';

const createSchema = z.object({ revision: z.number().int().nonnegative().optional() });

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Controller('jobs/:jobId/exports')
@UseGuards(JobAccessGuard)
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Get()
  list(@CurrentJob() job: JobContext) {
    return this.exports.list(job.id);
  }

  @Post()
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  create(@CurrentJob() job: JobContext, @Body(new ZodBodyPipe(createSchema)) body: z.infer<typeof createSchema>) {
    return this.exports.create(job.id, body.revision);
  }

  @Post(':exportId/link')
  createLink(@CurrentJob() job: JobContext, @Param('exportId', new ParseUUIDPipe()) exportId: string) {
    return this.exports.createLink(job.id, exportId);
  }
}

/** Public, token-authenticated download: no job token, so the browser can follow the link directly. */
@Controller('downloads')
export class DownloadsController {
  constructor(private readonly exports: ExportsService) {}

  @Get(':token')
  async download(@Param('token') token: string, @Res() response: Response): Promise<void> {
    const file = await this.exports.resolveDownload(token);
    response.setHeader('Content-Type', XLSX_MIME);
    response.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    response.setHeader('Content-Length', file.buffer.byteLength);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(file.buffer);
  }
}
