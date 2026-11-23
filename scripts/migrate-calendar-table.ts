import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

/**
 * Idempotent additive SQL migration for Phase 7 calendar load telemetry.
 * Never modifies or drops shared st_* tables.
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not defined');
  }

  const sql = neon(connectionString);

  await sql`
    CREATE TABLE IF NOT EXISTS "life_calendar_daily" (
      "day" text PRIMARY KEY NOT NULL,
      "calendar_event_count" integer DEFAULT 0 NOT NULL,
      "calendar_scheduled_mins" integer DEFAULT 0 NOT NULL,
      "calendar_early_start" boolean DEFAULT false NOT NULL,
      "calendar_latest_end_hour" double precision,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `;

  const [tableCheck] = await sql`
    SELECT table_name, count(column_name)::int AS columns
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'life_calendar_daily'
    GROUP BY table_name
  `;
  const [stCount] = await sql`SELECT count(*)::int AS count FROM st_daily_summary`;

  console.log('Applied life_calendar_daily:', JSON.stringify(tableCheck));
  console.log('st_daily_summary count:', JSON.stringify(stCount));
}

main().catch((err) => {
  console.error(
    'Calendar table migration failed:',
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
