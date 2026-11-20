import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  ouraDailyActivity,
  ouraDailyCardiovascularAge,
  ouraDailyReadiness,
  ouraDailyResilience,
  ouraDailySleep,
  ouraDailySpo2,
  ouraDailyStress,
  ouraEnhancedTag,
  ouraHeartrate,
  ouraPersonalInfo,
  ouraRestModePeriod,
  ouraRingBatteryLevel,
  ouraRingConfiguration,
  ouraSession,
  ouraSleep,
  ouraSleepTime,
  ouraTag,
  ouraVo2Max,
  ouraWorkout,
  syncLogs,
  webhookSubscriptions,
  type OuraSampleJson,
} from '@/db/schema';
import { OuraApiError, ouraFetch, ouraFetchPaginated } from './client';
import {
  ALL_OURA_ENDPOINTS,
  OURA_ENDPOINT_PATHS,
  type ExtApiV2DataType,
  type OuraEndpointKey,
  type OuraWebhookSubscription,
} from './types';

type RawRecord = Record<string, unknown>;

const BATCH_SIZE = 400;

function asString(val: unknown): string | null {
  return typeof val === 'string' ? val : null;
}

function asNumber(val: unknown): number | null {
  return typeof val === 'number' && Number.isFinite(val) ? val : null;
}

function asInt(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return Math.round(val);
  }
  return null;
}

function asBoolean(val: unknown): boolean | null {
  return typeof val === 'boolean' ? val : null;
}

function asJsonRecord(val: unknown): Record<string, number | null> | null {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    return val as Record<string, number | null>;
  }
  return null;
}

function asSampleJson(val: unknown): OuraSampleJson | null {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    const obj = val as Record<string, unknown>;
    if (
      typeof obj.interval === 'number' &&
      Array.isArray(obj.items) &&
      typeof obj.timestamp === 'string'
    ) {
      return {
        interval: obj.interval,
        items: obj.items as Array<number | null>,
        timestamp: obj.timestamp,
      };
    }
  }
  return null;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function dedupeByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(keyFn(item), item);
  }
  return Array.from(map.values());
}

export async function recordSyncLog(entry: {
  source: string;
  dataType: string;
  eventType?: string | null;
  objectId?: string | null;
  statusCode: number;
  recordsProcessed: number;
  errorMessage?: string | null;
}): Promise<void> {
  const db = getDb();
  await db.insert(syncLogs).values({
    source: entry.source,
    dataType: entry.dataType,
    eventType: entry.eventType ?? null,
    objectId: entry.objectId ?? null,
    statusCode: entry.statusCode,
    recordsProcessed: entry.recordsProcessed,
    errorMessage: entry.errorMessage ?? null,
  });
}

/**
 * Synchronises the local `webhook_subscriptions` table with Oura's active subscription list.
 */
export async function syncWebhookSubscriptionsToDb(
  subscriptions: OuraWebhookSubscription[],
): Promise<void> {
  const db = getDb();
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.delete(webhookSubscriptions);
    if (subscriptions.length === 0) return;

    const rows = subscriptions.map((sub) => ({
      id: sub.id,
      dataType: sub.data_type,
      eventType: sub.event_type,
      expirationTime: new Date(sub.expiration_time),
      callbackUrl: sub.callback_url,
      updatedAt: now,
    }));

    for (const batch of chunkArray(rows, BATCH_SIZE)) {
      await tx.insert(webhookSubscriptions).values(batch);
    }
  });
}

/**
 * Idempotently upserts an array of raw Oura v2 records into the matching Drizzle table.
 */
