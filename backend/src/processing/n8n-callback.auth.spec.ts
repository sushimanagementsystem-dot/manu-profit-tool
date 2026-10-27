import { hmacHex } from '../common/crypto';
import { assertCallbackAuthentic, type CallbackAuthConfig } from './callback-auth';

/**
 * The callback endpoint takes either a signed body or a shared key, and the shared key only
 * counts when one is configured. Getting that wrong would let an unauthenticated POST write
 * extraction results into a job, so each branch is pinned here.
 */
const CALLBACK_SECRET = 'callback-secret';
const CALLBACK_KEY = 'callback-key';

const authenticatorFor = (config: Pick<CallbackAuthConfig, 'callbackKey'>) =>
  (
    rawBody: string,
    timestamp: string | undefined,
    signature: string | undefined,
    callbackKey: string | undefined,
  ) =>
    assertCallbackAuthentic(
      rawBody,
      { timestamp, signature, callbackKey },
      { callbackSecret: CALLBACK_SECRET, ...config },
    );

const body = JSON.stringify({ schemaVersion: '1', taskId: 'abc', attempt: 1, status: 'SUCCEEDED' });
const now = () => Math.floor(Date.now() / 1000).toString();
const sign = (timestamp: string, raw: string) =>
  `sha256=${hmacHex(CALLBACK_SECRET, `${timestamp}.${raw}`)}`;

describe('n8n callback authentication', () => {
  describe('with no shared key configured', () => {
    const authenticate = authenticatorFor({ callbackKey: undefined });

    it('accepts a correctly signed body', () => {
      const timestamp = now();
      expect(() => authenticate(body, timestamp, sign(timestamp, body), undefined)).not.toThrow();
    });

    it('rejects a signature over a different body', () => {
      const timestamp = now();
      const signature = sign(timestamp, body);
      expect(() => authenticate(`${body} `, timestamp, signature, undefined)).toThrow();
    });

    it('rejects a signature outside the clock-skew window', () => {
      const stale = String(Number(now()) - 600);
      expect(() => authenticate(body, stale, sign(stale, body), undefined)).toThrow();
    });

    it('rejects a request carrying no proof at all', () => {
      expect(() => authenticate(body, undefined, undefined, undefined)).toThrow();
    });

    it('rejects a shared key, because none is configured', () => {
      expect(() => authenticate(body, undefined, undefined, CALLBACK_KEY)).toThrow();
    });
  });

  describe('with a shared key configured', () => {
    const authenticate = authenticatorFor({ callbackKey: CALLBACK_KEY });

    it('accepts the shared key', () => {
      expect(() => authenticate(body, undefined, undefined, CALLBACK_KEY)).not.toThrow();
    });

    it('rejects a wrong shared key', () => {
      expect(() => authenticate(body, undefined, undefined, 'not-the-key')).toThrow();
    });

    it('rejects a shared key that is a prefix of the real one', () => {
      expect(() => authenticate(body, undefined, undefined, CALLBACK_KEY.slice(0, -1))).toThrow();
    });

    it('still accepts a correctly signed body', () => {
      const timestamp = now();
      expect(() => authenticate(body, timestamp, sign(timestamp, body), undefined)).not.toThrow();
    });

    it('rejects a bad signature even when a valid shared key is also sent', () => {
      // A present signature is the claim being made; a valid key alongside it must not rescue it.
      const timestamp = now();
      expect(() => authenticate(body, timestamp, 'sha256=00', CALLBACK_KEY)).toThrow();
    });
  });
});
