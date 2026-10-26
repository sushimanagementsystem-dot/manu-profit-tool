export type N8nConfig = {
  webhookUrl: string;
  webhookSecret: string;
  callbackSecret: string;
};

/**
 * Reads the n8n integration env vars. Returns null (never throws) when any
 * are missing, so callers can fail a single audit gracefully instead of
 * crashing the route — see app/api/audits/route.ts.
 */
export function getN8nConfig(): N8nConfig | null {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET;
  const callbackSecret = process.env.N8N_CALLBACK_SECRET;

  if (!webhookUrl || !webhookSecret || !callbackSecret) {
    return null;
  }

  return { webhookUrl, webhookSecret, callbackSecret };
}
