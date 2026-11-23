export type FeatureScope = 'behavioural' | 'environmental';
export type BeneficialDirection = 'beneficial' | 'detrimental';
export type StrengthBand = 'Strong' | 'Moderate' | 'Mild';
export type ConfidenceLabel = 'High Confidence' | 'Moderate Confidence' | 'Early Signal';
export type SampleStageLabel = 'Established' | 'Building' | 'Early (<45d)';
export type EffectSizeLabel = 'Very Large' | 'Large' | 'Moderate';

type FeatureValueKind =
  | 'duration_mins'
  | 'hours'
  | 'gbp'
  | 'int'
  | 'decimal1'
  | 'boolean_rate';

interface OutcomeMeta {
  label: string;
  unit: string;
  singularUnit?: string;
  higherIsBetter: boolean;
}

interface FeatureMeta {
  label: string;
  singularUnit?: string;
  unit: string;
  valueKind: FeatureValueKind;
  family: string;
}

const ENVIRONMENTAL_FEATURES = new Set<string>([
  'photoperiod_hours',
  'uv_max',
  'temp_mean_c',
  'humidity_pct',
  'cloud_cover_pct',
  'precipitation_mm',
  'pressure_hpa',
  'pressure_delta_24h',
  'pm25',
  'european_aqi',
  'is_weekend',
]);

export const SCREEN_TIME_FEATURES = new Set<string>([
  'mac_mins',
  'iphone_mins',
  'combined_screen_mins',
  'wall_clock_screen_mins',
  'late_night_screen_mins',
  'social_screen_mins',
  'video_screen_mins',
  'dev_productivity_mins',
  'context_switches',
  'micro_checks',
  'deep_work_mins',
  'screen_to_sleep_gap_mins',
]);

export const SUPPLEMENT_FEATURES = new Set<string>([
  'am_pills_taken',
  'pm_pills_taken',
  'creatine_mg',
  'ginkgo_mg',
  'ashwagandha_mg',
  'vitamin_d_ug',
  'magnesium_citrate_mg',
]);

export const OBSERVATIONAL_SUPPLEMENT_CAVEAT =
  'Linked in observational data; test via a 14-day experiment before changing routine.';

export const OUTCOME_META: Record<string, OutcomeMeta> = {
  hrv_avg_ms: { label: 'HRV (Recovery)', unit: 'ms', higherIsBetter: true },
  lowest_hr_bpm: { label: 'Resting Heart Rate', unit: 'bpm', higherIsBetter: false },
  deep_sleep_min: { label: 'Deep Sleep', unit: 'mins', singularUnit: 'min', higherIsBetter: true },
  rem_sleep_min: { label: 'REM Sleep', unit: 'mins', singularUnit: 'min', higherIsBetter: true },
  total_sleep_min: { label: 'Total Sleep', unit: 'mins', singularUnit: 'min', higherIsBetter: true },
  sleep_efficiency_pct: { label: 'Sleep Efficiency', unit: '%', higherIsBetter: true },
  sleep_latency_min: { label: 'Time to Fall Asleep', unit: 'mins', singularUnit: 'min', higherIsBetter: false },
  readiness_score: { label: 'Readiness Score', unit: 'pts', singularUnit: 'pt', higherIsBetter: true },
  sleep_score: { label: 'Sleep Score', unit: 'pts', singularUnit: 'pt', higherIsBetter: true },
  mental_focus: { label: 'Mental Focus', unit: '/10', higherIsBetter: true },
  energy: { label: 'Physical Energy', unit: '/10', higherIsBetter: true },
  mood_calm: { label: 'Mood & Calm', unit: '/10', higherIsBetter: true },
  physical_soreness: { label: 'Physical Soreness', unit: '/10', higherIsBetter: false },
  task_completion_rate: { label: 'Task Completion', unit: '%', higherIsBetter: true },
  tasks_remaining: { label: 'Unfinished Tasks', unit: 'tasks', singularUnit: 'task', higherIsBetter: false },
};

export const OUTCOME_UNITS: Record<string, string> = Object.fromEntries(
  Object.entries(OUTCOME_META).map(([k, v]) => [k, v.unit]),
);