export async function upsertOuraRecords(
  endpoint: OuraEndpointKey,
  records: RawRecord[],
): Promise<number> {
  if (records.length === 0) return 0;

  const db = getDb();
  const now = new Date();
  let processed = 0;

  switch (endpoint) {
    case 'personal_info': {
      const mapped = dedupeByKey(
        records
          .filter((r) => typeof r.id === 'string')
          .map((r) => ({
            id: r.id as string,
            age: asInt(r.age),
            weight: asNumber(r.weight),
            height: asNumber(r.height),
            biologicalSex: asString(r.biological_sex),
            email: asString(r.email),
            rawPayload: r,
            updatedAt: now,
          })),
        (r) => r.id,
      );
      for (const row of mapped) {
        await db
          .insert(ouraPersonalInfo)
          .values(row)
          .onConflictDoUpdate({
            target: ouraPersonalInfo.id,
            set: row,
          });
      }
      processed = mapped.length;
      break;
    }

    case 'ring_configuration': {
      const mapped = dedupeByKey(
        records
          .filter((r) => typeof r.id === 'string')
          .map((r) => ({
            id: r.id as string,
            color: asString(r.color),
            design: asString(r.design),
            firmwareVersion: asString(r.firmware_version),
            hardwareType: asString(r.hardware_type),
            setUpAt: asString(r.set_up_at),
            size: asInt(r.size),
            rawPayload: r,
            updatedAt: now,
          })),
        (r) => r.id,
      );
      for (const row of mapped) {
        await db
          .insert(ouraRingConfiguration)
          .values(row)
          .onConflictDoUpdate({
            target: ouraRingConfiguration.id,
            set: row,
          });
      }
      processed = mapped.length;
      break;
    }

    case 'daily_readiness': {
      const mapped = dedupeByKey(
        records
          .filter((r) => typeof r.id === 'string' && typeof r.day === 'string')
          .map((r) => ({
            id: r.id as string,
            day: r.day as string,
            score: asInt(r.score),
            temperatureDeviation: asNumber(r.temperature_deviation),
            temperatureTrendDeviation: asNumber(r.temperature_trend_deviation),
            timestamp: asString(r.timestamp),
            contributors: asJsonRecord(r.contributors),
            rawPayload: r,
            updatedAt: now,
          })),
        (r) => r.id,
      );
      for (const row of mapped) {
        await db
          .insert(ouraDailyReadiness)
          .values(row)
          .onConflictDoUpdate({
            target: ouraDailyReadiness.id,
            set: row,
          });
      }
      processed = mapped.length;
      break;
    }

    case 'daily_sleep': {
      const mapped = dedupeByKey(
        records
          .filter((r) => typeof r.id === 'string' && typeof r.day === 'string')
          .map((r) => ({
            id: r.id as string,
            day: r.day as string,
            score: asInt(r.score),
            timestamp: asString(r.timestamp),
            contributors: asJsonRecord(r.contributors),
            rawPayload: r,
            updatedAt: now,
          })),
        (r) => r.id,
      );
      for (const row of mapped) {
        await db
          .insert(ouraDailySleep)
          .values(row)
          .onConflictDoUpdate({
            target: ouraDailySleep.id,
            set: row,
          });
      }
      processed = mapped.length;
      break;
    }

    case 'sleep': {
      const mapped = dedupeByKey(
        records
          .filter(
            (r) =>
              typeof r.id === 'string' &&
              typeof r.day === 'string' &&
              typeof r.bedtime_start === 'string' &&
              typeof r.bedtime_end === 'string',
          )
          .map((r) => ({
            id: r.id as string,
            day: r.day as string,
            type: asString(r.type),
            period: asInt(r.period),
            bedtimeStart: r.bedtime_start as string,
            bedtimeEnd: r.bedtime_end as string,
            totalSleepDuration: asInt(r.total_sleep_duration),
            deepSleepDuration: asInt(r.deep_sleep_duration),
            remSleepDuration: asInt(r.rem_sleep_duration),
            lightSleepDuration: asInt(r.light_sleep_duration),
            awakeTime: asInt(r.awake_time),
            timeInBed: asInt(r.time_in_bed),
            efficiency: asInt(r.efficiency),
            latency: asInt(r.latency),
            averageBreath: asNumber(r.average_breath),
            averageHeartRate: asNumber(r.average_heart_rate),
            lowestHeartRate: asInt(r.lowest_heart_rate),
            averageHrv: asInt(r.average_hrv),
            restlessPeriods: asInt(r.restless_periods),
            readinessScoreDelta: asInt(r.readiness_score_delta),
            sleepScoreDelta: asInt(r.sleep_score_delta),
            sleepPhase30Sec: asString(r.sleep_phase_30_sec),
            sleepPhase5Min: asString(r.sleep_phase_5_min),
            movement30Sec: asString(r.movement_30_sec),
            heartRate: asSampleJson(r.heart_rate),
            hrv: asSampleJson(r.hrv),
            readiness:
              r.readiness && typeof r.readiness === 'object'
                ? (r.readiness as Record<string, unknown>)
                : null,
            lowBatteryAlert: asBoolean(r.low_battery_alert),
            sleepAlgorithmVersion: asString(r.sleep_algorithm_version),
            sleepAnalysisReason: asString(r.sleep_analysis_reason),
            rawPayload: r,
            updatedAt: now,
          })),
        (r) => r.id,
      );
      for (const row of mapped) {
        await db
          .insert(ouraSleep)
          .values(row)
          .onConflictDoUpdate({
            target: ouraSleep.id,
            set: row,
          });
      }
      processed = mapped.length;
      break;
    }

    case 'sleep_time': {
      const mapped = dedupeByKey(
        records
          .filter((r) => typeof r.id === 'string' && typeof r.day === 'string')
          .map((r) => ({
            id: r.id as string,
            day: r.day as string,
            optimalBedtime:
              r.optimal_bedtime && typeof r.optimal_bedtime === 'object'
                ? (r.optimal_bedtime as {
                    day_tz: number;
                    start_offset: number;
                    end_offset: number;
                  })
                : null,
            recommendation: asString(r.recommendation),
            status: asString(r.status),
            rawPayload: r,
            updatedAt: now,
          })),
        (r) => r.id,
      );
      for (const row of mapped) {
        await db
          .insert(ouraSleepTime)
          .values(row)
          .onConflictDoUpdate({
            target: ouraSleepTime.id,
            set: row,
          });
      }
      processed = mapped.length;
      break;
    }

    case 'daily_activity': {
      const mapped = dedupeByKey(
        records
          .filter((r) => typeof r.id === 'string' && typeof r.day === 'string')
          .map((r) => ({
            id: r.id as string,
            day: r.day as string,
            score: asInt(r.score),
            activeCalories: asInt(r.active_calories),
            totalCalories: asInt(r.total_calories),
            steps: asInt(r.steps),
            equivalentWalkingDistance: asInt(r.equivalent_walking_distance),
            highActivityTime: asInt(r.high_activity_time),
            mediumActivityTime: asInt(r.medium_activity_time),
            lowActivityTime: asInt(r.low_activity_time),
            sedentaryTime: asInt(r.sedentary_time),
            restingTime: asInt(r.resting_time),
            nonWearTime: asInt(r.non_wear_time),
            highActivityMetMinutes: asInt(r.high_activity_met_minutes),
            mediumActivityMetMinutes: asInt(r.medium_activity_met_minutes),
            lowActivityMetMinutes: asInt(r.low_activity_met_minutes),
            sedentaryMetMinutes: asInt(r.sedentary_met_minutes),
            inactivityAlerts: asInt(r.inactivity_alerts),
            averageMetMinutes: asNumber(r.average_met_minutes),
            metersToTarget: asInt(r.meters_to_target),
            targetCalories: asInt(r.target_calories),
            targetMeters: asInt(r.target_meters),
            class5Min: asString(r.class_5_min),
            met: asSampleJson(r.met),
            contributors: asJsonRecord(r.contributors),
            timestamp: asString(r.timestamp),
            rawPayload: r,
            updatedAt: now,
          })),
        (r) => r.id,
      );
      for (const row of mapped) {
        await db
          .insert(ouraDailyActivity)
          .values(row)
          .onConflictDoUpdate({
            target: ouraDailyActivity.id,
            set: row,
          });
      }
      processed = mapped.length;
      break;
    }

    case 'daily_stress': {
      const mapped = dedupeByKey(
        records
          .filter((r) => typeof r.id === 'string' && typeof r.day === 'string')
          .map((r) => ({
            id: r.id as string,
            day: r.day as string,
            stressHigh: asInt(r.stress_high),
            recoveryHigh: asInt(r.recovery_high),
            daySummary: asString(r.day_summary),
            rawPayload: r,
            updatedAt: now,
          })),
        (r) => r.id,
      );
      for (const row of mapped) {
        await db
          .insert(ouraDailyStress)
          .values(row)
          .onConflictDoUpdate({
            target: ouraDailyStress.id,
            set: row,
          });
      }
      processed = mapped.length;
      break;
    }

    case 'daily_resilience': {
      const mapped = dedupeByKey(
        records
          .filter((r) => typeof r.id === 'string' && typeof r.day === 'string')
          .map((r) => ({
            id: r.id as string,
            day: r.day as string,
            level: asString(r.level),
            contributors:
              r.contributors && typeof r.contributors === 'object'
                ? (r.contributors as {
                    sleep_recovery?: number;
                    daytime_recovery?: number;
                    stress?: number;
                  })
                : null,
            rawPayload: r,
            updatedAt: now,
          })),
        (r) => r.id,
      );
      for (const row of mapped) {
        await db
          .insert(ouraDailyResilience)
          .values(row)
          .onConflictDoUpdate({
            target: ouraDailyResilience.id,
            set: row,
          });
      }
      processed = mapped.length;
      break;
    }

    case 'daily_spo2': {
      const mapped = dedupeByKey(
        records
          .filter((r) => typeof r.id === 'string' && typeof r.day === 'string')
          .map((r) => {
            const spo2Obj =
              r.spo2_percentage && typeof r.spo2_percentage === 'object'
                ? (r.spo2_percentage as Record<string, unknown>)
                : null;
            const spo2Avg = asNumber(spo2Obj?.average) ?? asNumber(r.spo2_average);
            return {
              id: r.id as string,
              day: r.day as string,
              spo2Average: spo2Avg,
              breathingDisturbanceIndex: asInt(r.breathing_disturbance_index),
              rawPayload: r,
              updatedAt: now,
            };
          }),
        (r) => r.id,
      );
      for (const row of mapped) {
        await db
          .insert(ouraDailySpo2)
          .values(row)
          .onConflictDoUpdate({
            target: ouraDailySpo2.id,
            set: row,
          });
      }
      processed = mapped.length;
      break;
    }

    case 'daily_cardiovascular_age': {
      const mapped = dedupeByKey(
        records
          .filter((r) => typeof r.id === 'string' && typeof r.day === 'string')
          .map((r) => ({
            id: r.id as string,
            day: r.day as string,
            vascularAge: asInt(r.vascular_age),
            pulseWaveVelocity: asNumber(r.pulse_wave_velocity),
            rawPayload: r,
            updatedAt: now,
          })),
        (r) => r.id,
      );
      for (const row of mapped) {
        await db
          .insert(ouraDailyCardiovascularAge)
          .values(row)
          .onConflictDoUpdate({
            target: ouraDailyCardiovascularAge.id,
            set: row,
          });
      }
      processed = mapped.length;
      break;
    }

    case 'vo2_max': {
      const mapped = dedupeByKey(
        records
          .filter((r) => typeof r.id === 'string' && typeof r.day === 'string')
          .map((r) => ({
            id: r.id as string,
            day: r.day as string,
            timestamp: asString(r.timestamp),
            vo2Max: asNumber(r.vo2_max),
            rawPayload: r,
            updatedAt: now,
          })),
        (r) => r.id,
      );
      for (const row of mapped) {
        await db
          .insert(ouraVo2Max)
          .values(row)
          .onConflictDoUpdate({
            target: ouraVo2Max.id,
            set: row,
          });
      }
      processed = mapped.length;
      break;
    }

    case 'workout': {
      const mapped = dedupeByKey(
        records
          .filter((r) => typeof r.id === 'string' && typeof r.day === 'string')
          .map((r) => ({
            id: r.id as string,
            day: r.day as string,
            activity: asString(r.activity),
            calories: asNumber(r.calories),
            distance: asNumber(r.distance),
            startDatetime: asString(r.start_datetime),
            endDatetime: asString(r.end_datetime),
            intensity: asString(r.intensity),
            label: asString(r.label),
            source: asString(r.source),
            rawPayload: r,
            updatedAt: now,
          })),
        (r) => r.id,
      );
      for (const row of mapped) {
        await db
          .insert(ouraWorkout)
          .values(row)
          .onConflictDoUpdate({
            target: ouraWorkout.id,
            set: row,
          });
      }
      processed = mapped.length;
      break;
    }

    case 'session': {
      const mapped = dedupeByKey(
        records
          .filter((r) => typeof r.id === 'string' && typeof r.day === 'string')
          .map((r) => ({
            id: r.id as string,
            day: r.day as string,
            startDatetime: asString(r.start_datetime),
            endDatetime: asString(r.end_datetime),
            type: asString(r.type),
            mood: asString(r.mood),
            heartRate: asSampleJson(r.heart_rate),
            heartRateVariability: asSampleJson(r.heart_rate_variability),
            motionCount: asSampleJson(r.motion_count),
            rawPayload: r,
            updatedAt: now,
          })),
        (r) => r.id,
      );
      for (const row of mapped) {
        await db
          .insert(ouraSession)
          .values(row)
          .onConflictDoUpdate({
            target: ouraSession.id,
            set: row,
          });
      }
      processed = mapped.length;
      break;
    }

    case 'enhanced_tag': {
      const mapped = dedupeByKey(
        records
          .filter(
            (r) =>
              typeof r.id === 'string' &&
              typeof r.start_day === 'string' &&
              typeof r.start_time === 'string',
          )
          .map((r) => ({
            id: r.id as string,
            startDay: r.start_day as string,
            endDay: asString(r.end_day),
            startTime: r.start_time as string,
            endTime: asString(r.end_time),
            tagTypeCode: asString(r.tag_type_code),
            customName: asString(r.custom_name),
            comment: asString(r.comment),
            rawPayload: r,
            updatedAt: now,
          })),
        (r) => r.id,
      );
      for (const row of mapped) {
        await db
          .insert(ouraEnhancedTag)
          .values(row)
          .onConflictDoUpdate({
            target: ouraEnhancedTag.id,
            set: row,
          });
      }
      processed = mapped.length;
      break;
    }

    case 'tag': {
      const mapped = dedupeByKey(
        records
          .filter((r) => typeof r.id === 'string' && typeof r.day === 'string')
          .map((r) => ({
            id: r.id as string,
            day: r.day as string,
            text: asString(r.text),
            timestamp: asString(r.timestamp),
            tags: Array.isArray(r.tags)
              ? r.tags.filter((t): t is string => typeof t === 'string')
              : [],
            rawPayload: r,
            updatedAt: now,
          })),
        (r) => r.id,
      );
      for (const row of mapped) {
        await db
          .insert(ouraTag)
          .values(row)
          .onConflictDoUpdate({
            target: ouraTag.id,
            set: row,
          });
      }
      processed = mapped.length;
      break;
    }

    case 'rest_mode_period': {
      const mapped = dedupeByKey(
        records
          .filter((r) => typeof r.id === 'string' && typeof r.start_day === 'string')
          .map((r) => ({
            id: r.id as string,
            startDay: r.start_day as string,
            startTime: asString(r.start_time),
            endDay: asString(r.end_day),
            endTime: asString(r.end_time),
            episodes: Array.isArray(r.episodes)
              ? (r.episodes as Array<{ tags: string[]; timestamp: string }>)
              : [],
            rawPayload: r,
            updatedAt: now,
          })),
        (r) => r.id,
      );
      for (const row of mapped) {
        await db
          .insert(ouraRestModePeriod)
          .values(row)
          .onConflictDoUpdate({
            target: ouraRestModePeriod.id,
            set: row,
          });
      }
      processed = mapped.length;
      break;
    }

    case 'heartrate': {
      const mapped = dedupeByKey(
        records
          .filter(
            (r) =>
              typeof r.timestamp_unix === 'number' &&
              typeof r.source === 'string' &&
              typeof r.timestamp === 'string' &&
              typeof r.bpm === 'number',
          )
          .map((r) => ({
            timestampUnix: r.timestamp_unix as number,
            source: r.source as string,
            timestamp: r.timestamp as string,
            bpm: Math.round(r.bpm as number),
            rawPayload: r,
            updatedAt: now,
          })),
        (r) => `${r.timestampUnix}::${r.source}`,
      );

      for (const batch of chunkArray(mapped, BATCH_SIZE)) {
        await db
          .insert(ouraHeartrate)
          .values(batch)
          .onConflictDoUpdate({
            target: [ouraHeartrate.timestampUnix, ouraHeartrate.source],
            set: {
              timestamp: sql`excluded.timestamp`,
              bpm: sql`excluded.bpm`,
              rawPayload: sql`excluded.raw_payload`,
              updatedAt: sql`excluded.updated_at`,
            },
          });
      }
      processed = mapped.length;
      break;
    }

    case 'ring_battery_level': {
      const mapped = dedupeByKey(
        records
          .filter(
            (r) =>
              typeof r.timestamp_unix === 'number' &&
              typeof r.timestamp === 'string' &&
              typeof r.level === 'number',
          )
          .map((r) => ({
            timestampUnix: r.timestamp_unix as number,
            timestamp: r.timestamp as string,
            level: Math.round(r.level as number),
            charging: asBoolean(r.charging),
            inCharger: asBoolean(r.in_charger),
            rawPayload: r,
            updatedAt: now,
          })),
        (r) => String(r.timestampUnix),
      );

      for (const batch of chunkArray(mapped, BATCH_SIZE)) {
        await db
          .insert(ouraRingBatteryLevel)
          .values(batch)
          .onConflictDoUpdate({
            target: ouraRingBatteryLevel.timestampUnix,
            set: {
              timestamp: sql`excluded.timestamp`,
              level: sql`excluded.level`,
              charging: sql`excluded.charging`,
              inCharger: sql`excluded.in_charger`,
              rawPayload: sql`excluded.raw_payload`,
              updatedAt: sql`excluded.updated_at`,
            },
          });
      }
      processed = mapped.length;
      break;
    }
  }

  return processed;
}

