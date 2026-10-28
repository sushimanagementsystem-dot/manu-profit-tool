import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { ZodBodyPipe } from '../common/zod-body.pipe';
import { CurrentJob, JobAccessGuard, type JobContext } from '../jobs/job-access.guard';
import { operationsSchema } from './operations.schema';
import { RevisionsService } from './revisions.service';

const previewSchema = z.object({ operations: operationsSchema });
/** A table edit changes one cell or a handful; anything bigger belongs in the chat. */
const applySchema = z.object({ operations: operationsSchema.max(20) });

@Controller('jobs/:jobId/revisions')
@UseGuards(JobAccessGuard)
export class RevisionsController {
  constructor(private readonly revisions: RevisionsService) {}

  @Get()
  history(@CurrentJob() job: JobContext) {
    return this.revisions.history(job.id);
  }

  @Post('preview')
  async preview(
    @CurrentJob() job: JobContext,
    @Body(new ZodBodyPipe(previewSchema)) body: z.infer<typeof previewSchema>,
  ) {
    return { impact: await this.revisions.preview(job.id, body.operations) };
  }

  @Post('apply')
  apply(@CurrentJob() job: JobContext, @Body(new ZodBodyPipe(applySchema)) body: z.infer<typeof applySchema>) {
    return this.revisions.applyManual(job.id, body.operations);
  }

  @Post(':revisionId/approve')
  approve(@CurrentJob() job: JobContext, @Param('revisionId', new ParseUUIDPipe()) revisionId: string) {
    return this.revisions.approve(job.id, revisionId);
  }

  @Post(':revisionId/reject')
  async reject(@CurrentJob() job: JobContext, @Param('revisionId', new ParseUUIDPipe()) revisionId: string) {
    await this.revisions.reject(job.id, revisionId);
    return { status: 'REJECTED' };
  }
}
