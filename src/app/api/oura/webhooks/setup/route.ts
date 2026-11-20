import { NextResponse } from 'next/server';
import { verifyBearerSecret } from '@/lib/env';
import { setupAllOuraWebhooks } from '@/lib/oura/webhooks';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: Request) {
  const auth = verifyBearerSecret(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const result = await setupAllOuraWebhooks();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook setup failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
