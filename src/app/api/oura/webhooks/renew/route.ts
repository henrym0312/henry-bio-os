import { NextResponse } from 'next/server';
import { safeEqual, verifyBearerSecret } from '@/lib/env';
import { renewAllOuraWebhooks } from '@/lib/oura/webhooks';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function verifyRenewalAuth(req: Request): { ok: true } | { ok: false; status: number; error: string } {
  const bearerCheck = verifyBearerSecret(req);
  if (bearerCheck.ok) {
    return bearerCheck;
  }

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (cronSecret && authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (safeEqual(token, cronSecret)) {
      return { ok: true };
    }
  }

  return bearerCheck;
}

async function handleRenew(req: Request) {
  const auth = verifyRenewalAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const result = await renewAllOuraWebhooks();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook renewal failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  return handleRenew(req);
}

/**
 * Supports daily Vercel Cron invocations (`GET`).
 */
export async function GET(req: Request) {
  return handleRenew(req);
}
