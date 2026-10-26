import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** 256-bit random token, URL-safe. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hmacHex(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Constant-time comparison of two hex/ASCII strings. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Self-contained signed token: `<base64url(json payload)>.<hmac>`.
 * Used for download links and n8n file URLs, which must work without the job token.
 */
export function signToken(secret: string, payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${hmacHex(secret, body)}`;
}

export function verifyToken<T extends { exp: number }>(secret: string, token: string): T | null {
  const [body, signature] = token.split('.');
  if (!body || !signature || !safeEqual(signature, hmacHex(secret, body))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
    return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now() ? payload : null;
  } catch {
    return null;
  }
}
