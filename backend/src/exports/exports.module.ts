import { Module } from '@nestjs/common';

import { CostingModule } from '../costing/costing.module';
import { RevisionsModule } from '../revisions/revisions.module';
import { DownloadsController, ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';

@Module({
  imports: [CostingModule, RevisionsModule],
  controllers: [ExportsController, DownloadsController],
  providers: [ExportsService],
})
export class ExportsModule {}
