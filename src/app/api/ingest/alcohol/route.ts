import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { lifeAlcoholLogs } from '@/db/schema';
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

const alcoholLogSchema = z.object({
  id: z.string().min(1).optional(),
  units: z.number().positive().max(100),
  drinkType: z.string().trim().min(1).optional(),
  drink_type: z.string().trim().min(1).optional(),
  loggedAt: z.string().min(1).optional(),
  logged_at: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
});

const alcoholPayloadSchema = z.union([
  alcoholLogSchema,
  z.object({ logs: z.array(alcoholLogSchema) }),
]);

export async function POST(req: Request) {
  const gate = await authenticateAndParseJson(req);
  if (!gate.ok) return gate.response;

  const parsed = alcoholPayloadSchema.safeParse(gate.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid alcohol payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const items = 'logs' in parsed.data ? parsed.data.logs : [parsed.data];
  if (items.length === 0) {
    return NextResponse.json({ ok: true, recordsProcessed: 0, ids: [] });
  }

  const now = new Date();
  const rows: Array<{
    id: string;
    day: string;
    loggedAt: Date;
    units: number;
    drinkType: string;
    notes: string | null;
  }> = [];

  for (const item of items) {
    const rawTs = item.loggedAt ?? item.logged_at;
    const loggedAt = rawTs ? parseFlexibleTimestamp(rawTs) : now;
    if (!loggedAt) {
      return NextResponse.json(
        { error: `Invalid loggedAt timestamp "${rawTs}"` },
        { status: 400 },
      );
    }

    const drinkType = (item.drinkType ?? item.drink_type)?.trim() || 'other';
    const units = Math.round(item.units * 100) / 100;
    const id =
      item.id ??
      `alc_${sha256Short(`${loggedAt.toISOString()}|${units}|${drinkType}`)}`;

    // Assign 00:00-04:59 drinks to the previous calendar night's logical day.
    rows.push({
      id,
      day: toLondonDay(loggedAt, 5),
      loggedAt,
      units,
      drinkType,
      notes: item.notes?.trim() || null,
    });
  }

  try {
    const deduped = dedupeBy(rows, (r) => r.id);
    const db = getDb();

    await db
      .insert(lifeAlcoholLogs)
      .values(deduped)
      .onConflictDoUpdate({
        target: lifeAlcoholLogs.id,
        set: {
          day: sql`excluded.day`,
          loggedAt: sql`excluded.logged_at`,
          units: sql`excluded.units`,
          drinkType: sql`excluded.drink_type`,
          notes: sql`excluded.notes`,
        },
      });

    await logIngestSuccess('ingest_alcohol', 'life_alcohol_logs', deduped.length);

    return NextResponse.json({
      ok: true,
      recordsProcessed: deduped.length,
      ids: deduped.map((r) => r.id),
      days: Array.from(new Set(deduped.map((r) => r.day))),
    });
  } catch (err) {
    return handleIngestFailure(
      'ingest_alcohol',
      'life_alcohol_logs',
      err,
      'Alcohol ingestion failed',
    );
  }
}
