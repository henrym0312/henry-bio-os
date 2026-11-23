import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { lifeWeatherDaily } from '@/db/schema';
import {
  authenticateAndParseJson,
  dedupeBy,
  handleIngestFailure,
  isoDaySchema,
  logIngestSuccess,
} from '@/lib/life/ingest';

export const dynamic = 'force-dynamic';

const nullableMetric = z.number().finite().nullable().optional();

const weatherRowSchema = z
  .object({
    day: isoDaySchema,
    locationKey: z.enum(['durham', 'yorkshire', 'other']).optional(),
    location_key: z.enum(['durham', 'yorkshire', 'other']).optional(),
    lat: z.number().finite().min(-90).max(90),
    lon: z.number().finite().min(-180).max(180),
    tempMeanC: nullableMetric,
    temp_mean_c: nullableMetric,
    tempMinC: nullableMetric,
    temp_min_c: nullableMetric,
    tempMaxC: nullableMetric,
    temp_max_c: nullableMetric,
    humidityPct: nullableMetric,
    humidity_pct: nullableMetric,
    uvMax: nullableMetric,
    uv_max: nullableMetric,
    cloudCoverPct: nullableMetric,
    cloud_cover_pct: nullableMetric,
    precipitationMm: nullableMetric,
    precipitation_mm: nullableMetric,
    pressureHpa: nullableMetric,
    pressure_hpa: nullableMetric,
    pressureDelta24h: nullableMetric,
    pressure_delta_24h: nullableMetric,
    pm25: nullableMetric,
    europeanAqi: nullableMetric,
    european_aqi: nullableMetric,
    photoperiodHours: nullableMetric,
    photoperiod_hours: nullableMetric,
  })
  .refine((row) => Boolean(row.locationKey ?? row.location_key), {
    message: 'locationKey is required',
  });

const weatherPayloadSchema = z.union([
  weatherRowSchema,
  z.object({ rows: z.array(weatherRowSchema) }),
]);

export async function POST(req: Request) {
  const gate = await authenticateAndParseJson(req);
  if (!gate.ok) return gate.response;

  const parsed = weatherPayloadSchema.safeParse(gate.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid weather payload', details: parsed.error.flatten() },
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
        locationKey: (item.locationKey ?? item.location_key)!,
        lat: item.lat,
        lon: item.lon,
        tempMeanC: item.tempMeanC ?? item.temp_mean_c ?? null,
        tempMinC: item.tempMinC ?? item.temp_min_c ?? null,
        tempMaxC: item.tempMaxC ?? item.temp_max_c ?? null,
        humidityPct: item.humidityPct ?? item.humidity_pct ?? null,
        uvMax: item.uvMax ?? item.uv_max ?? null,
        cloudCoverPct: item.cloudCoverPct ?? item.cloud_cover_pct ?? null,
        precipitationMm: item.precipitationMm ?? item.precipitation_mm ?? null,
        pressureHpa: item.pressureHpa ?? item.pressure_hpa ?? null,
        pressureDelta24h: item.pressureDelta24h ?? item.pressure_delta_24h ?? null,
        pm25: item.pm25 ?? null,
        europeanAqi: item.europeanAqi ?? item.european_aqi ?? null,
        photoperiodHours: item.photoperiodHours ?? item.photoperiod_hours ?? null,
        updatedAt: now,
      })),
      (r) => r.day,
    );

    const db = getDb();
    await db
      .insert(lifeWeatherDaily)
      .values(mapped)
      .onConflictDoUpdate({
        target: lifeWeatherDaily.day,
        set: {
          locationKey: sql`excluded.location_key`,
          lat: sql`excluded.lat`,
          lon: sql`excluded.lon`,
          tempMeanC: sql`excluded.temp_mean_c`,
          tempMinC: sql`excluded.temp_min_c`,
          tempMaxC: sql`excluded.temp_max_c`,
          humidityPct: sql`excluded.humidity_pct`,
          uvMax: sql`excluded.uv_max`,
          cloudCoverPct: sql`excluded.cloud_cover_pct`,
          precipitationMm: sql`excluded.precipitation_mm`,
          pressureHpa: sql`excluded.pressure_hpa`,
          pressureDelta24h: sql`excluded.pressure_delta_24h`,
          pm25: sql`excluded.pm25`,
          europeanAqi: sql`excluded.european_aqi`,
          photoperiodHours: sql`excluded.photoperiod_hours`,
          updatedAt: sql`excluded.updated_at`,
        },
      });

    await logIngestSuccess('ingest_weather', 'life_weather_daily', mapped.length);

    return NextResponse.json({
      ok: true,
      recordsProcessed: mapped.length,
      days: mapped.map((r) => r.day),
    });
  } catch (err) {
    return handleIngestFailure(
      'ingest_weather',
      'life_weather_daily',
      err,
      'Weather ingestion failed',
    );
  }
}
