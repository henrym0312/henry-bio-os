import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getEnv, safeEqual } from '@/lib/env';
import { OuraApiError } from '@/lib/oura/client';
import {
  deleteOuraRecord,
  recordSyncLog,
  syncPiggybackTimeSeries,
  syncSingleOuraDocument,
} from '@/lib/oura/sync';
import { EXT_API_V2_DATA_TYPES, WEBHOOK_OPERATIONS } from '@/lib/oura/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const webhookPayloadSchema = z.object({
  event_type: z.enum(WEBHOOK_OPERATIONS),
  data_type: z.enum(EXT_API_V2_DATA_TYPES),
  object_id: z.string().min(1),
  event_time: z.string().optional(),
  user_id: z.string().optional(),
});

function verifyOuraSignature(
  signatureHeader: string | null,
  timestampHeader: string | null,
  rawBody: string,
  parsedBody: unknown,
  clientSecret: string,
): boolean {
  if (!signatureHeader || !timestampHeader) {
    return false;
  }

  const receivedUpper = signatureHeader.trim().toUpperCase();
  const rawDigest = crypto
    .createHmac('sha256', clientSecret)
    .update(`${timestampHeader}${rawBody}`)
    .digest('hex')
    .toUpperCase();

  if (safeEqual(receivedUpper, rawDigest)) {
    return true;
  }

  const canonicalDigest = crypto
    .createHmac('sha256', clientSecret)
    .update(`${timestampHeader}${JSON.stringify(parsedBody)}`)
    .digest('hex')
    .toUpperCase();

  return safeEqual(receivedUpper, canonicalDigest);
}

/**
 * Handles Oura's webhook verification challenge.
 */
export async function GET(req: NextRequest) {
  const env = getEnv();
  const url = new URL(req.url);
  const verificationToken = url.searchParams.get('verification_token') ?? '';
  const challenge = url.searchParams.get('challenge');

  if (!challenge || !safeEqual(verificationToken, env.OURA_WEBHOOK_VERIFICATION_TOKEN)) {
    return NextResponse.json({ error: 'Invalid verification token' }, { status: 401 });
  }

  return NextResponse.json({ challenge }, { status: 200 });
}

/**
 * Receives real-time Oura webhook notifications for all 16 supported data types.
 * Fetches the updated document by `object_id`, upserts idempotently, and triggers
 * piggyback 24h sync for `heartrate` and `ring_battery_level` on `sleep`/`daily_activity`.
 */
export async function POST(req: NextRequest) {
  const env = getEnv();
  const rawBody = await req.text();

  let jsonBody: unknown;
  try {
    jsonBody = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const signature = req.headers.get('x-oura-signature');
  const timestamp = req.headers.get('x-oura-timestamp');

  if (
    !verifyOuraSignature(
      signature,
      timestamp,
      rawBody,
      jsonBody,
      env.OURA_CLIENT_SECRET,
    )
  ) {
    await recordSyncLog({
      source: 'webhook',
      dataType: 'unknown',
      statusCode: 401,
      recordsProcessed: 0,
      errorMessage: 'Invalid Oura HMAC signature',
    }).catch(() => undefined);

    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  const parsed = webhookPayloadSchema.safeParse(jsonBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Unsupported webhook payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { event_type, data_type, object_id } = parsed.data;

  try {
    let recordsProcessed = 0;

    if (event_type === 'delete') {
      recordsProcessed = await deleteOuraRecord(data_type, object_id);
    } else {
      recordsProcessed = await syncSingleOuraDocument(data_type, object_id);
    }

    await recordSyncLog({
      source: 'webhook',
      dataType: data_type,
      eventType: event_type,
      objectId: object_id,
      statusCode: 200,
      recordsProcessed,
    });

    let piggyback: { heartrateCount: number; batteryCount: number } | undefined;
    if (
      event_type !== 'delete' &&
      (data_type === 'sleep' || data_type === 'daily_activity')
    ) {
      piggyback = await syncPiggybackTimeSeries(24);
    }

    return NextResponse.json({
      ok: true,
      event_type,
      data_type,
      object_id,
      recordsProcessed,
      piggyback,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const statusCode = err instanceof OuraApiError ? err.status : 500;

    await recordSyncLog({
      source: 'webhook',
      dataType: data_type,
      eventType: event_type,
      objectId: object_id,
      statusCode,
      recordsProcessed: 0,
      errorMessage: message,
    }).catch(() => undefined);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