export const FEATURE_META: Record<string, FeatureMeta> = {
  imessages_total: { label: 'Total iMessages', singularUnit: 'msg', unit: 'msgs', valueKind: 'int', family: 'imessages' },
  imessages_sent: { label: 'iMessages Sent', singularUnit: 'msg', unit: 'msgs', valueKind: 'int', family: 'imessages' },
  imessages_received: { label: 'iMessages Received', singularUnit: 'msg', unit: 'msgs', valueKind: 'int', family: 'imessages' },
  late_comms_count: { label: 'Messages After 9pm', singularUnit: 'msg', unit: 'msgs', valueKind: 'int', family: 'late_comms' },
  emails_total: { label: 'Total Emails', singularUnit: 'email', unit: 'emails', valueKind: 'int', family: 'emails' },
  emails_received_uni: { label: 'Uni Emails Received', singularUnit: 'email', unit: 'emails', valueKind: 'int', family: 'emails' },
  emails_sent_uni: { label: 'Uni Emails Sent', singularUnit: 'email', unit: 'emails', valueKind: 'int', family: 'emails' },
  emails_received_gmail: { label: 'Gmail Received', singularUnit: 'email', unit: 'emails', valueKind: 'int', family: 'emails' },
  emails_sent_gmail: { label: 'Gmail Sent', singularUnit: 'email', unit: 'emails', valueKind: 'int', family: 'emails' },
  mac_mins: { label: 'Mac Screen Time', singularUnit: 'min', unit: 'mins', valueKind: 'duration_mins', family: 'screen_total' },
  iphone_mins: { label: 'iPhone Screen Time', singularUnit: 'min', unit: 'mins', valueKind: 'duration_mins', family: 'screen_total' },
  combined_screen_mins: { label: 'Total Screen Time', singularUnit: 'min', unit: 'mins', valueKind: 'duration_mins', family: 'screen_total' },
  wall_clock_screen_mins: { label: 'Active Screen Window', singularUnit: 'min', unit: 'mins', valueKind: 'duration_mins', family: 'screen_total' },
  late_night_screen_mins: { label: 'Late-Night Screen Time', singularUnit: 'min', unit: 'mins', valueKind: 'duration_mins', family: 'late_screen' },
  deep_work_mins: { label: 'Deep Work Time', singularUnit: 'min', unit: 'mins', valueKind: 'duration_mins', family: 'screen_cat' },
  social_screen_mins: { label: 'Social Media Time', singularUnit: 'min', unit: 'mins', valueKind: 'duration_mins', family: 'screen_cat' },
  video_screen_mins: { label: 'Video Time', singularUnit: 'min', unit: 'mins', valueKind: 'duration_mins', family: 'screen_cat' },
  dev_productivity_mins: { label: 'Productivity Time', singularUnit: 'min', unit: 'mins', valueKind: 'duration_mins', family: 'screen_cat' },
  context_switches: { label: 'App Switches', singularUnit: 'switch', unit: 'switches', valueKind: 'int', family: 'screen_cat' },
  micro_checks: { label: 'Quick Phone Checks', singularUnit: 'check', unit: 'checks', valueKind: 'int', family: 'screen_cat' },
  am_pills_taken: { label: 'AM Supplements', unit: '', valueKind: 'boolean_rate', family: 'supplements' },
  pm_pills_taken: { label: 'PM Supplements', unit: '', valueKind: 'boolean_rate', family: 'supplements' },
  creatine_mg: { label: 'Daily Creatine', unit: 'mg', valueKind: 'int', family: 'supplements' },
  ginkgo_mg: { label: 'Daily Ginkgo', unit: 'mg', valueKind: 'int', family: 'supplements' },
  ashwagandha_mg: { label: 'Daily Ashwagandha', unit: 'mg', valueKind: 'int', family: 'supplements' },
  vitamin_d_ug: { label: 'Daily Vitamin D', unit: 'ug', valueKind: 'int', family: 'supplements' },
  magnesium_citrate_mg: { label: 'Evening Magnesium', unit: 'mg', valueKind: 'int', family: 'supplements' },
  caffeine_total_mg: { label: 'Daily Caffeine', unit: 'mg', valueKind: 'int', family: 'caffeine' },
  last_caffeine_hour: { label: 'Last Caffeine Time', singularUnit: 'hr', unit: 'hrs', valueKind: 'hours', family: 'caffeine' },
  bedtime_caffeine_mg: { label: 'Caffeine Left at Bedtime', unit: 'mg', valueKind: 'int', family: 'caffeine' },
  alcohol_units: { label: 'Alcohol Units', singularUnit: 'unit', unit: 'units', valueKind: 'decimal1', family: 'alcohol' },
  last_alcohol_hour: { label: 'Last Drink Time', singularUnit: 'hr', unit: 'hrs', valueKind: 'hours', family: 'alcohol' },
  spend_total_gbp: { label: 'Daily Spending', unit: 'GBP', valueKind: 'gbp', family: 'spending' },
  spend_takeaway_gbp: { label: 'Takeaway Spending', unit: 'GBP', valueKind: 'gbp', family: 'spending' },
  spend_groceries_gbp: { label: 'Grocery Spending', unit: 'GBP', valueKind: 'gbp', family: 'spending' },
  spend_social_pubs_gbp: { label: 'Pub & Social Spending', unit: 'GBP', valueKind: 'gbp', family: 'spending' },
  spend_coffee_gbp: { label: 'Coffee Shop Spending', unit: 'GBP', valueKind: 'gbp', family: 'spending' },
  tx_count: { label: 'Card Transactions', singularUnit: 'tx', unit: 'txs', valueKind: 'int', family: 'spending' },
  late_spend_count: { label: 'Late-Night Purchases', singularUnit: 'tx', unit: 'txs', valueKind: 'int', family: 'spending' },
  photoperiod_hours: { label: 'Daylight Hours', singularUnit: 'hr', unit: 'hrs', valueKind: 'hours', family: 'photoperiod' },
  pressure_hpa: { label: 'Air Pressure', unit: '', valueKind: 'int', family: 'pressure' },
  pressure_delta_24h: { label: '24h Air Pressure Drop/Rise', unit: '', valueKind: 'decimal1', family: 'pressure' },
  temp_mean_c: { label: 'Outdoor Temperature', unit: 'C', valueKind: 'decimal1', family: 'temp' },
  humidity_pct: { label: 'Outdoor Humidity', unit: '%', valueKind: 'int', family: 'humidity' },
  cloud_cover_pct: { label: 'Cloud Cover', unit: '%', valueKind: 'int', family: 'cloud' },
  precipitation_mm: { label: 'Rainfall', unit: 'mm', valueKind: 'decimal1', family: 'rainfall' },
  uv_max: { label: 'Peak UV Index', unit: 'UV', valueKind: 'decimal1', family: 'uv' },
  european_aqi: { label: 'Air Quality Index', unit: 'AQI', valueKind: 'int', family: 'aqi' },
  pm25: { label: 'Air Pollution (PM2.5)', unit: 'PM2.5', valueKind: 'decimal1', family: 'aqi' },
  is_weekend: { label: 'Weekend vs Weekday', unit: '', valueKind: 'boolean_rate', family: 'weekend' },
  recovery_high_mins: { label: 'Oura Restorative Time', singularUnit: 'min', unit: 'mins', valueKind: 'duration_mins', family: 'oura_stress_recovery' },
  stress_high_mins: { label: 'Oura High Stress Time', singularUnit: 'min', unit: 'mins', valueKind: 'duration_mins', family: 'oura_stress_recovery' },
  active_calories: { label: 'Active Calories', unit: 'kcal', valueKind: 'int', family: 'steps_calories' },
  steps: { label: 'Daily Steps', singularUnit: 'step', unit: 'steps', valueKind: 'int', family: 'steps_calories' },
  workout_mins: { label: 'Exercise Time', singularUnit: 'min', unit: 'mins', valueKind: 'duration_mins', family: 'steps_calories' },
  headphone_audio_avg_db: { label: 'Headphone Volume', unit: 'dB', valueKind: 'decimal1', family: 'audio' },
  headphone_audio_mins: { label: 'Headphone Listening Time', singularUnit: 'min', unit: 'mins', valueKind: 'duration_mins', family: 'audio' },
  env_audio_avg_db: { label: 'Ambient Noise Level', unit: 'dB', valueKind: 'decimal1', family: 'audio' },
  env_audio_max_db: { label: 'Peak Ambient Noise', unit: 'dB', valueKind: 'decimal1', family: 'audio' },
  time_in_daylight_mins: { label: 'Time Outside in Daylight', singularUnit: 'min', unit: 'mins', valueKind: 'duration_mins', family: 'daylight' },
  body_mass_kg: { label: 'Body Weight', unit: 'kg', valueKind: 'decimal1', family: 'body' },
  hours_at_home: { label: 'Hours at Home', singularUnit: 'hr', unit: 'hrs', valueKind: 'hours', family: 'presence' },
  drive_mins: { label: 'Driving Time', singularUnit: 'min', unit: 'mins', valueKind: 'duration_mins', family: 'presence' },
  drive_trips: { label: 'Driving Trips', singularUnit: 'trip', unit: 'trips', valueKind: 'int', family: 'presence' },
  is_away_sleep: { label: 'Sleeping Away From Home', unit: '', valueKind: 'boolean_rate', family: 'presence' },
  tv_active_mins: { label: 'TV Watch Time', singularUnit: 'min', unit: 'mins', valueKind: 'duration_mins', family: 'media' },
  tv_late_mins: { label: 'Late-Night TV Time', singularUnit: 'min', unit: 'mins', valueKind: 'duration_mins', family: 'media' },
  audio_playback_mins: { label: 'Audio Listening Time', singularUnit: 'min', unit: 'mins', valueKind: 'duration_mins', family: 'media' },
  music_mins: { label: 'Music Listening Time', singularUnit: 'min', unit: 'mins', valueKind: 'duration_mins', family: 'media' },
  video_mins: { label: 'Video Watching Time', singularUnit: 'min', unit: 'mins', valueKind: 'duration_mins', family: 'media' },
  bedtime_audio_used: { label: 'Audio Used Before Sleep', unit: '', valueKind: 'boolean_rate', family: 'media' },
  adhd_med_doses: { label: 'ADHD Med Doses', singularUnit: 'dose', unit: 'doses', valueKind: 'decimal1', family: 'meds' },
  adhd_total_mg: { label: 'Daily ADHD Medication', unit: 'mg', valueKind: 'int', family: 'meds' },
  last_adhd_med_hour: { label: 'Last ADHD Dose Hour', singularUnit: 'hr', unit: 'hrs', valueKind: 'hours', family: 'meds' },
  social_bandwidth: { label: 'Social Level', unit: '/3', valueKind: 'decimal1', family: 'subjective' },
  task_completion_rate: { label: 'Task Completion', unit: '%', valueKind: 'int', family: 'tasks' },
  tasks_remaining: { label: 'Unfinished Tasks', singularUnit: 'task', unit: 'tasks', valueKind: 'int', family: 'tasks' },
  calendar_event_count: { label: 'Calendar Events', singularUnit: 'event', unit: 'events', valueKind: 'int', family: 'calendar' },
  calendar_scheduled_mins: { label: 'Scheduled Calendar Time', singularUnit: 'min', unit: 'mins', valueKind: 'duration_mins', family: 'calendar' },
  calendar_early_start: { label: 'Early Morning Start (Before 8:45am)', unit: '', valueKind: 'boolean_rate', family: 'calendar' },
  calendar_latest_end_hour: { label: 'Latest Calendar Finish', singularUnit: 'hr', unit: 'hrs', valueKind: 'hours', family: 'calendar' },
  bedtime_drift_mins: { label: 'Bedtime Drift vs 7d Median', singularUnit: 'min', unit: 'mins', valueKind: 'decimal1', family: 'sleep_drift' },
  waketime_drift_mins: { label: 'Wake Time Drift vs 7d Median', singularUnit: 'min', unit: 'mins', valueKind: 'decimal1', family: 'sleep_drift' },
  sleep_schedule_drift_mins: { label: 'Sleep Schedule Drift', singularUnit: 'min', unit: 'mins', valueKind: 'decimal1', family: 'sleep_drift' },
  screen_to_sleep_gap_mins: { label: 'Screen-Off to Sleep Gap', singularUnit: 'min', unit: 'mins', valueKind: 'decimal1', family: 'screen_gap' },
};

