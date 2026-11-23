import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerSecret } from '@/lib/env';
import { recordSyncLog } from '@/lib/oura/sync';

export const isoDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD date string');

export function sha256Short(input: string, length = 24): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, length);
}

/**
 * Parses ISO-8601 strings as well as space-separated timestamps such as
 * Health Auto Export's "2026-11-23 14:00:00 +0000" format.
 */
export function parseFlexibleTimestamp(raw?: string | null): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let normalized = trimmed;
  const haeMatch = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+([+-]\d{4})$/.exec(
    trimmed,
  );
  if (haeMatch) {
    const offset = `${haeMatch[3].slice(0, 3)}:${haeMatch[3].slice(3)}`;
    normalized = `${haeMatch[1]}T${haeMatch[2]}${offset}`;
  } else if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(trimmed)) {
    normalized = trimmed.replace(' ', 'T');
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function authenticateAndParseJson(
  req: Request,
): Promise<
  | { ok: true; body: unknown }
  | { ok: false; response: NextResponse }
> {
  const auth = verifyBearerSecret(req);
  if (!auth.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: auth.error }, { status: auth.status }),
    };
  }

  try {
    const body = await req.json();
    return { ok: true, body };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 }),
    };
  }
}

export async function logIngestSuccess(
  source: string,
  dataType: string,
  recordsProcessed: number,
): Promise<void> {
  await recordSyncLog({
    source,
    dataType,
    statusCode: 200,
    recordsProcessed,
  });
}

export async function handleIngestFailure(
  source: string,
  dataType: string,
  err: unknown,
  fallbackMessage: string,
): Promise<NextResponse> {
  const message = err instanceof Error ? err.message : fallbackMessage;
  await recordSyncLog({
    source,
    dataType,
    statusCode: 500,
    recordsProcessed: 0,
    errorMessage: message,
  }).catch(() => undefined);

  return NextResponse.json({ error: message }, { status: 500 });
}

export function dedupeBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(keyFn(item), item);
  }
  return Array.from(map.values());
}
