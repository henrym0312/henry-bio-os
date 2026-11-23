import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

/**
 * Idempotent additive migration for the HenryLifeOS Phase 4 analytics layer:
 * creates the daily_life_matrix SQL view and pre-computed insight tables.
 * Never alters or drops shared henry-screen-os (st_*) tables.
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not defined');
  }

  const sql = neon(connectionString);

  const statements: Array<{ label: string; query: string }> = [
    {
      label: 'life_analytics_runs',
      query: `
        CREATE TABLE IF NOT EXISTS "life_analytics_runs" (
          "id" serial PRIMARY KEY NOT NULL,
          "ran_at" timestamp with time zone DEFAULT now() NOT NULL,
          "window_days" integer NOT NULL,
          "matrix_days" integer NOT NULL,
          "summary_json" jsonb NOT NULL
        )
      `,
    },
    {
      label: 'life_insights_drivers',
      query: `
        CREATE TABLE IF NOT EXISTS "life_insights_drivers" (
          "id" serial PRIMARY KEY NOT NULL,
          "run_id" integer NOT NULL,
          "outcome_key" text NOT NULL,
          "outcome_label" text NOT NULL,
          "feature_key" text NOT NULL,
          "feature_label" text NOT NULL,
          "lag_days" integer NOT NULL,
          "sample_n" integer NOT NULL,
          "spearman_r" double precision NOT NULL,
          "p_value" double precision NOT NULL,
          "fdr_q_value" double precision,
          "shap_importance" double precision,
          "marginal_effect" double precision,
          "direction" text NOT NULL,
          "confidence_tier" text NOT NULL
        )
      `,
    },
    {
      label: 'idx_life_insights_drivers_run_id',
      query: `CREATE INDEX IF NOT EXISTS "idx_life_insights_drivers_run_id" ON "life_insights_drivers" USING btree ("run_id")`,
    },
    {
      label: 'idx_life_insights_drivers_outcome_lag',
      query: `CREATE INDEX IF NOT EXISTS "idx_life_insights_drivers_outcome_lag" ON "life_insights_drivers" USING btree ("outcome_key", "lag_days")`,
    },
    {
      label: 'life_threshold_cliffs',
      query: `
        CREATE TABLE IF NOT EXISTS "life_threshold_cliffs" (
          "id" serial PRIMARY KEY NOT NULL,
          "run_id" integer NOT NULL,
          "outcome_key" text NOT NULL,
          "outcome_label" text NOT NULL,
          "feature_key" text NOT NULL,
          "feature_label" text NOT NULL,
          "threshold_rule" text NOT NULL,
          "low_bucket_label" text NOT NULL,
          "high_bucket_label" text NOT NULL,
          "low_n" integer NOT NULL,
          "high_n" integer NOT NULL,
          "low_median" double precision NOT NULL,
          "high_median" double precision NOT NULL,
          "median_delta" double precision NOT NULL,
          "p_value" double precision NOT NULL
        )
      `,
    },
    {
      label: 'idx_life_threshold_cliffs_run_id',
      query: `CREATE INDEX IF NOT EXISTS "idx_life_threshold_cliffs_run_id" ON "life_threshold_cliffs" USING btree ("run_id")`,
    },
    {
      label: 'life_group_contrasts',
      query: `
        CREATE TABLE IF NOT EXISTS "life_group_contrasts" (
          "id" serial PRIMARY KEY NOT NULL,
          "run_id" integer NOT NULL,
          "cohort_label" text NOT NULL,
          "feature_key" text NOT NULL,
          "feature_label" text NOT NULL,
          "best_10_mean" double precision NOT NULL,
          "worst_10_mean" double precision NOT NULL,
          "effect_size_d" double precision NOT NULL,
          "sample_n" integer NOT NULL
        )
      `,
    },
    {
      label: 'idx_life_group_contrasts_run_id',
      query: `CREATE INDEX IF NOT EXISTS "idx_life_group_contrasts_run_id" ON "life_group_contrasts" USING btree ("run_id")`,
    },
    {
      label: 'life_experiments',
      query: `
        CREATE TABLE IF NOT EXISTS "life_experiments" (
          "id" serial PRIMARY KEY NOT NULL,
          "name" text NOT NULL,
          "hypothesis" text NOT NULL,
          "feature_key" text NOT NULL,
          "target_outcomes" jsonb NOT NULL,
          "start_day" text NOT NULL,
          "end_day" text NOT NULL,
          "baseline_days" integer DEFAULT 21 NOT NULL,
          "status" text DEFAULT 'active' NOT NULL,
          "verdict" text,
          "results_json" jsonb,
          "created_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `,
    },
    {
      label: 'daily_life_matrix',
      query: `
        CREATE OR REPLACE VIEW "daily_life_matrix" AS
        WITH all_days AS (
          SELECT day FROM oura_daily_readiness
          UNION
          SELECT day FROM oura_daily_sleep
          UNION
          SELECT to_char(day, 'YYYY-MM-DD') AS day FROM st_daily_summary
          UNION
          SELECT day FROM life_weather_daily
          UNION
          SELECT day FROM life_comms_daily
          UNION
          SELECT day FROM life_supplement_adherence
        ),
        primary_sleep AS (
          SELECT DISTINCT ON (day)
            day,
            average_hrv,
            deep_sleep_duration,
            rem_sleep_duration,
            total_sleep_duration,
            efficiency,
            latency,
            lowest_heart_rate
          FROM oura_sleep
          ORDER BY
            day,
            CASE WHEN type = 'long_sleep' THEN 0 ELSE 1 END,
            total_sleep_duration DESC NULLS LAST
        ),
        st_apps_daily AS (
          SELECT
            to_char(day, 'YYYY-MM-DD') AS day,
            SUM(CASE WHEN category = 'Social' THEN duration_s ELSE 0 END) AS social_s,
            SUM(CASE WHEN category = 'Media' THEN duration_s ELSE 0 END) AS media_s,
            SUM(CASE WHEN category IN ('Productivity', 'Coding', 'AI') THEN duration_s ELSE 0 END) AS prod_s
          FROM st_daily_apps
          GROUP BY to_char(day, 'YYYY-MM-DD')
        ),
        meds_daily AS (
          SELECT
            day,
            COUNT(*)::integer AS adhd_med_doses,
            SUM(mg)::double precision AS adhd_total_mg,
            MAX(
              EXTRACT(HOUR FROM (taken_at AT TIME ZONE 'Europe/London')) +
              EXTRACT(MINUTE FROM (taken_at AT TIME ZONE 'Europe/London')) / 60.0
            )::double precision AS last_adhd_med_hour
          FROM med_logs
          GROUP BY day
        ),
        caffeine_daily AS (
          SELECT
            day,
            SUM(mg)::double precision AS caffeine_total_mg,
            MAX(
              EXTRACT(HOUR FROM (taken_at AT TIME ZONE 'Europe/London')) +
              EXTRACT(MINUTE FROM (taken_at AT TIME ZONE 'Europe/London')) / 60.0
            )::double precision AS last_caffeine_hour
          FROM life_caffeine_logs
          GROUP BY day
        ),
        alcohol_daily AS (
          SELECT
            day,
            SUM(units)::double precision AS alcohol_units,
            MAX(
              EXTRACT(HOUR FROM (logged_at AT TIME ZONE 'Europe/London')) +
              EXTRACT(MINUTE FROM (logged_at AT TIME ZONE 'Europe/London')) / 60.0
            )::double precision AS last_alcohol_hour
          FROM life_alcohol_logs
          GROUP BY day
        ),
        spending_daily AS (
          SELECT
            day,
            ROUND(SUM(amount_gbp)::numeric, 2)::double precision AS spend_total_gbp,
            COUNT(*)::integer AS tx_count,
            ROUND(SUM(CASE WHEN category = 'groceries' THEN amount_gbp ELSE 0 END)::numeric, 2)::double precision AS spend_groceries_gbp,
            ROUND(SUM(CASE WHEN category = 'takeaway_convenience' THEN amount_gbp ELSE 0 END)::numeric, 2)::double precision AS spend_takeaway_gbp,
            ROUND(SUM(CASE WHEN category = 'coffee' THEN amount_gbp ELSE 0 END)::numeric, 2)::double precision AS spend_coffee_gbp,
            ROUND(SUM(CASE WHEN category = 'social_pubs' THEN amount_gbp ELSE 0 END)::numeric, 2)::double precision AS spend_social_pubs_gbp,
            SUM(CASE WHEN is_late_spend THEN 1 ELSE 0 END)::integer AS late_spend_count
          FROM life_spending_tx
          GROUP BY day
        )
        SELECT
          d.day,
          -- Outcomes (Y candidates)
          ps.average_hrv::double precision AS hrv_avg_ms,
          ROUND((ps.deep_sleep_duration / 60.0)::numeric, 2)::double precision AS deep_sleep_min,
          ROUND((ps.rem_sleep_duration / 60.0)::numeric, 2)::double precision AS rem_sleep_min,
          ROUND((ps.total_sleep_duration / 60.0)::numeric, 2)::double precision AS total_sleep_min,
          ps.efficiency::double precision AS sleep_efficiency_pct,
          ROUND((ps.latency / 60.0)::numeric, 2)::double precision AS sleep_latency_min,
          ps.lowest_heart_rate::double precision AS lowest_hr_bpm,
          dr.temperature_deviation AS temp_deviation_c,
          dr.score::double precision AS readiness_score,
          ds.score::double precision AS sleep_score,
          da.score::double precision AS activity_score,
          da.steps::double precision AS steps,
          da.active_calories::double precision AS active_calories,
          ROUND((dst.stress_high / 60.0)::numeric, 2)::double precision AS stress_high_mins,
          ROUND((dst.recovery_high / 60.0)::numeric, 2)::double precision AS recovery_high_mins,
          sub.mental_focus::double precision AS mental_focus,
          sub.energy::double precision AS energy,
          sub.mood_calm::double precision AS mood_calm,
          sub.physical_soreness::double precision AS physical_soreness,
          (dtm.completed_count::double precision / NULLIF(dtm.start_count + dtm.added_count, 0)) AS task_completion_rate,
          dtm.remaining_count::double precision AS tasks_remaining,

          -- Screen Time (st_*)
          ROUND((st.mac_s / 60.0)::numeric, 2)::double precision AS mac_mins,
          ROUND((st.iphone_s / 60.0)::numeric, 2)::double precision AS iphone_mins,
          ROUND((st.combined_s / 60.0)::numeric, 2)::double precision AS combined_screen_mins,
          ROUND((st.wall_clock_s / 60.0)::numeric, 2)::double precision AS wall_clock_screen_mins,
          ROUND((st.late_night_s / 60.0)::numeric, 2)::double precision AS late_night_screen_mins,
          ROUND((st.deep_work_s / 60.0)::numeric, 2)::double precision AS deep_work_mins,
          st.context_switches::double precision AS context_switches,
          st.micro_checks::double precision AS micro_checks,
          ROUND((sta.social_s / 60.0)::numeric, 2)::double precision AS social_screen_mins,
          ROUND((sta.media_s / 60.0)::numeric, 2)::double precision AS video_screen_mins,
          ROUND((sta.prod_s / 60.0)::numeric, 2)::double precision AS dev_productivity_mins,

          -- Meds & Supplements
          med.adhd_med_doses,
          med.adhd_total_mg,
          ROUND(med.last_adhd_med_hour::numeric, 2)::double precision AS last_adhd_med_hour,
          CASE WHEN sup.day IS NULL THEN NULL WHEN sup.am_taken THEN 1 ELSE 0 END AS am_pills_taken,
          CASE WHEN sup.day IS NULL THEN NULL WHEN sup.pm_taken THEN 1 ELSE 0 END AS pm_pills_taken,
          sup.creatine_mg::double precision AS creatine_mg,
          sup.ginkgo_mg::double precision AS ginkgo_mg,
          sup.ashwagandha_mg::double precision AS ashwagandha_mg,
          sup.vitamin_d_ug::double precision AS vitamin_d_ug,
          sup.magnesium_citrate_mg::double precision AS magnesium_citrate_mg,

          -- Caffeine & Alcohol
          caf.caffeine_total_mg,
          ROUND(caf.last_caffeine_hour::numeric, 2)::double precision AS last_caffeine_hour,
          (
            SELECT ROUND(
              SUM(
                c.mg * POWER(
                  0.5::double precision,
                  EXTRACT(EPOCH FROM (((d.day || ' 23:00:00')::timestamp AT TIME ZONE 'Europe/London') - c.taken_at)) / 18000.0
                )
              )::numeric,
              2
            )::double precision
            FROM life_caffeine_logs c
            WHERE c.taken_at <= ((d.day || ' 23:00:00')::timestamp AT TIME ZONE 'Europe/London')
              AND c.taken_at >= (((d.day || ' 23:00:00')::timestamp AT TIME ZONE 'Europe/London') - interval '36 hours')
          ) AS bedtime_caffeine_mg,
          alc.alcohol_units,
          ROUND(alc.last_alcohol_hour::numeric, 2)::double precision AS last_alcohol_hour,

          -- Comms
          lc.emails_received_gmail::double precision AS emails_received_gmail,
          lc.emails_sent_gmail::double precision AS emails_sent_gmail,
          lc.emails_received_uni::double precision AS emails_received_uni,
          lc.emails_sent_uni::double precision AS emails_sent_uni,
          (
            lc.emails_received_gmail + lc.emails_sent_gmail +
            lc.emails_received_uni + lc.emails_sent_uni +
            lc.emails_received_other + lc.emails_sent_other
          )::double precision AS emails_total,
          lc.imessages_received::double precision AS imessages_received,
          lc.imessages_sent::double precision AS imessages_sent,
          (lc.imessages_received + lc.imessages_sent)::double precision AS imessages_total,
          lc.late_comms_count::double precision AS late_comms_count,

          -- Weather & AQI
          lw.temp_mean_c,
          lw.humidity_pct,
          lw.uv_max,
          lw.cloud_cover_pct,
          lw.precipitation_mm,
          lw.pressure_hpa,
          lw.pressure_delta_24h,
          lw.pm25,
          lw.european_aqi,
          lw.photoperiod_hours,

          -- Acoustic & Apple Health
          lah.env_audio_avg_db,
          lah.env_audio_max_db,
          lah.headphone_audio_avg_db,
          lah.headphone_audio_mins,
          lah.time_in_daylight_mins,
          lah.body_mass_kg,
          lah.workout_mins,

          -- Presence & Media
          lp.hours_at_home,
          lp.drive_mins::double precision AS drive_mins,
          lp.drive_trips::double precision AS drive_trips,
          CASE
            WHEN lp.sleep_location = 'away' THEN 1
            WHEN lp.sleep_location IN ('durham_flat', 'yorkshire_home') THEN 0
            ELSE NULL
          END AS is_away_sleep,
          lm.tv_active_mins::double precision AS tv_active_mins,
          lm.tv_late_mins::double precision AS tv_late_mins,
          lm.audio_playback_mins::double precision AS audio_playback_mins,
          lm.music_mins::double precision AS music_mins,
          lm.video_mins::double precision AS video_mins,
          CASE WHEN lm.day IS NULL THEN NULL WHEN lm.bedtime_audio_used THEN 1 ELSE 0 END AS bedtime_audio_used,

          -- Spending
          sp.spend_total_gbp,
          sp.tx_count::double precision AS tx_count,
          sp.spend_groceries_gbp,
          sp.spend_takeaway_gbp,
          sp.spend_coffee_gbp,
          sp.spend_social_pubs_gbp,
          sp.late_spend_count::double precision AS late_spend_count,

          -- Subjective & Context
          sub.social_bandwidth::double precision AS social_bandwidth,
          CASE WHEN EXTRACT(ISODOW FROM d.day::date) IN (6, 7) THEN 1 ELSE 0 END AS is_weekend
        FROM all_days d
        LEFT JOIN oura_daily_readiness dr ON dr.day = d.day
        LEFT JOIN oura_daily_sleep ds ON ds.day = d.day
        LEFT JOIN primary_sleep ps ON ps.day = d.day
        LEFT JOIN oura_daily_activity da ON da.day = d.day
        LEFT JOIN oura_daily_stress dst ON dst.day = d.day
        LEFT JOIN daily_task_metrics dtm ON dtm.day = d.day
        LEFT JOIN st_daily_summary st ON to_char(st.day, 'YYYY-MM-DD') = d.day
        LEFT JOIN st_apps_daily sta ON sta.day = d.day
        LEFT JOIN meds_daily med ON med.day = d.day
        LEFT JOIN life_supplement_adherence sup ON sup.day = d.day
        LEFT JOIN caffeine_daily caf ON caf.day = d.day
        LEFT JOIN alcohol_daily alc ON alc.day = d.day
        LEFT JOIN life_comms_daily lc ON lc.day = d.day
        LEFT JOIN life_weather_daily lw ON lw.day = d.day
        LEFT JOIN life_acoustic_health_daily lah ON lah.day = d.day
        LEFT JOIN life_presence_daily lp ON lp.day = d.day
        LEFT JOIN life_media_daily lm ON lm.day = d.day
        LEFT JOIN spending_daily sp ON sp.day = d.day
        LEFT JOIN life_subjective_daily sub ON sub.day = d.day
        ORDER BY d.day ASC
      `,
    },
  ];

  for (const stmt of statements) {
    await sql.query(stmt.query);
    console.log(`Applied: ${stmt.label}`);
  }

  const viewCheck = await sql`
    SELECT
      count(*)::int AS total_days,
      min(day) AS min_day,
      max(day) AS max_day,
      count(hrv_avg_ms)::int AS hrv_n,
      count(readiness_score)::int AS readiness_n,
      count(mac_mins)::int AS screentime_n,
      count(adhd_total_mg)::int AS meds_n,
      count(am_pills_taken)::int AS supplements_n,
      count(emails_total)::int AS comms_n,
      count(temp_mean_c)::int AS weather_n,
      count(hours_at_home)::int AS presence_n,
      count(audio_playback_mins)::int AS media_n
    FROM daily_life_matrix
  `;
  const stCount = await sql`SELECT count(*)::int AS count FROM st_daily_summary`;

  console.log('daily_life_matrix summary:', JSON.stringify(viewCheck[0]));
  console.log('st_daily_summary count:', JSON.stringify(stCount[0]));
  process.exit(0);
}

main().catch((err) => {
  console.error('Analytics migration failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
