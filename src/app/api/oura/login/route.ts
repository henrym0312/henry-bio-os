import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAppUrl } from '@/lib/env';
import { OURA_AUTHORIZE_URL, OURA_OAUTH_SCOPES } from '@/lib/oura/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const clientId = process.env.OURA_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: 'OURA_CLIENT_ID is not configured' },
      { status: 500 },
    );
  }

  const state = crypto.randomBytes(24).toString('hex');
  const redirectUri = `${getAppUrl()}/api/oura/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: OURA_OAUTH_SCOPES.join(' '),
    state,
  });

  const response = NextResponse.redirect(`${OURA_AUTHORIZE_URL}?${params.toString()}`);
  response.cookies.set('oura_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  return response;
}
