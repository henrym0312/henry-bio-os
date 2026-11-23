import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { lifeAcousticHealthDaily } from '@/db/schema';
import { toLondonDay } from '@/lib/life/helpers';
import {
  authenticateAndParseJson,
  dedupeBy,
  handleIngestFailure,
  isoDaySchema,
  logIngestSuccess,
  parseFlexibleTimestamp,
} from '@/lib/life/ingest';

export const dynamic = 'force-dynamic';

const nullableNum = z.number().finite().nullable().optional();

const flatRowSchema = z.object({
  day: isoDaySchema,
  envAudioAvgDb: nullableNum,
  env_audio_avg_db: nullableNum,
  envAudioMaxDb: nullableNum,
  env_audio_max_db: nullableNum,
  headphoneAudioAvgDb: nullableNum,
  headphone_audio_avg_db: nullableNum,
  headphoneAudioMins: nullableNum,
  headphone_audio_mins: nullableNum,
  timeInDaylightMins: nullableNum,
  time_in_daylight_mins: nullableNum,
  bodyMassKg: nullableNum,
  body_mass_kg: nullableNum,
  workoutMins: nullableNum,
  workout_mins: nullableNum,
});

const haeSampleSchema = z
  .object({
    date: z.string().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    qty: z.number().finite().optional(),
    avg: z.number().finite().optional(),
    max: z.number().finite().optional(),
    min: z.number().finite().optional(),
    duration: z.number().finite().optional(),
    units: z.string().optional(),
  })
  .passthrough();

const haeMetricSchema = z
  .object({
    name: z.string().min(1),
    units: z.string().optional(),
    data: z.array(haeSampleSchema).default([]),
  })
  .passthrough();

const haeWorkoutSchema = z
  .object({
    start: z.string().optional(),
    end: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    duration: z.number().finite().optional(),
    units: z.string().optional(),
    name: z.string().optional(),
  })
  .passthrough();

const haeWebhookSchema = z.object({
  data: z.object({
    metrics: z.array(haeMetricSchema).optional(),
    workouts: z.array(haeWorkoutSchema).optional(),
  }),
});

const flatPayloadSchema = z.union([
  flatRowSchema,
  z.object({ rows: z.array(flatRowSchema) }),
]);

interface DayHealthAccumulator {
  envAvgSamples: number[];
  envMaxSamples: number[];
  hpAvgSamples: number[];
  hpMins: number | null;
  daylightMins: number | null;
  latestMassKg: { ts: number; kg: number } | null;
  latestBmi: { ts: number; bmi: number } | null;
  exerciseMins: number | null;
  workoutSessionMins: number | null;
  metricNames: Set<string>;
  metricUnits: Record<string, string>;
  sampleCounts: Record<string, number>;
}

function getOrInitDay(
  map: Map<string, DayHealthAccumulator>,
  day: string,
): DayHealthAccumulator {
  let acc = map.get(day);
  if (!acc) {
    acc = {
      envAvgSamples: [],
      envMaxSamples: [],
      hpAvgSamples: [],
      hpMins: null,
      daylightMins: null,
      latestMassKg: null,
      latestBmi: null,
      exerciseMins: null,
      workoutSessionMins: null,
      metricNames: new Set(),
      metricUnits: {},
      sampleCounts: {},
    };
    map.set(day, acc);
  }
  return acc;
}

