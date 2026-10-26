import { Module } from '@nestjs/common';

import { CostingModule } from '../costing/costing.module';
import { ExtractionModule } from '../extraction/extraction.module';
import { MatchingModule } from '../matching/matching.module';
import { NormalizationModule } from '../normalization/normalization.module';
import { InternalFilesController } from './internal-files.controller';
import { N8nCallbackController } from './n8n-callback.controller';
import { PipelineService } from './pipeline.service';
import { ProgressService } from './progress.service';
import { TaskRunnerService } from './task-runner.service';

@Module({
  imports: [ExtractionModule, NormalizationModule, MatchingModule, CostingModule],
  controllers: [N8nCallbackController, InternalFilesController],
  providers: [PipelineService, ProgressService, TaskRunnerService],
  exports: [PipelineService, ProgressService, TaskRunnerService],
})
export class ProcessingModule {}
