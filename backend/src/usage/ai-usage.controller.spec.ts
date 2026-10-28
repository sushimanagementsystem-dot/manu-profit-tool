import type { AppConfig } from '../config/env.schema';
import type { JobContext } from '../jobs/job-access.guard';
import { AiUsageController } from './ai-usage.controller';
import type { AiUsageService } from './ai-usage.service';

const job = { id: 'job-1' } as JobContext;
const summary = {
  extraction: { calls: 1, inputTokens: 10, outputTokens: 5, costUsd: '0.0728' },
  chat: { calls: 2, inputTokens: 20, outputTokens: 5, costUsd: '0.0400' },
  totalUsd: '0.1128',
};

function controller(show: boolean) {
  const service = { summary: jest.fn().mockResolvedValue(summary) };
  return {
    service,
    controller: new AiUsageController(
      { SHOW_AI_COST: show } as AppConfig,
      service as unknown as AiUsageService,
    ),
  };
}

describe('GET /jobs/:id/ai-usage', () => {
  it('returns nothing at all, not zeros, when the cost is switched off', async () => {
    const { controller: off, service } = controller(false);
    await expect(off.get(job)).resolves.toEqual({ enabled: false });
    expect(service.summary).not.toHaveBeenCalled();
  });

  it('returns the cost, in dollars and with its caveat, when it is switched on', async () => {
    const { controller: on } = controller(true);
    const body = await on.get(job);
    expect(body).toMatchObject({
      enabled: true,
      totalUsd: '0.1128',
      currency: 'USD',
    });
    expect((body as { note: string }).note).toMatch(
      /invoice is the source of truth/,
    );
  });
});