/**
 * Deletes an Oura record by `object_id` when a `delete` webhook arrives.
 */
export async function deleteOuraRecord(
  dataType: ExtApiV2DataType,
  objectId: string,
): Promise<number> {
  const db = getDb();

  switch (dataType) {
    case 'tag':
      await db.delete(ouraTag).where(eq(ouraTag.id, objectId));
      return 1;
    case 'enhanced_tag':
      await db.delete(ouraEnhancedTag).where(eq(ouraEnhancedTag.id, objectId));
      return 1;
    case 'workout':
      await db.delete(ouraWorkout).where(eq(ouraWorkout.id, objectId));
      return 1;
    case 'session':
      await db.delete(ouraSession).where(eq(ouraSession.id, objectId));
      return 1;
    case 'sleep':
      await db.delete(ouraSleep).where(eq(ouraSleep.id, objectId));
      return 1;
    case 'daily_sleep':
      await db.delete(ouraDailySleep).where(eq(ouraDailySleep.id, objectId));
      return 1;
    case 'daily_readiness':
      await db.delete(ouraDailyReadiness).where(eq(ouraDailyReadiness.id, objectId));
      return 1;
    case 'daily_activity':
      await db.delete(ouraDailyActivity).where(eq(ouraDailyActivity.id, objectId));
      return 1;
    case 'daily_spo2':
      await db.delete(ouraDailySpo2).where(eq(ouraDailySpo2.id, objectId));
      return 1;
    case 'sleep_time':
      await db.delete(ouraSleepTime).where(eq(ouraSleepTime.id, objectId));
      return 1;
    case 'rest_mode_period':
      await db.delete(ouraRestModePeriod).where(eq(ouraRestModePeriod.id, objectId));
      return 1;
    case 'ring_configuration':
      await db.delete(ouraRingConfiguration).where(eq(ouraRingConfiguration.id, objectId));
      return 1;
    case 'daily_stress':
      await db.delete(ouraDailyStress).where(eq(ouraDailyStress.id, objectId));
      return 1;
    case 'daily_cardiovascular_age':
      await db
        .delete(ouraDailyCardiovascularAge)
        .where(eq(ouraDailyCardiovascularAge.id, objectId));
      return 1;
    case 'daily_resilience':
      await db.delete(ouraDailyResilience).where(eq(ouraDailyResilience.id, objectId));
      return 1;
    case 'vo2_max':
      await db.delete(ouraVo2Max).where(eq(ouraVo2Max.id, objectId));
      return 1;
  }
}

