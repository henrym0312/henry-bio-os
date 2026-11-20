import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerSecret } from '@/lib/env';
import { runBackfill } from '@/lib/oura/sync';
import { ALL_OURA_ENDPOINTS } from '@/lib/oura/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const backfillRequestSchema = z.object({
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD')
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD')
    .optional(),
  endpoints: z.array(z.enum(ALL_OURA_ENDPOINTS)).optional(),
});

export async function POST(req: Request) {
  const auth = verifyBearerSecret(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    let rawBody: unknown = {};
    const text = await req.text();
    if (text.trim().length > 0) {
      rawBody = JSON.parse(text);
    }

    const parsed = backfillRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid backfill payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await runBackfill({
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      endpoints: parsed.data.endpoints,
      source: 'api_backfill',
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Backfill execution failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
