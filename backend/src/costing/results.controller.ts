import { Controller, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';

import { CurrentJob, JobAccessGuard, type JobContext } from '../jobs/job-access.guard';
import { PrismaService } from '../prisma/prisma.service';
import { toAssumptionsJson } from './assumptions';
import { SnapshotService } from './snapshot.service';

@Controller('jobs/:jobId/results')
@UseGuards(JobAccessGuard)
export class ResultsController {
  constructor(
    private readonly snapshots: SnapshotService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async get(
    @CurrentJob() job: JobContext,
    @Query('revision', new ParseIntPipe({ optional: true })) revision?: number,
  ) {
    const snapshot = await this.snapshots.get(job.id, revision);
    // Read live rather than stored in the snapshot, so older snapshots show them too and the
    // snapshot hash (and the exports keyed to it) does not change.
    const assumptions = toAssumptionsJson(await this.prisma.assumption.findMany({ where: { jobId: job.id } }));
    return { ...snapshot.payload, assumptions, snapshotHash: snapshot.payloadHash };
  }
}
