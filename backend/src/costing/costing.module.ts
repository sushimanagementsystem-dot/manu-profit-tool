import { Module } from '@nestjs/common';

import { ResultsController } from './results.controller';
import { SnapshotService } from './snapshot.service';

@Module({
  controllers: [ResultsController],
  providers: [SnapshotService],
  exports: [SnapshotService],
})
export class CostingModule {}
