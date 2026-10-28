import { Module } from '@nestjs/common';

import { CostingModule } from '../costing/costing.module';
import { RevisionsModule } from '../revisions/revisions.module';
import { AiUsageModule } from '../usage/ai-usage.module';
import { ChatController } from './chat.controller';
import { ChatToolExecutor } from './chat-tool.executor';
import { ChatService } from './chat.service';
import { ClaudeClient } from './claude.client';

@Module({
  imports: [CostingModule, RevisionsModule, AiUsageModule],
  controllers: [ChatController],
  providers: [ChatService, ChatToolExecutor, ClaudeClient],
})
export class ChatModule {}
