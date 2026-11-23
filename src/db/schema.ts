import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// ============================================================================
// A. System & Authentication Tables
// ============================================================================

export const ouraOauthTokens = pgTable('oura_oauth_tokens', {
  id: integer('id').primaryKey().default(1),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  scopes: text('scopes').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const webhookSubscriptions = pgTable(
  'webhook_subscriptions',
  {
    id: text('id').primaryKey(),
    dataType: text('data_type').notNull(),
    eventType: text('event_type').notNull(),
    expirationTime: timestamp('expiration_time', { withTimezone: true }).notNull(),
    callbackUrl: text('callback_url').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_webhook_subscriptions_data_event').on(table.dataType, table.eventType),
  ],
);

export const syncLogs = pgTable(
  'sync_logs',
  {
    id: serial('id').primaryKey(),
    source: text('source').notNull(),
    dataType: text('data_type').notNull(),
    eventType: text('event_type'),
    objectId: text('object_id'),
    statusCode: integer('status_code').notNull(),
    recordsProcessed: integer('records_processed').default(0).notNull(),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_sync_logs_created_at').on(table.createdAt),
    index('idx_sync_logs_data_type').on(table.dataType),
  ],
);

// ============================================================================
// B. All 19 Oura Cloud API v2 Production Endpoints
// ============================================================================

// 1. /v2/usercollection/personal_info
export const ouraPersonalInfo = pgTable('oura_personal_info', {
  id: text('id').primaryKey(),
  age: integer('age'),
  weight: doublePrecision('weight'),
  height: doublePrecision('height'),
  biologicalSex: text('biological_sex'),
  email: text('email'),
  rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 2. /v2/usercollection/ring_configuration
export const ouraRingConfiguration = pgTable('oura_ring_configuration', {
  id: text('id').primaryKey(),
  color: text('color'),
  design: text('design'),
  firmwareVersion: text('firmware_version'),
  hardwareType: text('hardware_type'),
  setUpAt: text('set_up_at'),
  size: integer('size'),
  rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 3. /v2/usercollection/daily_readiness
export const ouraDailyReadiness = pgTable(
  'oura_daily_readiness',
  {
    id: text('id').primaryKey(),
    day: text('day').notNull(),
    score: integer('score'),
    temperatureDeviation: doublePrecision('temperature_deviation'),
    temperatureTrendDeviation: doublePrecision('temperature_trend_deviation'),
    timestamp: text('timestamp'),
    contributors: jsonb('contributors').$type<Record<string, number | null> | null>(),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_oura_daily_readiness_day').on(table.day)],
);

// 4. /v2/usercollection/daily_sleep
export const ouraDailySleep = pgTable(
  'oura_daily_sleep',
  {
    id: text('id').primaryKey(),
    day: text('day').notNull(),
    score: integer('score'),
    timestamp: text('timestamp'),
    contributors: jsonb('contributors').$type<Record<string, number | null> | null>(),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_oura_daily_sleep_day').on(table.day)],
);

export interface OuraSampleJson {
  interval: number;
  items: Array<number | null>;
  timestamp: string;
}

// 5. /v2/usercollection/sleep
export const ouraSleep = pgTable(
  'oura_sleep',
  {
    id: text('id').primaryKey(),
    day: text('day').notNull(),
    type: text('type'),
    period: integer('period'),
    bedtimeStart: text('bedtime_start').notNull(),
    bedtimeEnd: text('bedtime_end').notNull(),
    totalSleepDuration: integer('total_sleep_duration'),
    deepSleepDuration: integer('deep_sleep_duration'),
    remSleepDuration: integer('rem_sleep_duration'),
    lightSleepDuration: integer('light_sleep_duration'),
    awakeTime: integer('awake_time'),
    timeInBed: integer('time_in_bed'),
    efficiency: integer('efficiency'),
    latency: integer('latency'),
    averageBreath: doublePrecision('average_breath'),
    averageHeartRate: doublePrecision('average_heart_rate'),
    lowestHeartRate: integer('lowest_heart_rate'),
    averageHrv: integer('average_hrv'),
    restlessPeriods: integer('restless_periods'),
    readinessScoreDelta: integer('readiness_score_delta'),
    sleepScoreDelta: integer('sleep_score_delta'),
    sleepPhase30Sec: text('sleep_phase_30_sec'),
    sleepPhase5Min: text('sleep_phase_5_min'),
    movement30Sec: text('movement_30_sec'),
    heartRate: jsonb('heart_rate').$type<OuraSampleJson | null>(),
    hrv: jsonb('hrv').$type<OuraSampleJson | null>(),
    readiness: jsonb('readiness').$type<Record<string, unknown> | null>(),
    lowBatteryAlert: boolean('low_battery_alert'),
    sleepAlgorithmVersion: text('sleep_algorithm_version'),
    sleepAnalysisReason: text('sleep_analysis_reason'),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_oura_sleep_day').on(table.day),
    index('idx_oura_sleep_bedtime_start').on(table.bedtimeStart),
  ],
);

// 6. /v2/usercollection/sleep_time
export const ouraSleepTime = pgTable(
  'oura_sleep_time',
  {
    id: text('id').primaryKey(),
    day: text('day').notNull(),
    optimalBedtime: jsonb('optimal_bedtime').$type<{
      day_tz: number;
      start_offset: number;
      end_offset: number;
    } | null>(),
    recommendation: text('recommendation'),
    status: text('status'),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_oura_sleep_time_day').on(table.day)],
);

// 7. /v2/usercollection/daily_activity
export const ouraDailyActivity = pgTable(
  'oura_daily_activity',
  {
    id: text('id').primaryKey(),
    day: text('day').notNull(),
    score: integer('score'),
    activeCalories: integer('active_calories'),
    totalCalories: integer('total_calories'),
    steps: integer('steps'),
    equivalentWalkingDistance: integer('equivalent_walking_distance'),
    highActivityTime: integer('high_activity_time'),
    mediumActivityTime: integer('medium_activity_time'),
    lowActivityTime: integer('low_activity_time'),
    sedentaryTime: integer('sedentary_time'),
    restingTime: integer('resting_time'),
    nonWearTime: integer('non_wear_time'),
    highActivityMetMinutes: integer('high_activity_met_minutes'),
    mediumActivityMetMinutes: integer('medium_activity_met_minutes'),
    lowActivityMetMinutes: integer('low_activity_met_minutes'),
    sedentaryMetMinutes: integer('sedentary_met_minutes'),
    inactivityAlerts: integer('inactivity_alerts'),
    averageMetMinutes: doublePrecision('average_met_minutes'),
    metersToTarget: integer('meters_to_target'),
    targetCalories: integer('target_calories'),
    targetMeters: integer('target_meters'),
    class5Min: text('class_5_min'),
    met: jsonb('met').$type<OuraSampleJson | null>(),
    contributors: jsonb('contributors').$type<Record<string, number | null> | null>(),
    timestamp: text('timestamp'),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_oura_daily_activity_day').on(table.day)],
);

// 8. /v2/usercollection/daily_stress
export const ouraDailyStress = pgTable(
  'oura_daily_stress',
  {
    id: text('id').primaryKey(),
    day: text('day').notNull(),
    stressHigh: integer('stress_high'),
    recoveryHigh: integer('recovery_high'),
    daySummary: text('day_summary'),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_oura_daily_stress_day').on(table.day)],
);

// 9. /v2/usercollection/daily_resilience
export const ouraDailyResilience = pgTable(
  'oura_daily_resilience',
  {
    id: text('id').primaryKey(),
    day: text('day').notNull(),
    level: text('level'),
    contributors: jsonb('contributors').$type<{
      sleep_recovery?: number;
      daytime_recovery?: number;
      stress?: number;
    } | null>(),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_oura_daily_resilience_day').on(table.day)],
);

// 10. /v2/usercollection/daily_spo2
export const ouraDailySpo2 = pgTable(
  'oura_daily_spo2',
  {
    id: text('id').primaryKey(),
    day: text('day').notNull(),
    spo2Average: doublePrecision('spo2_average'),
    breathingDisturbanceIndex: integer('breathing_disturbance_index'),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_oura_daily_spo2_day').on(table.day)],
);

// 11. /v2/usercollection/daily_cardiovascular_age
export const ouraDailyCardiovascularAge = pgTable(
  'oura_daily_cardiovascular_age',
  {
    id: text('id').primaryKey(),
    day: text('day').notNull(),
    vascularAge: integer('vascular_age'),
    pulseWaveVelocity: doublePrecision('pulse_wave_velocity'),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_oura_daily_cardiovascular_age_day').on(table.day)],
);

// 12. /v2/usercollection/vO2_max
export const ouraVo2Max = pgTable(
  'oura_vo2_max',
  {
    id: text('id').primaryKey(),
    day: text('day').notNull(),
    timestamp: text('timestamp'),
    vo2Max: doublePrecision('vo2_max'),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_oura_vo2_max_day').on(table.day)],
);

// 13. /v2/usercollection/workout
export const ouraWorkout = pgTable(
  'oura_workout',
  {
    id: text('id').primaryKey(),
    day: text('day').notNull(),
    activity: text('activity'),
    calories: doublePrecision('calories'),
    distance: doublePrecision('distance'),
    startDatetime: text('start_datetime'),
    endDatetime: text('end_datetime'),
    intensity: text('intensity'),
    label: text('label'),
    source: text('source'),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_oura_workout_day').on(table.day)],
);

// 14. /v2/usercollection/session
export const ouraSession = pgTable(
  'oura_session',
  {
    id: text('id').primaryKey(),
    day: text('day').notNull(),
    startDatetime: text('start_datetime'),
    endDatetime: text('end_datetime'),
    type: text('type'),
    mood: text('mood'),
    heartRate: jsonb('heart_rate').$type<OuraSampleJson | null>(),
    heartRateVariability: jsonb('heart_rate_variability').$type<OuraSampleJson | null>(),
    motionCount: jsonb('motion_count').$type<OuraSampleJson | null>(),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_oura_session_day').on(table.day)],
);

// 15. /v2/usercollection/enhanced_tag
export const ouraEnhancedTag = pgTable(
  'oura_enhanced_tag',
  {
    id: text('id').primaryKey(),
    startDay: text('start_day').notNull(),
    endDay: text('end_day'),
    startTime: text('start_time').notNull(),
    endTime: text('end_time'),
    tagTypeCode: text('tag_type_code'),
    customName: text('custom_name'),
    comment: text('comment'),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_oura_enhanced_tag_start_day').on(table.startDay)],
);

// 16. /v2/usercollection/tag
export const ouraTag = pgTable(
  'oura_tag',
  {
    id: text('id').primaryKey(),
    day: text('day').notNull(),
    text: text('text'),
    timestamp: text('timestamp'),
    tags: jsonb('tags').$type<string[]>().notNull(),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_oura_tag_day').on(table.day)],
);

// 17. /v2/usercollection/rest_mode_period
export const ouraRestModePeriod = pgTable(
  'oura_rest_mode_period',
  {
    id: text('id').primaryKey(),
    startDay: text('start_day').notNull(),
    startTime: text('start_time'),
    endDay: text('end_day'),
    endTime: text('end_time'),
    episodes: jsonb('episodes').$type<Array<{ tags: string[]; timestamp: string }>>().notNull(),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_oura_rest_mode_period_start_day').on(table.startDay)],
);

// 18. /v2/usercollection/heartrate
export const ouraHeartrate = pgTable(
  'oura_heartrate',
  {
    timestampUnix: bigint('timestamp_unix', { mode: 'number' }).notNull(),
    source: text('source').notNull(),
    timestamp: text('timestamp').notNull(),
    bpm: integer('bpm').notNull(),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.timestampUnix, table.source] }),
    index('idx_oura_heartrate_timestamp').on(table.timestamp),
  ],
);

// 19. /v2/usercollection/ring_battery_level
export const ouraRingBatteryLevel = pgTable(
  'oura_ring_battery_level',
  {
    timestampUnix: bigint('timestamp_unix', { mode: 'number' }).primaryKey(),
    timestamp: text('timestamp').notNull(),
    level: integer('level').notNull(),
    charging: boolean('charging'),
    inCharger: boolean('in_charger'),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_oura_ring_battery_level_timestamp').on(table.timestamp)],
);

// ============================================================================
// C. Cross-Domain Telemetry & Intelligence Tables
// ============================================================================

export const medLogs = pgTable(
  'med_logs',
  {
    id: text('id').primaryKey(),
    doseId: text('dose_id').notNull(),
    drugType: text('drug_type').notNull(),
    mg: doublePrecision('mg').notNull(),
    takenAt: timestamp('taken_at', { withTimezone: true }).notNull(),
    day: text('day').notNull(),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_med_logs_day').on(table.day),
    index('idx_med_logs_taken_at').on(table.takenAt),
  ],
);

export const dailyTaskMetrics = pgTable('daily_task_metrics', {
  day: text('day').primaryKey(),
  startCount: integer('start_count').notNull(),
  addedCount: integer('added_count').notNull(),
  completedCount: integer('completed_count').notNull(),
  movedCount: integer('moved_count').notNull(),
  remainingCount: integer('remaining_count').notNull(),
  completionPct: doublePrecision('completion_pct').notNull(),
  rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const aiBriefings = pgTable(
  'ai_briefings',
  {
    id: serial('id').primaryKey(),
    periodStart: text('period_start').notNull(),
    periodEnd: text('period_end').notNull(),
    summaryMarkdown: text('summary_markdown').notNull(),
    metricsSnapshot: jsonb('metrics_snapshot').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_ai_briefings_created_at').on(table.createdAt)],
);

// Alert cooldown persistence across serverless cold starts
export const alertCooldowns = pgTable('alert_cooldowns', {
  alertKey: text('alert_key').primaryKey(),
  lastSentAt: timestamp('last_sent_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// D. HenryLifeOS Behavioural & Environmental Telemetry Tables
// ============================================================================

export const lifeCommsDaily = pgTable('life_comms_daily', {
  day: text('day').primaryKey(),
  emailsReceivedGmail: integer('emails_received_gmail').default(0).notNull(),
  emailsSentGmail: integer('emails_sent_gmail').default(0).notNull(),
  emailsReceivedUni: integer('emails_received_uni').default(0).notNull(),
  emailsSentUni: integer('emails_sent_uni').default(0).notNull(),
  emailsReceivedOther: integer('emails_received_other').default(0).notNull(),
  emailsSentOther: integer('emails_sent_other').default(0).notNull(),
  imessagesReceived: integer('imessages_received').default(0).notNull(),
  imessagesSent: integer('imessages_sent').default(0).notNull(),
  lateCommsCount: integer('late_comms_count').default(0).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const lifeCaffeineLogs = pgTable(
  'life_caffeine_logs',
  {
    id: text('id').primaryKey(),
    day: text('day').notNull(),
    takenAt: timestamp('taken_at', { withTimezone: true }).notNull(),
    mg: integer('mg').notNull(),
    source: text('source').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_life_caffeine_logs_day').on(table.day),
    index('idx_life_caffeine_logs_taken_at').on(table.takenAt),
  ],
);

export const lifeSupplementAdherence = pgTable('life_supplement_adherence', {
  day: text('day').primaryKey(),
  amTaken: boolean('am_taken').default(false).notNull(),
  amCompletedAt: timestamp('am_completed_at', { withTimezone: true }),
  pmTaken: boolean('pm_taken').default(false).notNull(),
  pmCompletedAt: timestamp('pm_completed_at', { withTimezone: true }),
  creatineMg: integer('creatine_mg').default(0).notNull(),
  ginkgoMg: integer('ginkgo_mg').default(0).notNull(),
  ashwagandhaMg: integer('ashwagandha_mg').default(0).notNull(),
  vitaminDUg: integer('vitamin_d_ug').default(0).notNull(),
  multivitaminTaken: boolean('multivitamin_taken').default(false).notNull(),
  vitaminCMg: integer('vitamin_c_mg').default(0).notNull(),
  zincMg: integer('zinc_mg').default(0).notNull(),
  magnesiumCitrateMg: integer('magnesium_citrate_mg').default(0).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const lifeAlcoholLogs = pgTable(
  'life_alcohol_logs',
  {
    id: text('id').primaryKey(),
    day: text('day').notNull(),
    loggedAt: timestamp('logged_at', { withTimezone: true }).notNull(),
    units: doublePrecision('units').notNull(),
    drinkType: text('drink_type').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_life_alcohol_logs_day').on(table.day)],
);

export const lifeWeatherDaily = pgTable('life_weather_daily', {
  day: text('day').primaryKey(),
  locationKey: text('location_key').notNull(),
  lat: doublePrecision('lat').notNull(),
  lon: doublePrecision('lon').notNull(),
  tempMeanC: doublePrecision('temp_mean_c'),
  tempMinC: doublePrecision('temp_min_c'),
  tempMaxC: doublePrecision('temp_max_c'),
  humidityPct: doublePrecision('humidity_pct'),
  uvMax: doublePrecision('uv_max'),
  cloudCoverPct: doublePrecision('cloud_cover_pct'),
  precipitationMm: doublePrecision('precipitation_mm'),
  pressureHpa: doublePrecision('pressure_hpa'),
  pressureDelta24h: doublePrecision('pressure_delta_24h'),
  pm25: doublePrecision('pm25'),
  europeanAqi: doublePrecision('european_aqi'),
  photoperiodHours: doublePrecision('photoperiod_hours'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const lifeAcousticHealthDaily = pgTable('life_acoustic_health_daily', {
  day: text('day').primaryKey(),
  envAudioAvgDb: doublePrecision('env_audio_avg_db'),
  envAudioMaxDb: doublePrecision('env_audio_max_db'),
  headphoneAudioAvgDb: doublePrecision('headphone_audio_avg_db'),
  headphoneAudioMins: doublePrecision('headphone_audio_mins'),
  timeInDaylightMins: doublePrecision('time_in_daylight_mins'),
  bodyMassKg: doublePrecision('body_mass_kg'),
  workoutMins: doublePrecision('workout_mins'),
  rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().default({}).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const lifePresenceDaily = pgTable('life_presence_daily', {
  day: text('day').primaryKey(),
  hoursAtHome: doublePrecision('hours_at_home'),
  firstDepartureAt: timestamp('first_departure_at', { withTimezone: true }),
  lastReturnAt: timestamp('last_return_at', { withTimezone: true }),
  sleepLocation: text('sleep_location').default('unknown').notNull(),
  driveMins: integer('drive_mins').default(0).notNull(),
  driveTrips: integer('drive_trips').default(0).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const lifeCommuteEvents = pgTable(
  'life_commute_events',
  {
    id: text('id').primaryKey(),
    day: text('day').notNull(),
    eventType: text('event_type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    durationMins: integer('duration_mins'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_life_commute_events_day').on(table.day),
    index('idx_life_commute_events_occurred_at').on(table.occurredAt),
  ],
);

export const lifeMediaDaily = pgTable('life_media_daily', {
  day: text('day').primaryKey(),
  tvActiveMins: integer('tv_active_mins').default(0).notNull(),
  tvLateMins: integer('tv_late_mins').default(0).notNull(),
  audioPlaybackMins: integer('audio_playback_mins').default(0).notNull(),
  musicMins: integer('music_mins').default(0).notNull(),
  videoMins: integer('video_mins').default(0).notNull(),
  bedtimeAudioUsed: boolean('bedtime_audio_used').default(false).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const lifeSpendingTx = pgTable(
  'life_spending_tx',
  {
    id: text('id').primaryKey(),
    day: text('day').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    amountGbp: doublePrecision('amount_gbp').notNull(),
    merchant: text('merchant').notNull(),
    category: text('category').notNull(),
    source: text('source').notNull(),
    isLateSpend: boolean('is_late_spend').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_life_spending_tx_day').on(table.day),
    index('idx_life_spending_tx_category').on(table.category),
  ],
);

export const lifeSubjectiveDaily = pgTable('life_subjective_daily', {
  day: text('day').primaryKey(),
  energy: integer('energy').notNull(),
  mentalFocus: integer('mental_focus').notNull(),
  moodCalm: integer('mood_calm').notNull(),
  physicalSoreness: integer('physical_soreness'),
  socialBandwidth: integer('social_bandwidth').notNull(),
  eventTags: jsonb('event_tags').$type<string[]>().default([]).notNull(),
  notes: text('notes'),
  loggedAt: timestamp('logged_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// E. HenryLifeOS Pre-Computed Causal Analytics & Experiment Tables
// ============================================================================

export const lifeAnalyticsRuns = pgTable('life_analytics_runs', {
  id: serial('id').primaryKey(),
  ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
  windowDays: integer('window_days').notNull(),
  matrixDays: integer('matrix_days').notNull(),
  summaryJson: jsonb('summary_json').$type<Record<string, unknown>>().notNull(),
});

export const lifeInsightsDrivers = pgTable(
  'life_insights_drivers',
  {
    id: serial('id').primaryKey(),
    runId: integer('run_id').notNull(),
    outcomeKey: text('outcome_key').notNull(),
    outcomeLabel: text('outcome_label').notNull(),
    featureKey: text('feature_key').notNull(),
    featureLabel: text('feature_label').notNull(),
    lagDays: integer('lag_days').notNull(),
    sampleN: integer('sample_n').notNull(),
    spearmanR: doublePrecision('spearman_r').notNull(),
    pValue: doublePrecision('p_value').notNull(),
    fdrQValue: doublePrecision('fdr_q_value'),
    shapImportance: doublePrecision('shap_importance'),
    marginalEffect: doublePrecision('marginal_effect'),
    direction: text('direction').notNull(),
    confidenceTier: text('confidence_tier').notNull(),
  },
  (table) => [
    index('idx_life_insights_drivers_run_id').on(table.runId),
    index('idx_life_insights_drivers_outcome_lag').on(table.outcomeKey, table.lagDays),
  ],
);

export const lifeThresholdCliffs = pgTable(
  'life_threshold_cliffs',
  {
    id: serial('id').primaryKey(),
    runId: integer('run_id').notNull(),
    outcomeKey: text('outcome_key').notNull(),
    outcomeLabel: text('outcome_label').notNull(),
    featureKey: text('feature_key').notNull(),
    featureLabel: text('feature_label').notNull(),
    thresholdRule: text('threshold_rule').notNull(),
    lowBucketLabel: text('low_bucket_label').notNull(),
    highBucketLabel: text('high_bucket_label').notNull(),
    lowN: integer('low_n').notNull(),
    highN: integer('high_n').notNull(),
    lowMedian: doublePrecision('low_median').notNull(),
    highMedian: doublePrecision('high_median').notNull(),
    medianDelta: doublePrecision('median_delta').notNull(),
    pValue: doublePrecision('p_value').notNull(),
  },
  (table) => [index('idx_life_threshold_cliffs_run_id').on(table.runId)],
);

export const lifeGroupContrasts = pgTable(
  'life_group_contrasts',
  {
    id: serial('id').primaryKey(),
    runId: integer('run_id').notNull(),
    cohortLabel: text('cohort_label').notNull(),
    featureKey: text('feature_key').notNull(),
    featureLabel: text('feature_label').notNull(),
    best10Mean: doublePrecision('best_10_mean').notNull(),
    worst10Mean: doublePrecision('worst_10_mean').notNull(),
    effectSizeD: doublePrecision('effect_size_d').notNull(),
    sampleN: integer('sample_n').notNull(),
  },
  (table) => [index('idx_life_group_contrasts_run_id').on(table.runId)],
);

export const lifeExperiments = pgTable('life_experiments', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  hypothesis: text('hypothesis').notNull(),
  featureKey: text('feature_key').notNull(),
  targetOutcomes: jsonb('target_outcomes').$type<string[]>().notNull(),
  startDay: text('start_day').notNull(),
  endDay: text('end_day').notNull(),
  baselineDays: integer('baseline_days').default(21).notNull(),
  status: text('status').default('active').notNull(),
  verdict: text('verdict'),
  resultsJson: jsonb('results_json').$type<Record<string, unknown> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
