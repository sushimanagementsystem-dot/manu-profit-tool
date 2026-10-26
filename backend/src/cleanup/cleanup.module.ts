import { Module } from '@nestjs/common';

import { JobsModule } from '../jobs/jobs.module';
import { CleanupService } from './cleanup.service';

@Module({
  imports: [JobsModule],
  providers: [CleanupService],
})
export class CleanupModule {}
