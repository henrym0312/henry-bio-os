import crypto from 'node:crypto';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  OURA_CLIENT_ID: z.string().min(1, 'OURA_CLIENT_ID is required'),
  OURA_CLIENT_SECRET: z.string().min(1, 'OURA_CLIENT_SECRET is required'),
  OURA_WEBHOOK_VERIFICATION_TOKEN: z
    .string()
    .min(1, 'OURA_WEBHOOK_VERIFICATION_TOKEN is required'),
  API_SECRET: z.string().min(1, 'API_SECRET is required'),
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url('NEXT_PUBLIC_APP_URL must be a valid URL')
    .default('https://bio.henrymilner.uk'),
});

export type AppEnv = z.infer<typeof envSchema>;

/**
 * Validates and returns runtime environment variables.
 * Invoked at request/script execution time so static Next.js builds
 * do not fail when secrets are omitted from build-time environments.
 */
export function getEnv(): AppEnv {
  const parsed = envSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    OURA_CLIENT_ID: process.env.OURA_CLIENT_ID,
    OURA_CLIENT_SECRET: process.env.OURA_CLIENT_SECRET,
    OURA_WEBHOOK_VERIFICATION_TOKEN: process.env.OURA_WEBHOOK_VERIFICATION_TOKEN,
    API_SECRET: process.env.API_SECRET,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'https://bio.henrymilner.uk',
  });

  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Environment validation failed: ${missing}`);
  }

  return parsed.data;
}

/**
 * Returns the configured application base URL without a trailing slash.
 */
export function getAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? 'https://bio.henrymilner.uk';
  return raw.replace(/\/+$/, '');
}

/**
 * Constant-time string equality check using SHA-256 digests so lengths never leak.
 */
export function safeEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Verifies Authorization: Bearer ${process.env.API_SECRET} on protected API routes.
 */
export function verifyBearerSecret(req: Request): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.API_SECRET;
  if (!expected) {
    return { ok: false, status: 500, error: 'Server misconfiguration: API_SECRET is not set' };
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Missing or invalid Bearer token' };
  }

  const provided = authHeader.slice('Bearer '.length).trim();
  if (!provided || !safeEqual(provided, expected)) {
    return { ok: false, status: 401, error: 'Unauthorised' };
  }

  return { ok: true };
}
