import { eq, gte, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { lifeCaffeineLogs } from '@/db/schema';
import {
  CAFFEINE_MAX_WINDOW_HOURS,
  computeBedtimeCaffeine,
} from '@/lib/analytics/caffeine-pk';
import { toLondonDay } from '@/lib/life/helpers';
import {
  authenticateAndParseJson,
  dedupeBy,
  handleIngestFailure,
  logIngestSuccess,
  parseFlexibleTimestamp,
  sha256Short,
} from '@/lib/life/ingest';

export const dynamic = 'force-dynamic';

const caffeineLogSchema = z.object({
  id: z.string().min(1).optional(),
  mg: z.number().int().min(1).max(2000),
  source: z.string().trim().min(1).optional(),
  takenAt: z.string().min(1).optional(),
  taken_at: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
});

const caffeinePayloadSchema = z.union([
  caffeineLogSchema,
  z.object({ logs: z.array(caffeineLogSchema) }),
]);

export async function POST(req: Request) {
  const gate = await authenticateAndParseJson(req);
  if (!gate.ok) return gate.response;

  const parsed = caffeinePayloadSchema.safeParse(gate.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid caffeine payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const items = 'logs' in parsed.data ? parsed.data.logs : [parsed.data];
  const now = new Date();
  const rows: Array<{
    id: string;
    day: string;
    takenAt: Date;
    mg: number;
    source: string;
    notes: string | null;
  }> = [];

  for (const item of items) {
    const rawTs = item.takenAt ?? item.taken_at;
    const takenAt = rawTs ? parseFlexibleTimestamp(rawTs) : now;
    if (!takenAt) {
      return NextResponse.json(
        { error: `Invalid takenAt timestamp "${rawTs}"` },
        { status: 400 },
      );
    }

    const source = item.source?.trim() || 'coffee';
    const canonicalIso = takenAt.toISOString();
    const id =
      item.id ?? `caf_${sha256Short(`${canonicalIso}|${item.mg}|${source}`)}`;

    rows.push({
      id,
      day: toLondonDay(takenAt),
      takenAt,
      mg: item.mg,
      source,
      notes: item.notes?.trim() || null,
    });
  }

  try {
    const db = getDb();
    const deduped = dedupeBy(rows, (r) => r.id);

    if (deduped.length > 0) {
      await db
        .insert(lifeCaffeineLogs)
        .values(deduped)
        .onConflictDoUpdate({
          target: lifeCaffeineLogs.id,
          set: {
            day: sql`excluded.day`,
            takenAt: sql`excluded.taken_at`,
            mg: sql`excluded.mg`,
            source: sql`excluded.source`,
            notes: sql`excluded.notes`,
          },
        });
    }

    const todayDay = toLondonDay(now);
    const windowStart = new Date(
      now.getTime() - CAFFEINE_MAX_WINDOW_HOURS * 3_600_000,
    );

    const [todayRows, recentRows] = await Promise.all([
      db
        .select({ mg: lifeCaffeineLogs.mg })
        .from(lifeCaffeineLogs)
        .where(eq(lifeCaffeineLogs.day, todayDay)),
      db
        .select({
          mg: lifeCaffeineLogs.mg,
          takenAt: lifeCaffeineLogs.takenAt,
        })
        .from(lifeCaffeineLogs)
        .where(gte(lifeCaffeineLogs.takenAt, windowStart)),
    ]);

    const todayTotalMg = todayRows.reduce((sum, r) => sum + r.mg, 0);
    const estimatedBedtimeMg = computeBedtimeCaffeine(recentRows, null, now);

    await logIngestSuccess('ingest_caffeine', 'life_caffeine_logs', deduped.length);

    return NextResponse.json({
      ok: true,
      inserted: deduped.length,
      ids: deduped.map((r) => r.id),
      todayTotalMg,
      estimatedBedtimeMg,
    });
  } catch (err) {
    return handleIngestFailure(
      'ingest_caffeine',
      'life_caffeine_logs',
      err,
      'Caffeine ingestion failed',
    );
  }
}
