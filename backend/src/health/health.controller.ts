import { Controller, Get } from '@nestjs/common';

import { ClaudeClient } from '../chat/claude.client';
import { N8nClient } from '../extraction/n8n.client';
import { PrismaService } from '../prisma/prisma.service';

/** Liveness and capability check. Reports no counts, names or secrets. */
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly n8n: N8nClient,
    private readonly claude: ClaudeClient,
  ) {}

  @Get()
  async check() {
    let database = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      features: {
        aiExtraction: this.n8n.isConfigured,
        assistant: this.claude.isConfigured,
      },
    };
  }
}
