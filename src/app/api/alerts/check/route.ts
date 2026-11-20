import { NextResponse } from 'next/server';
import { evaluateAlerts } from '@/lib/analytics/alerts';
import { verifyBearerSecret } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = verifyBearerSecret(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const result = await evaluateAlerts();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Alert check failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
