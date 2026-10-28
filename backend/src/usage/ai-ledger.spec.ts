import { addCall, emptyLedger, ledgerOf, summarize } from './ai-ledger';
import { priceFor } from './ai-pricing';

describe('what the AI calls cost', () => {
  it('prices the three chat calls of a real live question, cache reads at a tenth', () => {
    // From the live backend's log: Sonnet 5.5, 6,868 tokens read from the prompt cache each time.
    // 246×$2 + 76×$10 + 6868×$0.2 per million = $0.0026256, and so on for the other two calls.
    let ledger = emptyLedger();
    for (const call of [
      { input: 246, output: 76, cacheRead: 6868 },
      { input: 1048, output: 155, cacheRead: 6868 },
      { input: 1305, output: 211, cacheRead: 6868 },
    ]) {
      ledger = addCall(ledger, 'chat', 'claude-sonnet-5-5', call);
    }
    const { chat, totalUsd } = summarize(ledger);
    expect(chat.calls).toBe(3);
    expect(chat.costUsd).toBe('0.0137');
    expect(totalUsd).toBe('0.0137');
  });

  it('prices reading two documents on Opus 5.5 at the figure measured by hand', () => {
    // 7,374 in × $4 + 2,167 out × $20 per million = $0.0728.
    const ledger = addCall(emptyLedger(), 'extraction', 'claude-opus-5-5', {
      input: 7374,
      output: 2167,
    });
    expect(summarize(ledger).extraction.costUsd).toBe('0.0728');
  });

  it('charges 25 % more to write the prompt cache', () => {
    const ledger = addCall(emptyLedger(), 'chat', 'claude-sonnet-5-5', {
      cacheWrite: 1_000_000,
    });
    expect(summarize(ledger).chat.costUsd).toBe('2.5000');
  });

  it('adds extraction and chat into one total', () => {
    let ledger = addCall(emptyLedger(), 'extraction', 'claude-opus-5-5', {
      input: 1_000_000,
    });
    ledger = addCall(ledger, 'chat', 'claude-sonnet-5-5', { output: 100_000 });
    expect(summarize(ledger)).toMatchObject({ totalUsd: '5.0000' }); // $4.00 + $1.00
  });

  it('says the cost is unknown, rather than guessing, for a model it has no price for', () => {
    const ledger = addCall(emptyLedger(), 'chat', 'claude-something-new', {
      input: 1000,
      output: 1000,
    });
    const summary = summarize(ledger);
    expect(summary.chat.costUsd).toBeNull();
    expect(summary.totalUsd).toBeNull();
    expect(summary.chat.calls).toBe(1); // what is known is still reported
  });

  it('counts a dated snapshot as its family, and nothing as zero cost', () => {
    expect(priceFor('claude-sonnet-5-5-20261001')).toEqual({
      input: 2,
      output: 10,
    });
    expect(priceFor('claude-sonnet-5')).toBeNull();
    expect(summarize(emptyLedger())).toMatchObject({
      totalUsd: '0.0000',
      chat: { calls: 0, costUsd: '0.0000' },
    });
  });

  it('keeps each model apart, so a fallback model is priced as itself', () => {
    let ledger = addCall(emptyLedger(), 'chat', 'claude-sonnet-5-5', {
      input: 1_000_000,
    });
    ledger = addCall(ledger, 'chat', 'claude-opus-5-5', { input: 1_000_000 });
    expect(summarize(ledger).chat.costUsd).toBe('6.0000'); // $2 + $4
  });

  it('reads a job that predates the ledger as empty, and never changes the ledger it was given', () => {
    expect(ledgerOf({ inputTokens: 5, calls: 1 })).toEqual(emptyLedger());
    expect(ledgerOf(null)).toEqual(emptyLedger());
    const before = emptyLedger();
    addCall(before, 'chat', 'claude-sonnet-5-5', { input: 10 });
    expect(before).toEqual(emptyLedger());
  });
});