function normalizeMetricName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function maxNullable(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

function durationToMinutes(value: number, units?: string, defaultUnit: 's' | 'min' = 'min'): number {
  const u = (units ?? '').trim().toLowerCase();
  if (u === 's' || u === 'sec' || u === 'secs' || u === 'second' || u === 'seconds') {
    return value / 60;
  }
  if (u === 'hr' || u === 'hrs' || u === 'hour' || u === 'hours' || u === 'h') {
    return value * 60;
  }
  if (u === 'min' || u === 'mins' || u === 'minute' || u === 'minutes' || u === 'm') {
    return value;
  }
  return defaultUnit === 's' ? value / 60 : value;
}

function massToKg(value: number, units?: string): number {
  const u = (units ?? '').trim().toLowerCase();
  if (u === 'lb' || u === 'lbs' || u === 'pound' || u === 'pounds') {
    return value * 0.45359237;
  }
  if (u === 'st' || u === 'stone' || u === 'stones') {
    return value * 6.35029318;
  }
  if (u === 'g' || u === 'gram' || u === 'grams') {
    return value / 1000;
  }
  return value;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return round2(nums.reduce((a, b) => a + b, 0) / nums.length);
}

const SUPPORTED_METRICS = new Set([
  'environmental_audio_exposure',
  'headphone_audio_exposure',
  'time_in_daylight',
  'weight_body_mass',
  'weight',
  'body_mass',
  'apple_exercise_time',
  'exercise_time',
  'body_mass_index',
  'bmi',
]);

export async function POST(req: Request) {
  const gate = await authenticateAndParseJson(req);
  if (!gate.ok) return gate.response;

  const now = new Date();
  const rowsToUpsert: Array<{
    day: string;
    envAudioAvgDb: number | null;
    envAudioMaxDb: number | null;
    headphoneAudioAvgDb: number | null;
    headphoneAudioMins: number | null;
    timeInDaylightMins: number | null;
    bodyMassKg: number | null;
    workoutMins: number | null;
    rawPayload: Record<string, unknown>;
    updatedAt: Date;
  }> = [];

  const ignoredMetrics: string[] = [];

  const haeParsed = haeWebhookSchema.safeParse(gate.body);
  if (haeParsed.success) {
    const byDay = new Map<string, DayHealthAccumulator>();
    const metrics = haeParsed.data.data.metrics ?? [];
    const workouts = haeParsed.data.data.workouts ?? [];

    for (const metric of metrics) {
      const name = normalizeMetricName(metric.name);
      if (!SUPPORTED_METRICS.has(name)) {
        ignoredMetrics.push(metric.name);
        continue;
      }

      for (const sample of metric.data) {
        const dt = parseFlexibleTimestamp(
          sample.date ?? sample.start ?? sample.startDate,
        );
        if (!dt) continue;
        const day = toLondonDay(dt);
        const acc = getOrInitDay(byDay, day);
        acc.metricNames.add(name);
        acc.sampleCounts[name] = (acc.sampleCounts[name] ?? 0) + 1;
        const unitStr = (sample.units ?? metric.units ?? '').trim();
        if (unitStr) {
          acc.metricUnits[name] = unitStr;
        }

        if (name === 'environmental_audio_exposure') {
          const avgVal = sample.avg ?? sample.qty;
          const maxVal = sample.max ?? sample.avg ?? sample.qty;
          if (typeof avgVal === 'number') acc.envAvgSamples.push(avgVal);
          if (typeof maxVal === 'number') acc.envMaxSamples.push(maxVal);
        } else if (name === 'headphone_audio_exposure') {
          const avgVal = sample.avg ?? sample.qty;
          if (typeof avgVal === 'number') acc.hpAvgSamples.push(avgVal);
          const startDt = parseFlexibleTimestamp(sample.start ?? sample.startDate);
          const endDt = parseFlexibleTimestamp(sample.end ?? sample.endDate);
          if (startDt && endDt && endDt > startDt) {
            acc.hpMins = (acc.hpMins ?? 0) + (endDt.getTime() - startDt.getTime()) / 60_000;
          } else if (typeof sample.duration === 'number' && sample.duration > 0) {
            acc.hpMins =
              (acc.hpMins ?? 0) +
              durationToMinutes(sample.duration, sample.units ?? metric.units, 's');
          }
        } else if (name === 'time_in_daylight') {
          const val = sample.qty ?? sample.duration;
          if (typeof val === 'number' && val >= 0) {
            acc.daylightMins =
              (acc.daylightMins ?? 0) +
              durationToMinutes(val, sample.units ?? metric.units, 'min');
          }
        } else if (
          name === 'weight_body_mass' ||
          name === 'weight' ||
          name === 'body_mass'
        ) {
          const val = sample.qty ?? sample.avg;
          if (typeof val === 'number' && val > 0) {
            const kg = massToKg(val, sample.units ?? metric.units);
            if (!acc.latestMassKg || dt.getTime() >= acc.latestMassKg.ts) {
              acc.latestMassKg = { ts: dt.getTime(), kg };
            }
          }
        } else if (name === 'body_mass_index' || name === 'bmi') {
          const val = sample.qty ?? sample.avg;
          if (typeof val === 'number' && val > 0) {
            if (!acc.latestBmi || dt.getTime() >= acc.latestBmi.ts) {
              acc.latestBmi = { ts: dt.getTime(), bmi: val };
            }
          }
        } else if (name === 'apple_exercise_time' || name === 'exercise_time') {
          const val = sample.qty ?? sample.duration ?? sample.avg;
          if (typeof val === 'number' && val >= 0) {
            acc.exerciseMins =
              (acc.exerciseMins ?? 0) +
              durationToMinutes(val, sample.units ?? metric.units, 'min');
          }
        }
      }
    }

    for (const workout of workouts) {
      const startDt = parseFlexibleTimestamp(workout.start ?? workout.startDate);
      if (!startDt) continue;
      const endDt = parseFlexibleTimestamp(workout.end ?? workout.endDate);
      let mins: number | null = null;
      if (endDt && endDt > startDt) {
        mins = (endDt.getTime() - startDt.getTime()) / 60_000;
      } else if (typeof workout.duration === 'number' && workout.duration > 0) {
        mins = durationToMinutes(workout.duration, workout.units, 's');
      }
      if (mins === null) continue;

      const day = toLondonDay(startDt);
      const acc = getOrInitDay(byDay, day);
      acc.metricNames.add('workouts');
      acc.sampleCounts.workouts = (acc.sampleCounts.workouts ?? 0) + 1;
      acc.workoutSessionMins = (acc.workoutSessionMins ?? 0) + mins;
    }

    for (const [day, acc] of Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b))) {
      const combinedWorkoutMins = maxNullable(acc.workoutSessionMins, acc.exerciseMins);
      rowsToUpsert.push({
        day,
        envAudioAvgDb: mean(acc.envAvgSamples),
        envAudioMaxDb: acc.envMaxSamples.length > 0 ? round2(Math.max(...acc.envMaxSamples)) : null,
        headphoneAudioAvgDb: mean(acc.hpAvgSamples),
        headphoneAudioMins: acc.hpMins !== null ? round2(acc.hpMins) : null,
        timeInDaylightMins: acc.daylightMins !== null ? round2(acc.daylightMins) : null,
        bodyMassKg: acc.latestMassKg ? round2(acc.latestMassKg.kg) : null,
        workoutMins: combinedWorkoutMins !== null ? round2(combinedWorkoutMins) : null,
        rawPayload: {
          source: 'health_auto_export',
          metricsSeen: Array.from(acc.metricNames),
          metricUnits: acc.metricUnits,
          sampleCounts: acc.sampleCounts,
          metricsSummary: {
            bodyMassIndex: acc.latestBmi ? round2(acc.latestBmi.bmi) : null,
            appleExerciseMins: acc.exerciseMins !== null ? round2(acc.exerciseMins) : null,
            workoutSessionMins:
              acc.workoutSessionMins !== null ? round2(acc.workoutSessionMins) : null,
          },
          ignoredMetrics,
        },
        updatedAt: now,
      });
    }
  } else {
    const flatParsed = flatPayloadSchema.safeParse(gate.body);
    if (!flatParsed.success) {
      return NextResponse.json(
        { error: 'Invalid Apple Health payload', details: flatParsed.error.flatten() },
        { status: 400 },
      );
    }

    const items = 'rows' in flatParsed.data ? flatParsed.data.rows : [flatParsed.data];
    for (const item of items) {
      rowsToUpsert.push({
        day: item.day,
        envAudioAvgDb: item.envAudioAvgDb ?? item.env_audio_avg_db ?? null,
        envAudioMaxDb: item.envAudioMaxDb ?? item.env_audio_max_db ?? null,
        headphoneAudioAvgDb: item.headphoneAudioAvgDb ?? item.headphone_audio_avg_db ?? null,
        headphoneAudioMins: item.headphoneAudioMins ?? item.headphone_audio_mins ?? null,
        timeInDaylightMins: item.timeInDaylightMins ?? item.time_in_daylight_mins ?? null,
        bodyMassKg: item.bodyMassKg ?? item.body_mass_kg ?? null,
        workoutMins: item.workoutMins ?? item.workout_mins ?? null,
        rawPayload: { source: 'flat_apple_health', day: item.day },
        updatedAt: now,
      });
    }
  }

  try {
    const deduped = dedupeBy(rowsToUpsert, (r) => r.day);
    if (deduped.length === 0) {
      return NextResponse.json({
        ok: true,
        recordsProcessed: 0,
        days: [],
        ignoredMetrics,
      });
    }

    const db = getDb();
    await db
      .insert(lifeAcousticHealthDaily)
      .values(deduped)
      .onConflictDoUpdate({
        target: lifeAcousticHealthDaily.day,
        set: {
          envAudioAvgDb: sql`COALESCE(excluded.env_audio_avg_db, ${lifeAcousticHealthDaily.envAudioAvgDb})`,
          envAudioMaxDb: sql`COALESCE(excluded.env_audio_max_db, ${lifeAcousticHealthDaily.envAudioMaxDb})`,
          headphoneAudioAvgDb: sql`COALESCE(excluded.headphone_audio_avg_db, ${lifeAcousticHealthDaily.headphoneAudioAvgDb})`,
          headphoneAudioMins: sql`COALESCE(excluded.headphone_audio_mins, ${lifeAcousticHealthDaily.headphoneAudioMins})`,
          timeInDaylightMins: sql`COALESCE(excluded.time_in_daylight_mins, ${lifeAcousticHealthDaily.timeInDaylightMins})`,
          bodyMassKg: sql`COALESCE(excluded.body_mass_kg, ${lifeAcousticHealthDaily.bodyMassKg})`,
          workoutMins: sql`CASE
            WHEN excluded.workout_mins IS NULL THEN ${lifeAcousticHealthDaily.workoutMins}
            WHEN ${lifeAcousticHealthDaily.workoutMins} IS NULL THEN excluded.workout_mins
            ELSE GREATEST(excluded.workout_mins, ${lifeAcousticHealthDaily.workoutMins})
          END`,
          rawPayload: sql`${lifeAcousticHealthDaily.rawPayload} || excluded.raw_payload`,
          updatedAt: sql`excluded.updated_at`,
        },
      });

    await logIngestSuccess(
      'ingest_apple_health',
      'life_acoustic_health_daily',
      deduped.length,
    );

    return NextResponse.json({
      ok: true,
      recordsProcessed: deduped.length,
      days: deduped.map((r) => r.day),
      ignoredMetrics,
    });
  } catch (err) {
    return handleIngestFailure(
      'ingest_apple_health',
      'life_acoustic_health_daily',
      err,
      'Apple Health ingestion failed',
    );
  }
}