function titleCaseFallback(rawKey: string): string {
  return rawKey
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function pluraliseUnit(
  value: number,
  singular: string,
  plural: string,
): string {
  return Math.abs(Math.abs(value) - 1) < 0.05 ? singular : plural;
}

export function formatDayCountPhrase(days: number): string {
  const rounded = Math.max(0, Math.round(Number(days) || 0));
  return `${rounded} ${rounded === 1 ? 'day' : 'days'}`;
}

export function formatCoverageDaysBadge(days: number): string {
  const clean = Math.max(0, Math.round(Number(days) || 0));
  return `${clean}d`;
}

export function getOutcomeLabel(outcomeKey: string, fallback?: string): string {
  return OUTCOME_META[outcomeKey]?.label ?? fallback ?? titleCaseFallback(outcomeKey);
}

export function getOutcomeUnit(outcomeKey: string): string {
  return OUTCOME_META[outcomeKey]?.unit ?? '';
}

export function isOutcomeHigherBetter(outcomeKey: string): boolean {
  return OUTCOME_META[outcomeKey]?.higherIsBetter ?? true;
}

export function getFeatureLabel(featureKey: string, fallback?: string): string {
  if (FEATURE_META[featureKey]) return FEATURE_META[featureKey].label;
  if (fallback) {
    return fallback.replace(/\s*\(hPa\)/gi, '').trim();
  }
  return titleCaseFallback(featureKey);
}

export function getFeatureFamily(featureKey: string): string {
  return FEATURE_META[featureKey]?.family ?? featureKey;
}

export function classifyFeatureScope(featureKey: string): FeatureScope {
  return ENVIRONMENTAL_FEATURES.has(featureKey) ? 'environmental' : 'behavioural';
}

export function getBeneficialDirection(
  outcomeKey: string,
  spearmanR: number,
): BeneficialDirection {
  const higherBetter = isOutcomeHigherBetter(outcomeKey);
  if (!higherBetter) {
    return spearmanR <= 0 ? 'beneficial' : 'detrimental';
  }
  return spearmanR >= 0 ? 'beneficial' : 'detrimental';
}

export function getSampleStageLabel(sampleN: number): SampleStageLabel {
  if (sampleN >= 60) return 'Established';
  if (sampleN < 45) return 'Early (<45d)';
  return 'Building';
}

export function getStrengthBand(
  spearmanR: number,
  sampleN: number,
): StrengthBand {
  const absR = Math.abs(spearmanR);
  if (sampleN < 25) return 'Mild';
  if (sampleN < 45) {
    return absR >= 0.3 ? 'Moderate' : 'Mild';
  }
  if (absR >= 0.45) return 'Strong';
  if (absR >= 0.3) return 'Moderate';
  return 'Mild';
}

export function getConfidenceLabel(
  pValue: number,
  fdrQValue: number | null,
  sampleN: number,
): ConfidenceLabel {
  if (
    sampleN >= 60 &&
    ((fdrQValue !== null && fdrQValue < 0.01) || pValue < 0.0005)
  ) {
    return 'High Confidence';
  }
  if (sampleN >= 25 && pValue < 0.05) {
    return 'Moderate Confidence';
  }
  return 'Early Signal';
}

export function isPositiveHabitEligible(input: {
  featureKey: string;
  outcomeKey: string;
  sampleN: number;
  marginalEffect: number | null;
  beneficialDirection: BeneficialDirection;
}): boolean {
  if (input.beneficialDirection !== 'beneficial') return false;
  if (!SCREEN_TIME_FEATURES.has(input.featureKey)) return true;

  if (input.sampleN < 45 || input.marginalEffect === null) {
    return false;
  }
  return isOutcomeHigherBetter(input.outcomeKey)
    ? input.marginalEffect > 0
    : input.marginalEffect < 0;
}

export function getLagLabel(lagDays: number): string {
  if (lagDays === 0) return 'Same Day';
  if (lagDays === 1) return 'Next Day';
  return `${lagDays} Days Later`;
}

export function getEffectSizeLabel(effectSizeD: number): EffectSizeLabel {
  const absD = Math.abs(effectSizeD);
  if (absD >= 1.2) return 'Very Large';
  if (absD >= 0.8) return 'Large';
  return 'Moderate';
}

export function formatMinutesHm(totalMins: number): string {
  const rounded = Math.round(totalMins);
  if (Math.abs(rounded) < 60) {
    return `${rounded} ${pluraliseUnit(rounded, 'min', 'mins')}`;
  }
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (m === 0) {
    return `${sign}${h} ${h === 1 ? 'hr' : 'hrs'}`;
  }
  return `${sign}${h}h ${m}m`;
}

export function formatMetricNumber(val: number, decimals = 1): string {
  if (Math.abs(val - Math.round(val)) < 0.05) {
    return String(Math.round(val));
  }
  return val.toFixed(decimals);
}

export function formatFeatureValue(featureKey: string, value: number): string {
  const meta = FEATURE_META[featureKey];
  if (!meta) {
    return value.toFixed(1);
  }
  if (meta.valueKind === 'duration_mins') {
    return formatMinutesHm(value);
  }
  if (meta.valueKind === 'hours') {
    const numStr = value.toFixed(1);
    const unit = pluraliseUnit(Number(numStr), meta.singularUnit ?? 'hr', meta.unit);
    return `${numStr} ${unit}`;
  }
  if (meta.valueKind === 'gbp') {
    return `£${value.toFixed(2)}`;
  }
  if (meta.valueKind === 'boolean_rate') {
    return `${Math.round(value * 100)}% of days`;
  }
  if (meta.valueKind === 'int') {
    const rounded = Math.round(value);
    if (!meta.unit) return String(rounded);
    const unit = meta.singularUnit
      ? pluraliseUnit(rounded, meta.singularUnit, meta.unit)
      : meta.unit;
    return `${rounded} ${unit}`;
  }
  const formatted = value.toFixed(1);
  if (!meta.unit) return formatted;
  const numVal = Number(formatted);
  const unit = meta.singularUnit
    ? pluraliseUnit(numVal, meta.singularUnit, meta.unit)
    : meta.unit;
  return `${formatted} ${unit}`;
}

export function formatOutcomeValue(outcomeKey: string, value: number): string {
  const meta = OUTCOME_META[outcomeKey];
  const numStr = formatMetricNumber(value, 1);
  const unit = meta?.unit ?? '';
  if (!unit) return numStr;
  if (unit === '%' || unit === '/10') {
    return `${numStr}${unit}`;
  }
  const resolvedUnit = meta?.singularUnit
    ? pluraliseUnit(Number(numStr), meta.singularUnit, unit)
    : unit;
  return `${numStr} ${resolvedUnit}`;
}

export function formatOutcomeDelta(outcomeKey: string, delta: number): string {
  const meta = OUTCOME_META[outcomeKey];
  const absNum = Number(formatMetricNumber(Math.abs(delta), 1));
  const numStr = formatMetricNumber(Math.abs(delta), 1);
  const sign = delta > 0 ? '+' : delta < 0 ? '-' : '';
  const unit = meta?.unit ?? '';
  if (!unit) return `${sign}${numStr}`;
  if (unit === '%' || unit === '/10') {
    return `${sign}${numStr}${unit}`;
  }
  const resolvedUnit = meta?.singularUnit
    ? pluraliseUnit(absNum, meta.singularUnit, unit)
    : unit;
  return `${sign}${numStr} ${resolvedUnit}`;
}

const BINARY_FEATURE_SUBJECTS: Record<string, string> = {
  am_pills_taken: 'Taking AM Supplements',
  pm_pills_taken: 'Taking PM Supplements',
  calendar_early_start: 'Having an early start before 8:45am',
  is_weekend: 'Being on a weekend',
  is_away_sleep: 'Sleeping away from home',
  bedtime_audio_used: 'Using audio before sleep',
};

export function buildDriverTakeaway(input: {
  featureKey: string;
  featureLabel: string;
  outcomeKey: string;
  outcomeLabel: string;
  spearmanR: number;
  lagDays: number;
  sampleN: number;
  beneficialDirection: BeneficialDirection;
}): {
  takeawayText: string;
  observationalCaveat: string | null;
} {
  const effectDirection = input.spearmanR >= 0 ? 'higher' : 'lower';
  const binarySubject = BINARY_FEATURE_SUBJECTS[input.featureKey];

  let base: string;
  if (binarySubject) {
    const binaryTiming =
      input.lagDays === 0
        ? 'on the same day'
        : input.lagDays === 1
          ? 'on the day before'
          : `${input.lagDays} days earlier`;
    base = `${binarySubject} ${binaryTiming} is linked to ${effectDirection} ${input.outcomeLabel}.`;
  } else {
    const timing =
      input.lagDays === 0
        ? 'on the same day'
        : input.lagDays === 1
          ? 'next day'
          : `${input.lagDays} days later`;
    base =
      input.outcomeKey === 'lowest_hr_bpm'
        ? `Higher ${input.featureLabel} is linked to ${effectDirection} ${input.outcomeLabel} ${timing}.`
        : `Higher ${input.featureLabel} is linked to ${effectDirection} ${timing} ${input.outcomeLabel}.`;
  }

  if (input.sampleN < 45) {
    base = `${base} Early sample (<45 days); treat as preliminary.`;
  }

  let observationalCaveat: string | null = null;
  if (
    SUPPLEMENT_FEATURES.has(input.featureKey) &&
    input.beneficialDirection === 'detrimental'
  ) {
    observationalCaveat = OBSERVATIONAL_SUPPLEMENT_CAVEAT;
  }

  return {
    takeawayText: base,
    observationalCaveat,
  };
}

export function translateCliffFields(input: {
  featureKey: string;
  featureLabel: string;
  outcomeKey: string;
  outcomeLabel: string;
  thresholdRule: string;
  lowBucketLabel: string;
  highBucketLabel: string;
  lowMedian: number;
  highMedian: number;
  medianDelta: number;
  totalSampleN: number;
  isBeneficialDelta: boolean;
}) {
  const isPrior = input.thresholdRule.includes('prior_day');
  const timingLabel = isPrior ? 'Day before' : 'Same day';

  let lowLabel = input.lowBucketLabel.replace(/\s*hPa\b/gi, '').trim();
  let highLabel = input.highBucketLabel.replace(/\s*hPa\b/gi, '').trim();
  let comparisonLabel = `${lowLabel} vs ${highLabel}`;

  switch (input.featureKey) {
    case 'late_comms_count':
      lowLabel = '10 or fewer';
      highLabel = 'More than 10';
      comparisonLabel = '10 or fewer vs more than 10 (day before)';
      break;
    case 'imessages_total':
      lowLabel = '120 or fewer';
      highLabel = 'More than 120';
      comparisonLabel = '120 or fewer vs more than 120 (day before)';
      break;
    case 'late_night_screen_mins':
      lowLabel = '30 mins or less';
      highLabel = 'Over 30 mins';
      comparisonLabel = '30 mins or less vs over 30 mins (day before)';
      break;
    case 'am_pills_taken':
    case 'pm_pills_taken':
      lowLabel = 'Missed';
      highLabel = 'Taken';
      comparisonLabel = 'Missed vs taken (day before)';
      break;
    case 'creatine_mg':
      lowLabel = 'Under 1,000 mg';
      highLabel = '1,000 mg or more';
      comparisonLabel = 'Under 1,000 mg vs 1,000 mg+ (day before)';
      break;
    case 'photoperiod_hours':
      lowLabel = '9 hrs or more';
      highLabel = 'Under 9 hrs';
      comparisonLabel = '9+ hrs daylight vs under 9 hrs (day before)';
      break;
    case 'temp_mean_c':
      lowLabel = '5 C or warmer';
      highLabel = 'Under 5 C';
      comparisonLabel = '5 C or warmer vs under 5 C (day before)';
      break;
    case 'pressure_delta_24h':
      lowLabel = 'Steady / rising';
      highLabel = 'Sharp drop';
      comparisonLabel = 'Steady pressure vs sharp drop (day before)';
      break;
    case 'calendar_early_start':
      lowLabel = '8:45am or later';
      highLabel = 'Before 8:45am';
      comparisonLabel = '8:45am+ start vs before 8:45am (day before)';
      break;
    case 'sleep_schedule_drift_mins':
      lowLabel = 'Within 60 mins';
      highLabel = 'Over 60 mins drift';
      comparisonLabel = 'Steady schedule vs over 60 mins drift (day before)';
      break;
    case 'screen_to_sleep_gap_mins':
      lowLabel = '30+ mins gap';
      highLabel = 'Under 30 mins gap';
      comparisonLabel = '30+ mins screen-free vs under 30 mins (day before)';
      break;
    default:
      break;
  }

  const lowFormatted = formatOutcomeValue(input.outcomeKey, input.lowMedian);
  const highFormatted = formatOutcomeValue(input.outcomeKey, input.highMedian);
  const absDelta = Math.abs(input.medianDelta);
  const prefix = isPrior ? 'Next-day ' : 'Same-day ';

  let plainVerdict: string;
  if (absDelta < 0.05) {
    plainVerdict = `Minimal change in ${input.outcomeLabel} (${lowFormatted} -> ${highFormatted})`;
  } else {
    const absText = formatOutcomeDelta(input.outcomeKey, -absDelta).replace(/^-/, '');
    const verb = input.medianDelta > 0 ? 'increases by' : 'drops by';
    plainVerdict = `${prefix}${input.outcomeLabel} ${verb} ${absText} (${lowFormatted} -> ${highFormatted})`;
  }

  if (input.totalSampleN < 45) {
    plainVerdict = `${plainVerdict}. Early sample (<45 days).`;
  }

  const observationalCaveat =
    SUPPLEMENT_FEATURES.has(input.featureKey) && !input.isBeneficialDelta
      ? OBSERVATIONAL_SUPPLEMENT_CAVEAT
      : null;

  return {
    timingLabel,
    lowBucketLabel: lowLabel,
    highBucketLabel: highLabel,
    comparisonLabel,
    plainVerdict,
    observationalCaveat,
  };
}

export function selectHighlightDrivers(
  drivers: AnalyticsDriverItem[],
  limit: number,
  uniqueHabitsOnly = true,
): AnalyticsDriverItem[] {
  const confidenceRank = (label: ConfidenceLabel): number => {
    if (label === 'High Confidence') return 0;
    if (label === 'Moderate Confidence') return 1;
    return 2;
  };

  const ranked = [...drivers].sort((a, b) => {
    const rankDiff = confidenceRank(a.confidenceLabel) - confidenceRank(b.confidenceLabel);
    if (rankDiff !== 0) return rankDiff;
    const pDiff = a.pValue - b.pValue;
    if (Math.abs(pDiff) > 1e-9) return pDiff;
    return Math.abs(b.spearmanR) - Math.abs(a.spearmanR);
  });

  if (!uniqueHabitsOnly) {
    return ranked.slice(0, limit);
  }

  const picked: AnalyticsDriverItem[] = [];
  const pickedIds = new Set<number>();
  const seenFamilies = new Set<string>();
  const seenFeatures = new Set<string>();

  for (const item of ranked) {
    if (seenFamilies.has(item.dedupeGroup) || seenFeatures.has(item.featureKey)) continue;
    seenFamilies.add(item.dedupeGroup);
    seenFeatures.add(item.featureKey);
    picked.push(item);
    pickedIds.add(item.id);
    if (picked.length >= limit) break;
  }

  if (picked.length < limit) {
    for (const item of ranked) {
      if (pickedIds.has(item.id) || seenFeatures.has(item.featureKey)) continue;
      seenFeatures.add(item.featureKey);
      picked.push(item);
      pickedIds.add(item.id);
      if (picked.length >= limit) break;
    }
  }

  if (picked.length < limit) {
    for (const item of ranked) {
      if (pickedIds.has(item.id)) continue;
      picked.push(item);
      pickedIds.add(item.id);
      if (picked.length >= limit) break;
    }
  }

  return picked;
}

export function selectHighlightCliffs(
  cliffs: AnalyticsCliffItem[],
  limit: number,
  uniqueRulesOnly = true,
): AnalyticsCliffItem[] {
  const nonZero = cliffs.filter((c) => Math.abs(c.medianDelta) >= 0.1);
  const pool = nonZero.length > 0 ? nonZero : cliffs;
  const rankedPool = [...pool].sort((a, b) => {
    if (a.scope !== b.scope) {
      return a.scope === 'behavioural' ? -1 : 1;
    }
    return a.pValue - b.pValue || Math.abs(b.medianDelta) - Math.abs(a.medianDelta);
  });

  if (!uniqueRulesOnly) {
    return rankedPool.slice(0, limit);
  }

  const picked: AnalyticsCliffItem[] = [];
  const pickedIds = new Set<number>();
  const seenFeatures = new Set<string>();
  const seenRuleKeys = new Set<string>();

  for (const item of rankedPool) {
    const ruleKey = `${item.featureKey}:${item.thresholdRule}`;
    if (seenFeatures.has(item.featureKey) || seenRuleKeys.has(ruleKey)) continue;
    seenFeatures.add(item.featureKey);
    seenRuleKeys.add(ruleKey);
    picked.push(item);
    pickedIds.add(item.id);
    if (picked.length >= limit) break;
  }

  if (picked.length < limit) {
    for (const item of rankedPool) {
      const ruleKey = `${item.featureKey}:${item.thresholdRule}`;
      if (pickedIds.has(item.id) || seenRuleKeys.has(ruleKey)) continue;
      seenRuleKeys.add(ruleKey);
      picked.push(item);
      pickedIds.add(item.id);
      if (picked.length >= limit) break;
    }
  }

  return picked;
}

export interface AnalyticsDriverItem {
  id: number;
  runId: number;
  outcomeKey: string;
  outcomeLabel: string;
  outcomeUnit: string;
  featureKey: string;
  featureLabel: string;
  dedupeGroup: string;
  scope: FeatureScope;
  lagDays: number;
  lagLabel: string;
  sampleN: number;
  sampleStage: SampleStageLabel;
  isEarlySample: boolean;
  isPositiveEligible: boolean;
  spearmanR: number;
  pValue: number;
  fdrQValue: number | null;
  shapImportance: number | null;
  marginalEffect: number | null;
  direction: string;
  beneficialDirection: BeneficialDirection;
  strengthLabel: StrengthBand;
  confidenceLabel: ConfidenceLabel;
  takeawayText: string;
  observationalCaveat: string | null;
  confidenceTier: string;
}

export interface AnalyticsCliffItem {
  id: number;
  runId: number;
  outcomeKey: string;
  outcomeLabel: string;
  outcomeUnit: string;
  featureKey: string;
  featureLabel: string;
  scope: FeatureScope;
  thresholdRule: string;
  timingLabel: string;
  comparisonLabel: string;
  plainVerdict: string;
  observationalCaveat: string | null;
  sampleStage: SampleStageLabel;
  isEarlySample: boolean;
  confidenceLabel: ConfidenceLabel;
  isBeneficialDelta: boolean;
  lowBucketLabel: string;
  highBucketLabel: string;
  lowN: number;
  highN: number;
  lowMedian: number;
  highMedian: number;
  medianDelta: number;
  pValue: number;
}

export interface AnalyticsContrastItem {
  id: number;
  runId: number;
  cohortLabel: string;
  featureKey: string;
  featureLabel: string;
  scope: FeatureScope;
  best10Mean: number;
  worst10Mean: number;
  best10Formatted: string;
  worst10Formatted: string;
  effectSizeD: number;
  effectSizeLabel: EffectSizeLabel;
  sampleN: number;
  sampleStage: SampleStageLabel;
  isEarlySample: boolean;
}

export interface DomainCoverageItem {
  key: string;
  label: string;
  days: number;
  status: 'active' | 'warming' | 'pending';
}

export interface TodayScoreboard {
  day: string;
  lateCommsCount: number | null;
  bedtimeCaffeineMg: number;
  todayCaffeineMg: number;
  spendTotalGbp: number | null;
  spendSocialPubsGbp: number | null;
  amPillsTaken: boolean | null;
  pmPillsTaken: boolean | null;
  checkInLogged: boolean;
}

export interface RecentShiftItem {
  key: string;
  label: string;
  unit: string;
  meanBefore: number | null;
  nBefore: number;
  meanNow: number | null;
  nNow: number;
  delta: number | null;
  beforeFormatted: string;
  nowFormatted: string;
  deltaFormatted: string | null;
  isFavourable: boolean | null;
}

export interface ExperimentItem {
  id: number;
  name: string;
  hypothesis: string;
  featureKey: string;
  targetOutcomes: string[];
  startDay: string;
  endDay: string;
  baselineDays: number;
  status: string;
  verdict: string | null;
  resultsJson: Record<string, unknown> | null;
  createdAt: string;
}

export interface InsightsPayload {
  latestRun: {
    id: number;
    ranAt: string;
    windowDays: number;
    matrixDays: number;
    summaryJson: Record<string, unknown>;
  } | null;
  coverage: {
    totalDays: number;
    minDay: string | null;
    maxDay: string | null;
    domains: DomainCoverageItem[];
  };
  todayScoreboard: TodayScoreboard;
  recentShift: RecentShiftItem[];
  drivers: AnalyticsDriverItem[];
  thresholdCliffs: AnalyticsCliffItem[];
  groupContrasts: AnalyticsContrastItem[];
  behavioural: {
    drivers: AnalyticsDriverItem[];
    positiveDrivers: AnalyticsDriverItem[];
    negativeDrivers: AnalyticsDriverItem[];
    thresholdCliffs: AnalyticsCliffItem[];
    groupContrasts: AnalyticsContrastItem[];
  };
  environmental: {
    drivers: AnalyticsDriverItem[];
    thresholdCliffs: AnalyticsCliffItem[];
    groupContrasts: AnalyticsContrastItem[];
  };
  experiments: ExperimentItem[];
}
