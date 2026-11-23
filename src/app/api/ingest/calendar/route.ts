import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { lifeCalendarDaily } from '@/db/schema';
import {
  authenticateAndParseJson,
  dedupeBy,
  handleIngestFailure,
  isoDaySchema,
  logIngestSuccess,
} from '@/lib/life/ingest';

export const dynamic = 'force-dynamic';

const calendarRowSchema = z.object({
  day: isoDaySchema,
  eventCount: z.number().int().min(0).optional(),
  calendarEventCount: z.number().int().min(0).optional(),
  calendar_event_count: z.number().int().min(0).optional(),
  scheduledMins: z.number().int().min(0).optional(),
  calendarScheduledMins: z.number().int().min(0).optional(),
  calendar_scheduled_mins: z.number().int().min(0).optional(),
  earlyStart: z.boolean().optional(),
  calendarEarlyStart: z.boolean().optional(),
  calendar_early_start: z.boolean().optional(),
  latestEndHour: z.number().finite().min(0).max(24).nullable().optional(),
  calendarLatestEndHour: z.number().finite().min(0).max(24).nullable().optional(),
  calendar_latest_end_hour: z.number().finite().min(0).max(24).nullable().optional(),
});

const calendarPayloadSchema = z.union([
  calendarRowSchema,
  z.object({ rows: z.array(calendarRowSchema) }),
]);

export async function POST(req: Request) {
  const gate = await authenticateAndParseJson(req);
  if (!gate.ok) return gate.response;

  const parsed = calendarPayloadSchema.safeParse(gate.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid calendar payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const items = 'rows' in parsed.data ? parsed.data.rows : [parsed.data];
  if (items.length === 0) {
    return NextResponse.json({ ok: true, recordsProcessed: 0, days: [] });
  }

  try {
    const now = new Date();
    const mapped = dedupeBy(
      items.map((item) => ({
        day: item.day,
        calendarEventCount:
          item.calendarEventCount ?? item.calendar_event_count ?? item.eventCount ?? 0,
        calendarScheduledMins:
          item.calendarScheduledMins ??
          item.calendar_scheduled_mins ??
          item.scheduledMins ??
          0,
        calendarEarlyStart:
          item.calendarEarlyStart ??
          item.calendar_early_start ??
          item.earlyStart ??
          false,
        calendarLatestEndHour:
          item.calendarLatestEndHour ??
          item.calendar_latest_end_hour ??
          item.latestEndHour ??
          null,
        updatedAt: now,
      })),
      (r) => r.day,
    );

    const db = getDb();
    await db
      .insert(lifeCalendarDaily)
      .values(mapped)
      .onConflictDoUpdate({
        target: lifeCalendarDaily.day,
        set: {
          calendarEventCount: sql`excluded.calendar_event_count`,
          calendarScheduledMins: sql`excluded.calendar_scheduled_mins`,
          calendarEarlyStart: sql`excluded.calendar_early_start`,
          calendarLatestEndHour: sql`excluded.calendar_latest_end_hour`,
          updatedAt: sql`excluded.updated_at`,
        },
      });

    await logIngestSuccess('ingest_calendar', 'life_calendar_daily', mapped.length);

    return NextResponse.json({
      ok: true,
      recordsProcessed: mapped.length,
      days: mapped.map((r) => r.day),
    });
  } catch (err) {
    return handleIngestFailure(
      'ingest_calendar',
      'life_calendar_daily',
      err,
      'Calendar ingestion failed',
    );
  }
}
