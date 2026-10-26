import { Controller, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';

import { CurrentJob, JobAccessGuard, type JobContext } from '../jobs/job-access.guard';
import { SnapshotService } from './snapshot.service';

@Controller('jobs/:jobId/results')
@UseGuards(JobAccessGuard)
export class ResultsController {
  constructor(private readonly snapshots: SnapshotService) {}

  @Get()
  async get(
    @CurrentJob() job: JobContext,
    @Query('revision', new ParseIntPipe({ optional: true })) revision?: number,
  ) {
    const snapshot = await this.snapshots.get(job.id, revision);
    return { ...snapshot.payload, snapshotHash: snapshot.payloadHash };
  }
}
