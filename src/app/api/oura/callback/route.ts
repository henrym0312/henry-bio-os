import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getAppUrl } from '@/lib/env';
import { exchangeOuraAuthCode } from '@/lib/oura/client';
import { recordSyncLog, runBackfill } from '@/lib/oura/sync';
import type { OuraEndpointKey } from '@/lib/oura/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const INITIAL_SYNC_ENDPOINTS: OuraEndpointKey[] = [
  'personal_info',
  'ring_configuration',
  'daily_readiness',
  'daily_sleep',
  'sleep',
  'sleep_time',
  'daily_activity',
  'daily_stress',
  'daily_resilience',
  'daily_spo2',
  'daily_cardiovascular_age',
  'vo2_max',
  'workout',
];

export async function GET(req: NextRequest) {
  const appUrl = getAppUrl();
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  if (oauthError) {
    return NextResponse.redirect(
      `${appUrl}/settings?oauth=error&reason=${encodeURIComponent(oauthError)}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${appUrl}/settings?oauth=error&reason=missing_code`,
    );
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get('oura_oauth_state')?.value;
  if (storedState && state && storedState !== state) {
    return NextResponse.redirect(
      `${appUrl}/settings?oauth=error&reason=state_mismatch`,
    );
  }

  try {
    const redirectUri = `${appUrl}/api/oura/callback`;
    await exchangeOuraAuthCode(code, redirectUri);

    await recordSyncLog({
      source: 'oauth',
      dataType: 'oauth_token',
      eventType: 'authorise',
      statusCode: 200,
      recordsProcessed: 1,
    });

    const now = new Date();
    const endDate = now.toISOString().slice(0, 10);
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - 120);
    const startDate = start.toISOString().slice(0, 10);

    await runBackfill({
      startDate,
      endDate,
      endpoints: INITIAL_SYNC_ENDPOINTS,
      source: 'oauth_initial_sync',
    }).catch(() => undefined);

    const response = NextResponse.redirect(`${appUrl}/settings?oauth=connected`);
    response.cookies.delete('oura_oauth_state');
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OAuth exchange failed';
    await recordSyncLog({
      source: 'oauth',
      dataType: 'oauth_token',
      eventType: 'authorise',
      statusCode: 500,
      recordsProcessed: 0,
      errorMessage: message,
    }).catch(() => undefined);

    return NextResponse.redirect(
      `${appUrl}/settings?oauth=error&reason=${encodeURIComponent(message)}`,
    );
  }
}
