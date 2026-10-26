import { z } from 'zod';

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value ? value : undefined));

const secret = z.string().min(32, 'must be at least 32 characters');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_ORIGIN: z
    .string()
    .default('http://localhost:3000')
    .transform((value) => value.split(',').map((origin) => origin.trim())),
  PUBLIC_API_BASE_URL: z.string().url().default('http://localhost:4000'),
  STORAGE_ROOT: z.string().default('./storage'),

  DRAFT_TTL_HOURS: z.coerce.number().positive().default(2),
  JOB_TTL_HOURS: z.coerce.number().positive().default(48),
  RAW_FILE_TTL_HOURS: z.coerce.number().positive().default(24),

  ANTHROPIC_API_KEY: optionalString,
  CHAT_MODEL: z.string().default('claude-opus-5-5'),

  N8N_BASE_URL: optionalString,
  N8N_EXTRACT_PATH: z.string().default('/webhook/mp-extract'),
  N8N_INBOUND_KEY: optionalString,
  EXTRACTION_MODEL: z.string().default('claude-opus-5-5'),

  N8N_REQUEST_SECRET: secret,
  N8N_CALLBACK_SECRET: secret,
  N8N_FILE_URL_SECRET: secret,
  DOWNLOAD_TOKEN_SECRET: secret,
});

export type AppConfig = z.infer<typeof envSchema>;

/** Validates the environment once at boot; a bad config stops the app instead of failing later. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
