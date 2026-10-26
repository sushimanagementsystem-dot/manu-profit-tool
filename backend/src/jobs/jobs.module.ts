import { Module } from '@nestjs/common';

import { FilesModule } from '../files/files.module';
import { ProcessingModule } from '../processing/processing.module';
import { JobAccessGuard } from './job-access.guard';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [FilesModule, ProcessingModule],
  controllers: [JobsController],
  providers: [JobsService, JobAccessGuard],
  exports: [JobsService],
})
export class JobsModule {}
