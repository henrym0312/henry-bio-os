import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

/**
 * Idempotent additive SQL migration for HenryLifeOS tables.
 * Uses CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS only and
 * never touches existing Oura or shared henry-screen-os (st_*) tables.
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not defined');
  }

  const sql = neon(connectionString);

  const statements: Array<{ label: string; query: string }> = [
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

  for (const stmt of statements) {
    await sql.query(stmt.query);
    console.log(`Applied: ${stmt.label}`);
  }

  const lifeTables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE 'life_%'
    ORDER BY table_name
  `;
  const stCounts = await sql`
    SELECT
      (SELECT count(*)::int FROM st_daily_summary) AS st_daily_summary_count,
      (SELECT count(*)::int FROM st_daily_apps) AS st_daily_apps_count,
      (SELECT count(*)::int FROM st_hourly_activity) AS st_hourly_activity_count
  `;

  console.log('Verified life_* tables:', lifeTables.map((r) => r.table_name));
  console.log('Verified st_* row counts:', JSON.stringify(stCounts[0]));
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
