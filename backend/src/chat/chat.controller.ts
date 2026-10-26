import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';

import { ZodBodyPipe } from '../common/zod-body.pipe';
import { CurrentJob, JobAccessGuard, type JobContext } from '../jobs/job-access.guard';
import { ChatService } from './chat.service';

const sendSchema = z.object({ content: z.string().trim().min(1).max(2000) });

@Controller('jobs/:jobId/chat/messages')
@UseGuards(JobAccessGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  history(@CurrentJob() job: JobContext) {
    return this.chat.history(job.id);
  }

  @Post()
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  send(@CurrentJob() job: JobContext, @Body(new ZodBodyPipe(sendSchema)) body: z.infer<typeof sendSchema>) {
    return this.chat.send(job.id, job.status, job.currentRevision, body.content);
  }
}
