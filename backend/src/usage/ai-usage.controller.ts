import { Controller, Get, UseGuards } from '@nestjs/common';

import type { AppConfig } from '../config/env.schema';
import { InjectConfig } from '../config/config.module';
import {
  CurrentJob,
  JobAccessGuard,
  type JobContext,
} from '../jobs/job-access.guard';
import { AiUsageService } from './ai-usage.service';

/**
 * What the AI calls of one analysis cost. Switched off unless `SHOW_AI_COST=true`: it exists so a
 * client testing the product can see what Claude costs per analysis, and it is meant to be turned
 * off, or deleted along with the card that shows it, before the product is public.
 */
@Controller('jobs/:jobId/ai-usage')
@UseGuards(JobAccessGuard)
export class AiUsageController {
  constructor(
    @InjectConfig() private readonly config: AppConfig,
    private readonly usage: AiUsageService,
  ) {}

  @Get()
  async get(@CurrentJob() job: JobContext) {
    // Off means nothing at all is returned, not zeros: the figures are not for every client.
    if (!this.config.SHOW_AI_COST) return { enabled: false as const };
    return {
      enabled: true as const,
      ...(await this.usage.summary(job.id)),
      currency: 'USD',
      note: "An estimate from token counts at Anthropic's list prices. Anthropic's own invoice is the source of truth.",
    };
  }
}
