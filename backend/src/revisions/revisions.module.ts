import { Module } from '@nestjs/common';

import { CostingModule } from '../costing/costing.module';
import { RevisionsController } from './revisions.controller';
import { RevisionsService } from './revisions.service';

@Module({
  imports: [CostingModule],
  controllers: [RevisionsController],
  providers: [RevisionsService],
  exports: [RevisionsService],
})
export class RevisionsModule {}
