CREATE TABLE "ai_briefings" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_start" text NOT NULL,
	"period_end" text NOT NULL,
	"summary_markdown" text NOT NULL,
	"metrics_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_task_metrics" (
	"day" text PRIMARY KEY NOT NULL,
	"start_count" integer NOT NULL,
	"added_count" integer NOT NULL,
	"completed_count" integer NOT NULL,
	"moved_count" integer NOT NULL,
	"remaining_count" integer NOT NULL,
	"completion_pct" double precision NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "med_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"dose_id" text NOT NULL,
	"drug_type" text NOT NULL,
	"mg" double precision NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"day" text NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oura_daily_activity" (
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
);
--> statement-breakpoint
CREATE TABLE "oura_daily_cardiovascular_age" (
	"id" text PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"vascular_age" integer,
	"pulse_wave_velocity" double precision,
	"raw_payload" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oura_daily_readiness" (
	"id" text PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"score" integer,
	"temperature_deviation" double precision,
	"temperature_trend_deviation" double precision,
	"timestamp" text,
	"contributors" jsonb,
	"raw_payload" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oura_daily_resilience" (
	"id" text PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"level" text,
	"contributors" jsonb,
	"raw_payload" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oura_daily_sleep" (
	"id" text PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"score" integer,
	"timestamp" text,
	"contributors" jsonb,
	"raw_payload" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oura_daily_spo2" (
	"id" text PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"spo2_average" double precision,
	"breathing_disturbance_index" integer,
	"raw_payload" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oura_daily_stress" (
	"id" text PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"stress_high" integer,
	"recovery_high" integer,
	"day_summary" text,
	"raw_payload" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oura_enhanced_tag" (
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
);
--> statement-breakpoint
CREATE TABLE "oura_heartrate" (
	"timestamp_unix" bigint NOT NULL,
	"source" text NOT NULL,
	"timestamp" text NOT NULL,
	"bpm" integer NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oura_heartrate_timestamp_unix_source_pk" PRIMARY KEY("timestamp_unix","source")
);
--> statement-breakpoint
CREATE TABLE "oura_oauth_tokens" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scopes" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oura_personal_info" (
	"id" text PRIMARY KEY NOT NULL,
	"age" integer,
	"weight" double precision,
	"height" double precision,
	"biological_sex" text,
	"email" text,
	"raw_payload" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oura_rest_mode_period" (
	"id" text PRIMARY KEY NOT NULL,
	"start_day" text NOT NULL,
	"start_time" text,
	"end_day" text,
	"end_time" text,
	"episodes" jsonb NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oura_ring_battery_level" (
	"timestamp_unix" bigint PRIMARY KEY NOT NULL,
	"timestamp" text NOT NULL,
	"level" integer NOT NULL,
	"charging" boolean,
	"in_charger" boolean,
	"raw_payload" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oura_ring_configuration" (
	"id" text PRIMARY KEY NOT NULL,
	"color" text,
	"design" text,
	"firmware_version" text,
	"hardware_type" text,
	"set_up_at" text,
	"size" integer,
	"raw_payload" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oura_session" (
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
);
--> statement-breakpoint
CREATE TABLE "oura_sleep" (
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
);
--> statement-breakpoint
CREATE TABLE "oura_sleep_time" (
	"id" text PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"optimal_bedtime" jsonb,
	"recommendation" text,
	"status" text,
	"raw_payload" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oura_tag" (
	"id" text PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"text" text,
	"timestamp" text,
	"tags" jsonb NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oura_vo2_max" (
	"id" text PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"timestamp" text,
	"vo2_max" double precision,
	"raw_payload" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oura_workout" (
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
);
--> statement-breakpoint
CREATE TABLE "sync_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"data_type" text NOT NULL,
	"event_type" text,
	"object_id" text,
	"status_code" integer NOT NULL,
	"records_processed" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"data_type" text NOT NULL,
	"event_type" text NOT NULL,
	"expiration_time" timestamp with time zone NOT NULL,
	"callback_url" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_ai_briefings_created_at" ON "ai_briefings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_med_logs_day" ON "med_logs" USING btree ("day");--> statement-breakpoint
CREATE INDEX "idx_med_logs_taken_at" ON "med_logs" USING btree ("taken_at");--> statement-breakpoint
CREATE INDEX "idx_oura_daily_activity_day" ON "oura_daily_activity" USING btree ("day");--> statement-breakpoint
CREATE INDEX "idx_oura_daily_cardiovascular_age_day" ON "oura_daily_cardiovascular_age" USING btree ("day");--> statement-breakpoint
CREATE INDEX "idx_oura_daily_readiness_day" ON "oura_daily_readiness" USING btree ("day");--> statement-breakpoint
CREATE INDEX "idx_oura_daily_resilience_day" ON "oura_daily_resilience" USING btree ("day");--> statement-breakpoint
CREATE INDEX "idx_oura_daily_sleep_day" ON "oura_daily_sleep" USING btree ("day");--> statement-breakpoint
CREATE INDEX "idx_oura_daily_spo2_day" ON "oura_daily_spo2" USING btree ("day");--> statement-breakpoint
CREATE INDEX "idx_oura_daily_stress_day" ON "oura_daily_stress" USING btree ("day");--> statement-breakpoint
CREATE INDEX "idx_oura_enhanced_tag_start_day" ON "oura_enhanced_tag" USING btree ("start_day");--> statement-breakpoint
CREATE INDEX "idx_oura_heartrate_timestamp" ON "oura_heartrate" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_oura_rest_mode_period_start_day" ON "oura_rest_mode_period" USING btree ("start_day");--> statement-breakpoint
CREATE INDEX "idx_oura_ring_battery_level_timestamp" ON "oura_ring_battery_level" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_oura_session_day" ON "oura_session" USING btree ("day");--> statement-breakpoint
CREATE INDEX "idx_oura_sleep_day" ON "oura_sleep" USING btree ("day");--> statement-breakpoint
CREATE INDEX "idx_oura_sleep_bedtime_start" ON "oura_sleep" USING btree ("bedtime_start");--> statement-breakpoint
CREATE INDEX "idx_oura_sleep_time_day" ON "oura_sleep_time" USING btree ("day");--> statement-breakpoint
CREATE INDEX "idx_oura_tag_day" ON "oura_tag" USING btree ("day");--> statement-breakpoint
CREATE INDEX "idx_oura_vo2_max_day" ON "oura_vo2_max" USING btree ("day");--> statement-breakpoint
CREATE INDEX "idx_oura_workout_day" ON "oura_workout" USING btree ("day");--> statement-breakpoint
CREATE INDEX "idx_sync_logs_created_at" ON "sync_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_sync_logs_data_type" ON "sync_logs" USING btree ("data_type");--> statement-breakpoint
CREATE INDEX "idx_webhook_subscriptions_data_event" ON "webhook_subscriptions" USING btree ("data_type","event_type");