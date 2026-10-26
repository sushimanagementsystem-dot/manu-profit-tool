import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { ChatModule } from './chat/chat.module';
import { CleanupModule } from './cleanup/cleanup.module';
import { ConfigModule } from './config/config.module';
import { CostingModule } from './costing/costing.module';
import { ExportsModule } from './exports/exports.module';
import { ExtractionModule } from './extraction/extraction.module';
import { FilesModule } from './files/files.module';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { MatchingModule } from './matching/matching.module';
import { NormalizationModule } from './normalization/normalization.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProcessingModule } from './processing/processing.module';
import { RevisionsModule } from './revisions/revisions.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    StorageModule,
    ScheduleModule.forRoot(),
    // Default ceiling; routes that need their own limit declare it with @Throttle.
    ThrottlerModule.forRoot([{ ttl: 3_600_000, limit: 600 }]),
    JobsModule,
    FilesModule,
    ExtractionModule,
    NormalizationModule,
    MatchingModule,
    ProcessingModule,
    CostingModule,
    RevisionsModule,
    ChatModule,
    ExportsModule,
    CleanupModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
