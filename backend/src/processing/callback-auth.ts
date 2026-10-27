import { hmacHex, safeEqual } from '../common/crypto';
import { Problems } from '../common/problem';

/** How far a signed callback's timestamp may be from ours before it is treated as a replay. */
export const MAX_CLOCK_SKEW_SECONDS = 300;

export type CallbackProof = {
  timestamp?: string;
  signature?: string;
  callbackKey?: string;
};

export type CallbackAuthConfig = {
  callbackSecret: string;
  /** Set only on a host where n8n cannot sign the body — see n8n/README.md. */
  callbackKey?: string;
};

/**
 * Decides whether an n8n callback may be acted on. There are two ways to prove it.
 *
 * Signing the body is the stronger one and stays the default. The shared key exists for an
 * n8n host where a Code node cannot read a secret: there the key travels as a header from
 * n8n's own encrypted credential store, which keeps it out of the workflow and out of Git.
 * What that gives up is body integrity, so it only works once a key is configured, and it
 * leans on the checks that follow it: the result is validated against its schema, and a
 * callback is only acted on while its task is DISPATCHED on the same attempt.
 *
 * A present signature is the claim being made, so a bad one fails even if a valid key is
 * sent alongside it — otherwise the weaker proof would quietly override the stronger one.
 */
export function assertCallbackAuthentic(
  rawBody: string,
  proof: CallbackProof,
  config: CallbackAuthConfig,
): void {
  if (proof.signature) {
    const seconds = Number(proof.timestamp);
    if (!Number.isFinite(seconds)) throw Problems.unauthorized();
    if (Math.abs(Date.now() / 1000 - seconds) > MAX_CLOCK_SKEW_SECONDS) {
      throw Problems.unauthorized();
    }
    const expected = `sha256=${hmacHex(config.callbackSecret, `${proof.timestamp}.${rawBody}`)}`;
    if (!safeEqual(proof.signature, expected)) throw Problems.unauthorized();
    return;
  }

  if (!config.callbackKey || !proof.callbackKey || !safeEqual(proof.callbackKey, config.callbackKey)) {
    throw Problems.unauthorized();
  }
}
