import { and, desc, eq, gte, isNotNull, lt, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { lifeCommuteEvents, lifePresenceDaily } from '@/db/schema';
import { toLondonDay } from '@/lib/life/helpers';
import {
  authenticateAndParseJson,
  handleIngestFailure,
  isoDaySchema,
  logIngestSuccess,
  parseFlexibleTimestamp,
  sha256Short,
} from '@/lib/life/ingest';

export const dynamic = 'force-dynamic';

const sleepLocationEnum = z.enum(['durham_flat', 'yorkshire_home', 'away', 'unknown']);

const carplayEventSchema = z
  .object({
    id: z.string().min(1).optional(),
    eventType: z.enum(['carplay_connect', 'carplay_disconnect']).optional(),
    event_type: z.enum(['carplay_connect', 'carplay_disconnect']).optional(),
    occurredAt: z.string().min(1).optional(),
    occurred_at: z.string().min(1).optional(),
  })
  .refine((v) => Boolean(v.eventType ?? v.event_type), {
    message: 'eventType is required for CarPlay events',
  });

const dailyPresenceSchema = z.object({
  day: isoDaySchema,
  hoursAtHome: z.number().finite().min(0).max(24).nullable().optional(),
  hours_at_home: z.number().finite().min(0).max(24).nullable().optional(),
  firstDepartureAt: z.string().nullable().optional(),
  first_departure_at: z.string().nullable().optional(),
  lastReturnAt: z.string().nullable().optional(),
  last_return_at: z.string().nullable().optional(),
  sleepLocation: sleepLocationEnum.optional(),
  sleep_location: sleepLocationEnum.optional(),
});

export async function POST(req: Request) {
  const gate = await authenticateAndParseJson(req);
  if (!gate.ok) return gate.response;

  const now = new Date();
  const carplayParsed = carplayEventSchema.safeParse(gate.body);

  if (carplayParsed.success) {
    const eventType = (carplayParsed.data.eventType ?? carplayParsed.data.event_type)!;
    const rawTs = carplayParsed.data.occurredAt ?? carplayParsed.data.occurred_at;
    const occurredAt = rawTs ? parseFlexibleTimestamp(rawTs) : now;
    if (!occurredAt) {
      return NextResponse.json(
        { error: `Invalid occurredAt timestamp "${rawTs}"` },
        { status: 400 },
      );
    }

    const day = toLondonDay(occurredAt);
    const id =
      carplayParsed.data.id ??
      `cp_${sha256Short(`${eventType}|${occurredAt.toISOString()}`)}`;

    try {
      const db = getDb();
      let durationMins: number | null = null;

      if (eventType === 'carplay_disconnect') {
        const sixHoursPrior = new Date(occurredAt.getTime() - 6 * 3_600_000);
        const recentConnect = await db
          .select({ occurredAt: lifeCommuteEvents.occurredAt })
          .from(lifeCommuteEvents)
          .where(
            and(
              eq(lifeCommuteEvents.eventType, 'carplay_connect'),
              lt(lifeCommuteEvents.occurredAt, occurredAt),
              gte(lifeCommuteEvents.occurredAt, sixHoursPrior),
            ),
          )
          .orderBy(desc(lifeCommuteEvents.occurredAt))
          .limit(1);

        if (recentConnect.length > 0) {
          const diffMins = Math.round(
            (occurredAt.getTime() - recentConnect[0].occurredAt.getTime()) / 60_000,
          );
          durationMins = Math.min(360, Math.max(1, diffMins));
        }
      }

      await db
        .insert(lifeCommuteEvents)
        .values({
          id,
          day,
          eventType,
          occurredAt,
          durationMins,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: lifeCommuteEvents.id,
          set: {
            day: sql`excluded.day`,
            eventType: sql`excluded.event_type`,
            occurredAt: sql`excluded.occurred_at`,
            durationMins: sql`excluded.duration_mins`,
          },
        });

      let driveMins: number | undefined;
      let driveTrips: number | undefined;

      if (eventType === 'carplay_disconnect') {
        const totals = await db
          .select({
            driveMins: sql<number>`COALESCE(SUM(${lifeCommuteEvents.durationMins}), 0)::int`,
            driveTrips: sql<number>`COUNT(*)::int`,
          })
          .from(lifeCommuteEvents)
          .where(
            and(
              eq(lifeCommuteEvents.day, day),
              eq(lifeCommuteEvents.eventType, 'carplay_disconnect'),
              isNotNull(lifeCommuteEvents.durationMins),
            ),
          );

        driveMins = totals[0]?.driveMins ?? 0;
        driveTrips = totals[0]?.driveTrips ?? 0;

        await db
          .insert(lifePresenceDaily)
          .values({
            day,
            driveMins,
            driveTrips,
            sleepLocation: 'unknown',
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: lifePresenceDaily.day,
            set: {
              driveMins: sql`excluded.drive_mins`,
              driveTrips: sql`excluded.drive_trips`,
              updatedAt: sql`excluded.updated_at`,
            },
          });
      }

      await logIngestSuccess('ingest_presence', 'life_commute_events', 1);

      return NextResponse.json({
        ok: true,
        mode: 'carplay_event',
        id,
        day,
        eventType,
        durationMins,
        driveMins,
        driveTrips,
      });
    } catch (err) {
      return handleIngestFailure(
        'ingest_presence',
        'life_commute_events',
        err,
        'Presence CarPlay event ingestion failed',
      );
    }
  }

  const dailyParsed = dailyPresenceSchema.safeParse(gate.body);
  if (!dailyParsed.success) {
    return NextResponse.json(
      { error: 'Invalid presence payload', details: dailyParsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = dailyParsed.data;
  const rawFirstDep =
    d.firstDepartureAt !== undefined ? d.firstDepartureAt : d.first_departure_at;
  const rawLastRet =
    d.lastReturnAt !== undefined ? d.lastReturnAt : d.last_return_at;

  const firstDepartureAt =
    rawFirstDep === undefined || rawFirstDep === null
      ? null
      : parseFlexibleTimestamp(rawFirstDep);
  if (rawFirstDep && !firstDepartureAt) {
    return NextResponse.json(
      { error: `Invalid firstDepartureAt timestamp "${rawFirstDep}"` },
      { status: 400 },
    );
  }

  const lastReturnAt =
    rawLastRet === undefined || rawLastRet === null
      ? null
      : parseFlexibleTimestamp(rawLastRet);
  if (rawLastRet && !lastReturnAt) {
    return NextResponse.json(
      { error: `Invalid lastReturnAt timestamp "${rawLastRet}"` },
      { status: 400 },
    );
  }

  const hoursAtHome = d.hoursAtHome ?? d.hours_at_home ?? null;
  const explicitSleepLocation = d.sleepLocation ?? d.sleep_location;

  try {
    const db = getDb();
    await db
      .insert(lifePresenceDaily)
      .values({
        day: d.day,
        hoursAtHome,
        firstDepartureAt,
        lastReturnAt,
        sleepLocation: explicitSleepLocation ?? 'unknown',
        driveMins: 0,
        driveTrips: 0,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: lifePresenceDaily.day,
        set: {
          hoursAtHome: sql`COALESCE(excluded.hours_at_home, ${lifePresenceDaily.hoursAtHome})`,
          firstDepartureAt: sql`COALESCE(excluded.first_departure_at, ${lifePresenceDaily.firstDepartureAt})`,
          lastReturnAt: sql`COALESCE(excluded.last_return_at, ${lifePresenceDaily.lastReturnAt})`,
          sleepLocation: explicitSleepLocation
            ? sql`excluded.sleep_location`
            : lifePresenceDaily.sleepLocation,
          updatedAt: sql`excluded.updated_at`,
        },
      });

    await logIngestSuccess('ingest_presence', 'life_presence_daily', 1);

    return NextResponse.json({
      ok: true,
      mode: 'daily_summary',
      recordsProcessed: 1,
      day: d.day,
    });
  } catch (err) {
    return handleIngestFailure(
      'ingest_presence',
      'life_presence_daily',
      err,
      'Presence summary ingestion failed',
    );
  }
}
