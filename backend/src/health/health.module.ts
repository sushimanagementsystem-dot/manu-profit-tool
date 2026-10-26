import { Module } from '@nestjs/common';

import { ChatModule } from '../chat/chat.module';
import { ExtractionModule } from '../extraction/extraction.module';
import { ClaudeClient } from '../chat/claude.client';
import { HealthController } from './health.controller';

@Module({
  imports: [ExtractionModule, ChatModule],
  controllers: [HealthController],
  providers: [ClaudeClient],
})
export class HealthModule {}
