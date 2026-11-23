import { Pool, neonConfig } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import ws from 'ws';

dotenv.config({ path: '.env.local' });
neonConfig.webSocketConstructor = ws;

/**
 * Idempotent additive SQL migration for HenryBioOS core and HenryLifeOS tables.
 * Uses CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS only and
 * never alters or drops existing Oura or shared henry-screen-os (st_*) tables.
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not defined');
  }

  const pool = new Pool({ connectionString });

  const statements: Array<{ label: string; query: string }> = [
    {
      label: 'oura_oauth_tokens',
      query: `
        CREATE TABLE IF NOT EXISTS "oura_oauth_tokens" (
          "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
          "access_token" text NOT NULL,
          "refresh_token" text NOT NULL,
          "expires_at" timestamp with time zone NOT NULL,
          "scopes" text NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'webhook_subscriptions',
      query: `
        CREATE TABLE IF NOT EXISTS "webhook_subscriptions" (
          "id" text PRIMARY KEY NOT NULL,
          "data_type" text NOT NULL,
          "event_type" text NOT NULL,
          "expiration_time" timestamp with time zone NOT NULL,
          "callback_url" text NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'idx_webhook_subscriptions_data_event',
      query: `CREATE INDEX IF NOT EXISTS "idx_webhook_subscriptions_data_event" ON "webhook_subscriptions" USING btree ("data_type", "event_type")`,
    },
    {
      label: 'sync_logs',
      query: `
        CREATE TABLE IF NOT EXISTS "sync_logs" (
          "id" serial PRIMARY KEY NOT NULL,
          "source" text NOT NULL,
          "data_type" text NOT NULL,
          "event_type" text,
          "object_id" text,
          "status_code" integer NOT NULL,
          "records_processed" integer DEFAULT 0 NOT NULL,
          "error_message" text,
          "created_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'idx_sync_logs_created_at',
      query: `CREATE INDEX IF NOT EXISTS "idx_sync_logs_created_at" ON "sync_logs" USING btree ("created_at")`,
    },
    {
      label: 'idx_sync_logs_data_type',
      query: `CREATE INDEX IF NOT EXISTS "idx_sync_logs_data_type" ON "sync_logs" USING btree ("data_type")`,
    },
    {
      label: 'oura_personal_info',
      query: `
        CREATE TABLE IF NOT EXISTS "oura_personal_info" (
          "id" text PRIMARY KEY NOT NULL,
          "age" integer,
          "weight" double precision,
          "height" double precision,
          "biological_sex" text,
          "email" text,
          "raw_payload" jsonb NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'oura_ring_configuration',
      query: `
        CREATE TABLE IF NOT EXISTS "oura_ring_configuration" (
          "id" text PRIMARY KEY NOT NULL,
          "color" text,
          "design" text,
          "firmware_version" text,
          "hardware_type" text,
          "set_up_at" text,
          "size" integer,
          "raw_payload" jsonb NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'oura_daily_readiness',
      query: `
        CREATE TABLE IF NOT EXISTS "oura_daily_readiness" (
          "id" text PRIMARY KEY NOT NULL,
          "day" text NOT NULL,
          "score" integer,
          "temperature_deviation" double precision,
          "temperature_trend_deviation" double precision,
          "timestamp" text,
          "contributors" jsonb,
          "raw_payload" jsonb NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'idx_oura_daily_readiness_day',
      query: `CREATE INDEX IF NOT EXISTS "idx_oura_daily_readiness_day" ON "oura_daily_readiness" USING btree ("day")`,
    },
    {
      label: 'oura_daily_sleep',
      query: `
        CREATE TABLE IF NOT EXISTS "oura_daily_sleep" (
          "id" text PRIMARY KEY NOT NULL,
          "day" text NOT NULL,
          "score" integer,
          "timestamp" text,
          "contributors" jsonb,
          "raw_payload" jsonb NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'idx_oura_daily_sleep_day',
      query: `CREATE INDEX IF NOT EXISTS "idx_oura_daily_sleep_day" ON "oura_daily_sleep" USING btree ("day")`,
    },
    {
      label: 'oura_sleep',
      query: `
        CREATE TABLE IF NOT EXISTS "oura_sleep" (
          "id" text PRIMARY KEY NOT NULL,
          "day" text NOT NULL,
          "type" text,
          "period" integer,
          "bedtime_start" text NOT NULL,
          "bedtime_end" text NOT NULL,
          "total_sleep_duration" integer,
          "deep_sleep_duration" integer,
          "rem_sleep_duration" integer,
          "light_sleep_duration" integer,
          "awake_time" integer,
          "time_in_bed" integer,
          "efficiency" integer,
          "latency" integer,
          "average_breath" double precision,
          "average_heart_rate" double precision,
          "lowest_heart_rate" integer,
          "average_hrv" integer,
          "restless_periods" integer,
          "readiness_score_delta" integer,
          "sleep_score_delta" integer,
          "sleep_phase_30_sec" text,
          "sleep_phase_5_min" text,
          "movement_30_sec" text,
          "heart_rate" jsonb,
          "hrv" jsonb,
          "readiness" jsonb,
          "low_battery_alert" boolean,
          "sleep_algorithm_version" text,
          "sleep_analysis_reason" text,
          "raw_payload" jsonb NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'idx_oura_sleep_day',
      query: `CREATE INDEX IF NOT EXISTS "idx_oura_sleep_day" ON "oura_sleep" USING btree ("day")`,
    },
    {
      label: 'idx_oura_sleep_bedtime_start',
      query: `CREATE INDEX IF NOT EXISTS "idx_oura_sleep_bedtime_start" ON "oura_sleep" USING btree ("bedtime_start")`,
    },
    {
      label: 'oura_sleep_time',
      query: `
        CREATE TABLE IF NOT EXISTS "oura_sleep_time" (
          "id" text PRIMARY KEY NOT NULL,
          "day" text NOT NULL,
          "optimal_bedtime" jsonb,
          "recommendation" text,
          "status" text,
          "raw_payload" jsonb NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'idx_oura_sleep_time_day',
      query: `CREATE INDEX IF NOT EXISTS "idx_oura_sleep_time_day" ON "oura_sleep_time" USING btree ("day")`,
    },
    {
      label: 'oura_daily_activity',
      query: `
        CREATE TABLE IF NOT EXISTS "oura_daily_activity" (
          "id" text PRIMARY KEY NOT NULL,
          "day" text NOT NULL,
          "score" integer,
          "active_calories" integer,
          "total_calories" integer,
          "steps" integer,
          "equivalent_walking_distance" integer,
          "high_activity_time" integer,
          "medium_activity_time" integer,
          "low_activity_time" integer,
          "sedentary_time" integer,
          "resting_time" integer,
          "non_wear_time" integer,
          "high_activity_met_minutes" integer,
          "medium_activity_met_minutes" integer,
          "low_activity_met_minutes" integer,
          "sedentary_met_minutes" integer,
          "inactivity_alerts" integer,
          "average_met_minutes" double precision,
          "meters_to_target" integer,
          "target_calories" integer,
          "target_meters" integer,
          "class_5_min" text,
          "met" jsonb,
          "contributors" jsonb,
          "timestamp" text,
          "raw_payload" jsonb NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'idx_oura_daily_activity_day',
      query: `CREATE INDEX IF NOT EXISTS "idx_oura_daily_activity_day" ON "oura_daily_activity" USING btree ("day")`,
    },
    {
      label: 'oura_daily_stress',
      query: `
        CREATE TABLE IF NOT EXISTS "oura_daily_stress" (
          "id" text PRIMARY KEY NOT NULL,
          "day" text NOT NULL,
          "stress_high" integer,
          "recovery_high" integer,
          "day_summary" text,
          "raw_payload" jsonb NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'idx_oura_daily_stress_day',
      query: `CREATE INDEX IF NOT EXISTS "idx_oura_daily_stress_day" ON "oura_daily_stress" USING btree ("day")`,
    },
    {
      label: 'oura_daily_resilience',
      query: `
        CREATE TABLE IF NOT EXISTS "oura_daily_resilience" (
          "id" text PRIMARY KEY NOT NULL,
          "day" text NOT NULL,
          "level" text,
          "contributors" jsonb,
          "raw_payload" jsonb NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'idx_oura_daily_resilience_day',
      query: `CREATE INDEX IF NOT EXISTS "idx_oura_daily_resilience_day" ON "oura_daily_resilience" USING btree ("day")`,
    },
    {
      label: 'oura_daily_spo2',
      query: `
        CREATE TABLE IF NOT EXISTS "oura_daily_spo2" (
          "id" text PRIMARY KEY NOT NULL,
          "day" text NOT NULL,
          "spo2_average" double precision,
          "breathing_disturbance_index" integer,
          "raw_payload" jsonb NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'idx_oura_daily_spo2_day',
      query: `CREATE INDEX IF NOT EXISTS "idx_oura_daily_spo2_day" ON "oura_daily_spo2" USING btree ("day")`,
    },
    {
      label: 'oura_daily_cardiovascular_age',
      query: `
        CREATE TABLE IF NOT EXISTS "oura_daily_cardiovascular_age" (
          "id" text PRIMARY KEY NOT NULL,
          "day" text NOT NULL,
          "vascular_age" integer,
          "pulse_wave_velocity" double precision,
          "raw_payload" jsonb NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'idx_oura_daily_cardiovascular_age_day',
      query: `CREATE INDEX IF NOT EXISTS "idx_oura_daily_cardiovascular_age_day" ON "oura_daily_cardiovascular_age" USING btree ("day")`,
    },
    {
      label: 'oura_vo2_max',
      query: `
        CREATE TABLE IF NOT EXISTS "oura_vo2_max" (
          "id" text PRIMARY KEY NOT NULL,
          "day" text NOT NULL,
          "timestamp" text,
          "vo2_max" double precision,
          "raw_payload" jsonb NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'idx_oura_vo2_max_day',
      query: `CREATE INDEX IF NOT EXISTS "idx_oura_vo2_max_day" ON "oura_vo2_max" USING btree ("day")`,
    },
    {
      label: 'oura_workout',
      query: `
        CREATE TABLE IF NOT EXISTS "oura_workout" (
          "id" text PRIMARY KEY NOT NULL,
          "day" text NOT NULL,
          "activity" text,
          "calories" double precision,
          "distance" double precision,
          "start_datetime" text,
          "end_datetime" text,
          "intensity" text,
          "label" text,
          "source" text,
          "raw_payload" jsonb NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'idx_oura_workout_day',
      query: `CREATE INDEX IF NOT EXISTS "idx_oura_workout_day" ON "oura_workout" USING btree ("day")`,
    },
    {
      label: 'oura_session',
      query: `
        CREATE TABLE IF NOT EXISTS "oura_session" (
          "id" text PRIMARY KEY NOT NULL,
          "day" text NOT NULL,
          "start_datetime" text,
          "end_datetime" text,
          "type" text,
          "mood" text,
          "heart_rate" jsonb,
          "heart_rate_variability" jsonb,
          "motion_count" jsonb,
          "raw_payload" jsonb NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'idx_oura_session_day',
      query: `CREATE INDEX IF NOT EXISTS "idx_oura_session_day" ON "oura_session" USING btree ("day")`,
    },
    {
      label: 'oura_enhanced_tag',
      query: `
        CREATE TABLE IF NOT EXISTS "oura_enhanced_tag" (
          "id" text PRIMARY KEY NOT NULL,
          "start_day" text NOT NULL,
          "end_day" text,
          "start_time" text NOT NULL,
          "end_time" text,
          "tag_type_code" text,
          "custom_name" text,
          "comment" text,
          "raw_payload" jsonb NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'idx_oura_enhanced_tag_start_day',
      query: `CREATE INDEX IF NOT EXISTS "idx_oura_enhanced_tag_start_day" ON "oura_enhanced_tag" USING btree ("start_day")`,
    },
    {
      label: 'oura_tag',
      query: `
        CREATE TABLE IF NOT EXISTS "oura_tag" (
          "id" text PRIMARY KEY NOT NULL,
          "day" text NOT NULL,
          "text" text,
          "timestamp" text,
          "tags" jsonb NOT NULL,
          "raw_payload" jsonb NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'idx_oura_tag_day',
      query: `CREATE INDEX IF NOT EXISTS "idx_oura_tag_day" ON "oura_tag" USING btree ("day")`,
    },
    {
      label: 'oura_rest_mode_period',
      query: `
        CREATE TABLE IF NOT EXISTS "oura_rest_mode_period" (
          "id" text PRIMARY KEY NOT NULL,
          "start_day" text NOT NULL,
          "start_time" text,
          "end_day" text,
          "end_time" text,
          "episodes" jsonb NOT NULL,
          "raw_payload" jsonb NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'idx_oura_rest_mode_period_start_day',
      query: `CREATE INDEX IF NOT EXISTS "idx_oura_rest_mode_period_start_day" ON "oura_rest_mode_period" USING btree ("start_day")`,
    },
    {
      label: 'oura_heartrate',
      query: `
        CREATE TABLE IF NOT EXISTS "oura_heartrate" (
          "timestamp_unix" bigint NOT NULL,
          "source" text NOT NULL,
          "timestamp" text NOT NULL,
          "bpm" integer NOT NULL,
          "raw_payload" jsonb NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
          PRIMARY KEY ("timestamp_unix", "source")
        )
      `,
    },
    {
      label: 'idx_oura_heartrate_timestamp',
      query: `CREATE INDEX IF NOT EXISTS "idx_oura_heartrate_timestamp" ON "oura_heartrate" USING btree ("timestamp")`,
    },
    {
      label: 'oura_ring_battery_level',
      query: `
        CREATE TABLE IF NOT EXISTS "oura_ring_battery_level" (
          "timestamp_unix" bigint PRIMARY KEY NOT NULL,
          "timestamp" text NOT NULL,
          "level" integer NOT NULL,
          "charging" boolean,
          "in_charger" boolean,
          "raw_payload" jsonb NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'idx_oura_ring_battery_level_timestamp',
      query: `CREATE INDEX IF NOT EXISTS "idx_oura_ring_battery_level_timestamp" ON "oura_ring_battery_level" USING btree ("timestamp")`,
    },
    {
      label: 'med_logs',
      query: `
        CREATE TABLE IF NOT EXISTS "med_logs" (
          "id" text PRIMARY KEY NOT NULL,
          "dose_id" text NOT NULL,
          "drug_type" text NOT NULL,
          "mg" double precision NOT NULL,
          "taken_at" timestamp with time zone NOT NULL,
          "day" text NOT NULL,
          "raw_payload" jsonb NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'idx_med_logs_day',
      query: `CREATE INDEX IF NOT EXISTS "idx_med_logs_day" ON "med_logs" USING btree ("day")`,
    },
    {
      label: 'idx_med_logs_taken_at',
      query: `CREATE INDEX IF NOT EXISTS "idx_med_logs_taken_at" ON "med_logs" USING btree ("taken_at")`,
    },
    {
      label: 'daily_task_metrics',
      query: `
        CREATE TABLE IF NOT EXISTS "daily_task_metrics" (
          "day" text PRIMARY KEY NOT NULL,
          "start_count" integer NOT NULL,
          "added_count" integer NOT NULL,
          "completed_count" integer NOT NULL,
          "moved_count" integer NOT NULL,
          "remaining_count" integer NOT NULL,
          "completion_pct" double precision NOT NULL,
          "raw_payload" jsonb NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'ai_briefings',
      query: `
        CREATE TABLE IF NOT EXISTS "ai_briefings" (
          "id" serial PRIMARY KEY NOT NULL,
          "period_start" text NOT NULL,
          "period_end" text NOT NULL,
          "summary_markdown" text NOT NULL,
          "metrics_snapshot" jsonb NOT NULL,
          "created_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'idx_ai_briefings_created_at',
      query: `CREATE INDEX IF NOT EXISTS "idx_ai_briefings_created_at" ON "ai_briefings" USING btree ("created_at")`,
    },
    {
      label: 'alert_cooldowns',
      query: `
        CREATE TABLE IF NOT EXISTS "alert_cooldowns" (
          "alert_key" text PRIMARY KEY NOT NULL,
          "last_sent_at" timestamp with time zone NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'st_daily_summary (if not exists)',
      query: `
        CREATE TABLE IF NOT EXISTS "st_daily_summary" (
          "day" date PRIMARY KEY NOT NULL,
          "mac_s" integer NOT NULL,
          "iphone_s" integer NOT NULL,
          "combined_s" integer NOT NULL,
          "wall_clock_s" integer NOT NULL,
          "overlap_s" integer NOT NULL,
          "late_night_s" integer NOT NULL,
          "deep_night_s" integer NOT NULL,
          "deep_work_s" integer NOT NULL,
          "context_switches" integer NOT NULL,
          "micro_checks" integer NOT NULL,
          "first_active_at" timestamp with time zone,
          "last_active_at" timestamp with time zone,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'st_daily_apps (if not exists)',
      query: `
        CREATE TABLE IF NOT EXISTS "st_daily_apps" (
          "day" date NOT NULL,
          "device" text NOT NULL,
          "bundle_id" text NOT NULL,
          "app_name" text NOT NULL,
          "category" text NOT NULL,
          "duration_s" integer NOT NULL,
          "sessions" integer NOT NULL,
          "median_session_s" integer NOT NULL,
          "max_session_s" integer NOT NULL,
          PRIMARY KEY ("day", "device", "bundle_id")
        )
      `,
    },
    {
      label: 'st_hourly_activity (if not exists)',
      query: `
        CREATE TABLE IF NOT EXISTS "st_hourly_activity" (
          "day" date NOT NULL,
          "hour" smallint NOT NULL,
          "device" text NOT NULL,
          "duration_s" integer NOT NULL,
          PRIMARY KEY ("day", "hour", "device")
        )
      `,
    },
    {
      label: 'life_comms_daily',
      query: `
        CREATE TABLE IF NOT EXISTS "life_comms_daily" (
          "day" text PRIMARY KEY NOT NULL,
          "emails_received_gmail" integer DEFAULT 0 NOT NULL,
          "emails_sent_gmail" integer DEFAULT 0 NOT NULL,
          "emails_received_uni" integer DEFAULT 0 NOT NULL,
          "emails_sent_uni" integer DEFAULT 0 NOT NULL,
          "emails_received_other" integer DEFAULT 0 NOT NULL,
          "emails_sent_other" integer DEFAULT 0 NOT NULL,
          "imessages_received" integer DEFAULT 0 NOT NULL,
          "imessages_sent" integer DEFAULT 0 NOT NULL,
          "late_comms_count" integer DEFAULT 0 NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'life_caffeine_logs',
      query: `
        CREATE TABLE IF NOT EXISTS "life_caffeine_logs" (
          "id" text PRIMARY KEY NOT NULL,
          "day" text NOT NULL,
          "taken_at" timestamp with time zone NOT NULL,
          "mg" integer NOT NULL,
          "source" text NOT NULL,
          "notes" text,
          "created_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'idx_life_caffeine_logs_day',
      query: `CREATE INDEX IF NOT EXISTS "idx_life_caffeine_logs_day" ON "life_caffeine_logs" USING btree ("day")`,
    },
    {
      label: 'idx_life_caffeine_logs_taken_at',
      query: `CREATE INDEX IF NOT EXISTS "idx_life_caffeine_logs_taken_at" ON "life_caffeine_logs" USING btree ("taken_at")`,
    },
    {
      label: 'life_supplement_adherence',
      query: `
        CREATE TABLE IF NOT EXISTS "life_supplement_adherence" (
          "day" text PRIMARY KEY NOT NULL,
          "am_taken" boolean DEFAULT false NOT NULL,
          "am_completed_at" timestamp with time zone,
          "pm_taken" boolean DEFAULT false NOT NULL,
          "pm_completed_at" timestamp with time zone,
          "creatine_mg" integer DEFAULT 0 NOT NULL,
          "ginkgo_mg" integer DEFAULT 0 NOT NULL,
          "ashwagandha_mg" integer DEFAULT 0 NOT NULL,
          "vitamin_d_ug" integer DEFAULT 0 NOT NULL,
          "multivitamin_taken" boolean DEFAULT false NOT NULL,
          "vitamin_c_mg" integer DEFAULT 0 NOT NULL,
          "zinc_mg" integer DEFAULT 0 NOT NULL,
          "magnesium_citrate_mg" integer DEFAULT 0 NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'life_alcohol_logs',
      query: `
        CREATE TABLE IF NOT EXISTS "life_alcohol_logs" (
          "id" text PRIMARY KEY NOT NULL,
          "day" text NOT NULL,
          "logged_at" timestamp with time zone NOT NULL,
          "units" double precision NOT NULL,
          "drink_type" text NOT NULL,
          "notes" text,
          "created_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'idx_life_alcohol_logs_day',
      query: `CREATE INDEX IF NOT EXISTS "idx_life_alcohol_logs_day" ON "life_alcohol_logs" USING btree ("day")`,
    },
    {
      label: 'life_weather_daily',
      query: `
        CREATE TABLE IF NOT EXISTS "life_weather_daily" (
          "day" text PRIMARY KEY NOT NULL,
          "location_key" text NOT NULL,
          "lat" double precision NOT NULL,
          "lon" double precision NOT NULL,
          "temp_mean_c" double precision,
          "temp_min_c" double precision,
          "temp_max_c" double precision,
          "humidity_pct" double precision,
          "uv_max" double precision,
          "cloud_cover_pct" double precision,
          "precipitation_mm" double precision,
          "pressure_hpa" double precision,
          "pressure_delta_24h" double precision,
          "pm25" double precision,
          "european_aqi" double precision,
          "photoperiod_hours" double precision,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'life_acoustic_health_daily',
      query: `
        CREATE TABLE IF NOT EXISTS "life_acoustic_health_daily" (
          "day" text PRIMARY KEY NOT NULL,
          "env_audio_avg_db" double precision,
          "env_audio_max_db" double precision,
          "headphone_audio_avg_db" double precision,
          "headphone_audio_mins" double precision,
          "time_in_daylight_mins" double precision,
          "body_mass_kg" double precision,
          "workout_mins" double precision,
          "raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'life_presence_daily',
      query: `
        CREATE TABLE IF NOT EXISTS "life_presence_daily" (
          "day" text PRIMARY KEY NOT NULL,
          "hours_at_home" double precision,
          "first_departure_at" timestamp with time zone,
          "last_return_at" timestamp with time zone,
          "sleep_location" text DEFAULT 'unknown' NOT NULL,
          "drive_mins" integer DEFAULT 0 NOT NULL,
          "drive_trips" integer DEFAULT 0 NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'life_commute_events',
      query: `
        CREATE TABLE IF NOT EXISTS "life_commute_events" (
          "id" text PRIMARY KEY NOT NULL,
          "day" text NOT NULL,
          "event_type" text NOT NULL,
          "occurred_at" timestamp with time zone NOT NULL,
          "duration_mins" integer,
          "created_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'idx_life_commute_events_day',
      query: `CREATE INDEX IF NOT EXISTS "idx_life_commute_events_day" ON "life_commute_events" USING btree ("day")`,
    },
    {
      label: 'idx_life_commute_events_occurred_at',
      query: `CREATE INDEX IF NOT EXISTS "idx_life_commute_events_occurred_at" ON "life_commute_events" USING btree ("occurred_at")`,
    },
    {
      label: 'life_media_daily',
      query: `
        CREATE TABLE IF NOT EXISTS "life_media_daily" (
          "day" text PRIMARY KEY NOT NULL,
          "tv_active_mins" integer DEFAULT 0 NOT NULL,
          "tv_late_mins" integer DEFAULT 0 NOT NULL,
          "audio_playback_mins" integer DEFAULT 0 NOT NULL,
          "music_mins" integer DEFAULT 0 NOT NULL,
          "video_mins" integer DEFAULT 0 NOT NULL,
          "bedtime_audio_used" boolean DEFAULT false NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'life_spending_tx',
      query: `
        CREATE TABLE IF NOT EXISTS "life_spending_tx" (
          "id" text PRIMARY KEY NOT NULL,
          "day" text NOT NULL,
          "occurred_at" timestamp with time zone NOT NULL,
          "amount_gbp" double precision NOT NULL,
          "merchant" text NOT NULL,
          "category" text NOT NULL,
          "source" text NOT NULL,
          "is_late_spend" boolean DEFAULT false NOT NULL,
          "created_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'idx_life_spending_tx_day',
      query: `CREATE INDEX IF NOT EXISTS "idx_life_spending_tx_day" ON "life_spending_tx" USING btree ("day")`,
    },
    {
      label: 'idx_life_spending_tx_category',
      query: `CREATE INDEX IF NOT EXISTS "idx_life_spending_tx_category" ON "life_spending_tx" USING btree ("category")`,
    },
    {
      label: 'life_subjective_daily',
      query: `
        CREATE TABLE IF NOT EXISTS "life_subjective_daily" (
          "day" text PRIMARY KEY NOT NULL,
          "energy" integer NOT NULL,
          "mental_focus" integer NOT NULL,
          "mood_calm" integer NOT NULL,
          "physical_soreness" integer NOT NULL,
          "social_bandwidth" integer NOT NULL,
          "event_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
          "notes" text,
          "logged_at" timestamp with time zone DEFAULT now() NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
  ];

  try {
    for (const stmt of statements) {
      await pool.query(stmt.query);
      console.log(`Applied: ${stmt.label}`);
    }

    const lifeTables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name LIKE 'life_%'
      ORDER BY table_name
    `);
    const stCounts = await pool.query(`
      SELECT
        (SELECT count(*)::int FROM st_daily_summary) AS st_daily_summary_count,
        (SELECT count(*)::int FROM st_daily_apps) AS st_daily_apps_count,
        (SELECT count(*)::int FROM st_hourly_activity) AS st_hourly_activity_count
    `);

    console.log(
      'Verified life_* tables:',
      lifeTables.rows.map((r: { table_name: string }) => r.table_name),
    );
    console.log('Verified st_* row counts:', JSON.stringify(stCounts.rows[0]));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
