import { NextResponse } from 'next/server';
import { generateAndSaveDiagnosticBriefing } from '@/lib/analytics/briefing';
import { verifyBearerSecret } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = verifyBearerSecret(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const briefing = await generateAndSaveDiagnosticBriefing();
    return NextResponse.json({ ok: true, briefing });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to generate AI diagnostic briefing';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