/**
 * Fetches a single document by `object_id` from Oura API v2 and upserts it.
 */
export async function syncSingleOuraDocument(
  dataType: ExtApiV2DataType,
  objectId: string,
): Promise<number> {
  const basePath = OURA_ENDPOINT_PATHS[dataType];
  const docPath = `${basePath}/${encodeURIComponent(objectId)}`;

  try {
    const record = await ouraFetch<RawRecord>(docPath);
    if (!record || typeof record !== 'object') {
      return 0;
    }
    return upsertOuraRecords(dataType, [record]);
  } catch (err) {
    if (err instanceof OuraApiError && err.status === 404) {
      return 0;
    }
    throw err;
  }
}

/**
 * Piggyback sync for non-webhook time-series endpoints (`heartrate` and `ring_battery_level`).
 * Triggered automatically whenever a `sleep` or `daily_activity` webhook arrives.
 */
export async function syncPiggybackTimeSeries(lookbackHours = 24): Promise<{
  heartrateCount: number;
  batteryCount: number;
}> {
  const endDt = new Date();
  const startDt = new Date(endDt.getTime() - lookbackHours * 60 * 60 * 1000);
  const startIso = startDt.toISOString();
  const endIso = endDt.toISOString();

  let heartrateCount = 0;
  let batteryCount = 0;

  try {
    const hrRows = await ouraFetchPaginated<RawRecord>(OURA_ENDPOINT_PATHS.heartrate, {
      start_datetime: startIso,
      end_datetime: endIso,
    });
    heartrateCount = await upsertOuraRecords('heartrate', hrRows);
    await recordSyncLog({
      source: 'piggyback',
      dataType: 'heartrate',
      statusCode: 200,
      recordsProcessed: heartrateCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordSyncLog({
      source: 'piggyback',
      dataType: 'heartrate',
      statusCode: err instanceof OuraApiError ? err.status : 500,
      recordsProcessed: 0,
      errorMessage: message,
    });
  }

  try {
    const batRows = await ouraFetchPaginated<RawRecord>(
      OURA_ENDPOINT_PATHS.ring_battery_level,
      {
        start_datetime: startIso,
        end_datetime: endIso,
      },
    );
    batteryCount = await upsertOuraRecords('ring_battery_level', batRows);
    await recordSyncLog({
      source: 'piggyback',
      dataType: 'ring_battery_level',
      statusCode: 200,
      recordsProcessed: batteryCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordSyncLog({
      source: 'piggyback',
      dataType: 'ring_battery_level',
      statusCode: err instanceof OuraApiError ? err.status : 500,
      recordsProcessed: 0,
      errorMessage: message,
    });
  }

  return { heartrateCount, batteryCount };
}

function generateDateChunks(
  startDateStr: string,
  endDateStr: string,
  chunkDays: number,
): Array<{ start: string; end: string }> {
  const chunks: Array<{ start: string; end: string }> = [];
  const start = new Date(`${startDateStr}T00:00:00Z`);
  const end = new Date(`${endDateStr}T00:00:00Z`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return chunks;
  }

  let cursor = new Date(start);
  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + chunkDays - 1);
    if (chunkEnd > end) {
      chunkEnd.setTime(end.getTime());
    }
    chunks.push({
      start: cursor.toISOString().slice(0, 10),
      end: chunkEnd.toISOString().slice(0, 10),
    });

    const next = new Date(chunkEnd);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next;
  }

  return chunks;
}

export interface BackfillOptions {
  startDate?: string;
  endDate?: string;
  endpoints?: OuraEndpointKey[];
  source?: string;
  onProgress?: (msg: string) => void;
}

export interface BackfillResult {
  startDate: string;
  endDate: string;
  summary: Record<string, { records: number; error?: string }>;
  totalRecords: number;
}

/**
 * Resumable, idempotent backfill across all 19 Oura V2 endpoints.
 * Defaults to the past 2 years and chunks `heartrate` and `ring_battery_level` into 30-day windows.
 */
export async function runBackfill(options: BackfillOptions = {}): Promise<BackfillResult> {
  const now = new Date();
  const defaultEnd = now.toISOString().slice(0, 10);
  const twoYearsAgo = new Date(now);
  twoYearsAgo.setUTCFullYear(twoYearsAgo.getUTCFullYear() - 2);
  const defaultStart = twoYearsAgo.toISOString().slice(0, 10);

  const startDate = options.startDate ?? defaultStart;
  const endDate = options.endDate ?? defaultEnd;
  const targetEndpoints =
    options.endpoints && options.endpoints.length > 0
      ? options.endpoints
      : [...ALL_OURA_ENDPOINTS];
  const source = options.source ?? 'backfill';

  const summary: Record<string, { records: number; error?: string }> = {};
  let totalRecords = 0;

  for (const endpoint of targetEndpoints) {
    const path = OURA_ENDPOINT_PATHS[endpoint];
    let endpointCount = 0;

    try {
      if (endpoint === 'personal_info') {
        const info = await ouraFetch<RawRecord>(path);
        endpointCount = await upsertOuraRecords('personal_info', [info]);
      } else if (endpoint === 'ring_configuration') {
        const rows = await ouraFetchPaginated<RawRecord>(path);
        endpointCount = await upsertOuraRecords('ring_configuration', rows);
      } else if (endpoint === 'heartrate' || endpoint === 'ring_battery_level') {
        // 30-day chunks for high-volume discrete time-series endpoints
        const chunks = generateDateChunks(startDate, endDate, 30);
        for (const chunk of chunks) {
          const rows = await ouraFetchPaginated<RawRecord>(path, {
            start_datetime: `${chunk.start}T00:00:00Z`,
            end_datetime: `${chunk.end}T23:59:59Z`,
          });
          const count = await upsertOuraRecords(endpoint, rows);
          endpointCount += count;
          options.onProgress?.(
            `[${endpoint}] ${chunk.start}..${chunk.end}: ${count} records`,
          );
        }
      } else {
        // 90-day chunks for daily & event endpoints to keep pages bounded
        const chunks = generateDateChunks(startDate, endDate, 90);
        for (const chunk of chunks) {
          const rows = await ouraFetchPaginated<RawRecord>(path, {
            start_date: chunk.start,
            end_date: chunk.end,
          });
          const count = await upsertOuraRecords(endpoint, rows);
          endpointCount += count;
          options.onProgress?.(
            `[${endpoint}] ${chunk.start}..${chunk.end}: ${count} records`,
          );
        }
      }

      summary[endpoint] = { records: endpointCount };
      totalRecords += endpointCount;

      await recordSyncLog({
        source,
        dataType: endpoint,
        statusCode: 200,
        recordsProcessed: endpointCount,
      });
      options.onProgress?.(`[${endpoint}] Completed: ${endpointCount} total records`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const statusCode = err instanceof OuraApiError ? err.status : 500;
      summary[endpoint] = { records: endpointCount, error: errorMessage };

      await recordSyncLog({
        source,
        dataType: endpoint,
        statusCode,
        recordsProcessed: endpointCount,
        errorMessage,
      });
      options.onProgress?.(`[${endpoint}] Error (${statusCode}): ${errorMessage}`);
    }
  }

  return {
    startDate,
    endDate,
    summary,
    totalRecords,
  };
}
