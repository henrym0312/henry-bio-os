export type FeatureScope = 'behavioural' | 'environmental';
export type BeneficialDirection = 'beneficial' | 'detrimental';
export type StrengthBand = 'Strong' | 'Moderate' | 'Mild';
export type ConfidenceLabel = 'High Confidence' | 'Moderate Confidence' | 'Early Signal';
export type EffectSizeLabel = 'Very Large' | 'Large' | 'Moderate';

type FeatureValueKind = 'duration_mins' | 'gbp' | 'int' | 'decimal1' | 'boolean_rate';

interface OutcomeMeta {
  label: string;
  unit: string;
  higherIsBetter: boolean;
}

interface FeatureMeta {
  label: string;
  unit: string;
  valueKind: FeatureValueKind;
  dedupeGroup?: string;
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

export const OUTCOME_META: Record<string, OutcomeMeta> = {
  hrv_avg_ms: { label: 'HRV (Recovery)', unit: 'ms', higherIsBetter: true },
  lowest_hr_bpm: { label: 'Resting Heart Rate', unit: 'bpm', higherIsBetter: false },
  deep_sleep_min: { label: 'Deep Sleep', unit: 'mins', higherIsBetter: true },
  rem_sleep_min: { label: 'REM Sleep', unit: 'mins', higherIsBetter: true },
  total_sleep_min: { label: 'Total Sleep', unit: 'mins', higherIsBetter: true },
  sleep_efficiency_pct: { label: 'Sleep Efficiency', unit: '%', higherIsBetter: true },
  sleep_latency_min: { label: 'Time to Fall Asleep', unit: 'mins', higherIsBetter: false },
  readiness_score: { label: 'Readiness Score', unit: 'pts', higherIsBetter: true },
  sleep_score: { label: 'Sleep Score', unit: 'pts', higherIsBetter: true },
  mental_focus: { label: 'Mental Focus', unit: '/10', higherIsBetter: true },
  energy: { label: 'Physical Energy', unit: '/10', higherIsBetter: true },
  mood_calm: { label: 'Mood & Calm', unit: '/10', higherIsBetter: true },
  physical_soreness: { label: 'Physical Soreness', unit: '/10', higherIsBetter: false },
  task_completion_rate: { label: 'Task Completion', unit: '%', higherIsBetter: true },
  tasks_remaining: { label: 'Unfinished Tasks', unit: 'tasks', higherIsBetter: false },
};

export const OUTCOME_UNITS: Record<string, string> = Object.fromEntries(
  Object.entries(OUTCOME_META).map(([k, v]) => [k, v.unit]),
);

export const FEATURE_META: Record<string, FeatureMeta> = {
  imessages_total: { label: 'Total iMessages', unit: 'msgs', valueKind: 'int', dedupeGroup: 'imessages' },
  imessages_sent: { label: 'iMessages Sent', unit: 'msgs', valueKind: 'int', dedupeGroup: 'imessages' },
  imessages_received: { label: 'iMessages Received', unit: 'msgs', valueKind: 'int', dedupeGroup: 'imessages' },
  late_comms_count: { label: 'Messages After 9pm', unit: 'msgs', valueKind: 'int' },
  emails_total: { label: 'Total Emails', unit: 'emails', valueKind: 'int', dedupeGroup: 'emails' },
  emails_received_uni: { label: 'Uni Emails Received', unit: 'emails', valueKind: 'int', dedupeGroup: 'emails' },
  emails_sent_uni: { label: 'Uni Emails Sent', unit: 'emails', valueKind: 'int', dedupeGroup: 'emails' },
  emails_received_gmail: { label: 'Gmail Received', unit: 'emails', valueKind: 'int', dedupeGroup: 'emails' },
  emails_sent_gmail: { label: 'Gmail Sent', unit: 'emails', valueKind: 'int', dedupeGroup: 'emails' },
  mac_mins: { label: 'Mac Screen Time', unit: 'mins', valueKind: 'duration_mins' },
  iphone_mins: { label: 'iPhone Screen Time', unit: 'mins', valueKind: 'duration_mins' },
  combined_screen_mins: { label: 'Total Screen Time', unit: 'mins', valueKind: 'duration_mins' },
  wall_clock_screen_mins: { label: 'Active Screen Window', unit: 'mins', valueKind: 'duration_mins' },
  late_night_screen_mins: { label: 'Late-Night Screen Time', unit: 'mins', valueKind: 'duration_mins' },
  deep_work_mins: { label: 'Deep Work Time', unit: 'mins', valueKind: 'duration_mins' },
  social_screen_mins: { label: 'Social Media Time', unit: 'mins', valueKind: 'duration_mins' },
  video_screen_mins: { label: 'Video Time', unit: 'mins', valueKind: 'duration_mins' },
  dev_productivity_mins: { label: 'Productivity Time', unit: 'mins', valueKind: 'duration_mins' },
  context_switches: { label: 'App Switches', unit: 'switches', valueKind: 'int' },
  micro_checks: { label: 'Quick Phone Checks', unit: 'checks', valueKind: 'int' },
  am_pills_taken: { label: 'AM Supplements', unit: '', valueKind: 'boolean_rate' },
  pm_pills_taken: { label: 'PM Supplements', unit: '', valueKind: 'boolean_rate' },
  creatine_mg: { label: 'Daily Creatine', unit: 'mg', valueKind: 'int' },
  ginkgo_mg: { label: 'Daily Ginkgo', unit: 'mg', valueKind: 'int' },
  ashwagandha_mg: { label: 'Daily Ashwagandha', unit: 'mg', valueKind: 'int' },
  vitamin_d_ug: { label: 'Daily Vitamin D', unit: 'ug', valueKind: 'int' },
  magnesium_citrate_mg: { label: 'Evening Magnesium', unit: 'mg', valueKind: 'int' },
  caffeine_total_mg: { label: 'Daily Caffeine', unit: 'mg', valueKind: 'int' },
  last_caffeine_hour: { label: 'Last Caffeine Time', unit: 'hr', valueKind: 'decimal1' },
  bedtime_caffeine_mg: { label: 'Caffeine Left at Bedtime', unit: 'mg', valueKind: 'int' },
  alcohol_units: { label: 'Alcohol Units', unit: 'units', valueKind: 'decimal1' },
  last_alcohol_hour: { label: 'Last Drink Time', unit: 'hr', valueKind: 'decimal1' },
  spend_total_gbp: { label: 'Daily Spending', unit: 'GBP', valueKind: 'gbp' },
  spend_takeaway_gbp: { label: 'Takeaway Spending', unit: 'GBP', valueKind: 'gbp' },
  spend_groceries_gbp: { label: 'Grocery Spending', unit: 'GBP', valueKind: 'gbp' },
  spend_social_pubs_gbp: { label: 'Pub & Social Spending', unit: 'GBP', valueKind: 'gbp' },
  spend_coffee_gbp: { label: 'Coffee Shop Spending', unit: 'GBP', valueKind: 'gbp' },
  tx_count: { label: 'Card Transactions', unit: 'txs', valueKind: 'int' },
  late_spend_count: { label: 'Late-Night Purchases', unit: 'txs', valueKind: 'int' },
  photoperiod_hours: { label: 'Daylight Hours', unit: 'hrs', valueKind: 'decimal1' },
  pressure_hpa: { label: 'Air Pressure', unit: '', valueKind: 'int' },
  pressure_delta_24h: { label: '24h Air Pressure Drop/Rise', unit: '', valueKind: 'decimal1' },
  temp_mean_c: { label: 'Outdoor Temperature', unit: 'C', valueKind: 'decimal1' },
  humidity_pct: { label: 'Outdoor Humidity', unit: '%', valueKind: 'int' },
  cloud_cover_pct: { label: 'Cloud Cover', unit: '%', valueKind: 'int' },
  precipitation_mm: { label: 'Rainfall', unit: 'mm', valueKind: 'decimal1' },
  uv_max: { label: 'Peak UV Index', unit: 'UV', valueKind: 'decimal1' },
  european_aqi: { label: 'Air Quality Index', unit: 'AQI', valueKind: 'int' },
  pm25: { label: 'Air Pollution (PM2.5)', unit: 'PM2.5', valueKind: 'decimal1' },
  is_weekend: { label: 'Weekend vs Weekday', unit: '', valueKind: 'boolean_rate' },
  recovery_high_mins: { label: 'Oura Restorative Time', unit: 'mins', valueKind: 'duration_mins' },
  stress_high_mins: { label: 'Oura High Stress Time', unit: 'mins', valueKind: 'duration_mins' },
  active_calories: { label: 'Active Calories', unit: 'kcal', valueKind: 'int' },
  steps: { label: 'Daily Steps', unit: 'steps', valueKind: 'int' },
  headphone_audio_avg_db: { label: 'Headphone Volume', unit: 'dB', valueKind: 'decimal1' },
  headphone_audio_mins: { label: 'Headphone Listening Time', unit: 'mins', valueKind: 'duration_mins' },
  env_audio_avg_db: { label: 'Ambient Noise Level', unit: 'dB', valueKind: 'decimal1' },
  env_audio_max_db: { label: 'Peak Ambient Noise', unit: 'dB', valueKind: 'decimal1' },
  time_in_daylight_mins: { label: 'Time Outside in Daylight', unit: 'mins', valueKind: 'duration_mins' },
  body_mass_kg: { label: 'Body Weight', unit: 'kg', valueKind: 'decimal1' },
  workout_mins: { label: 'Exercise Time', unit: 'mins', valueKind: 'duration_mins' },
  hours_at_home: { label: 'Hours at Home', unit: 'hrs', valueKind: 'decimal1' },
  drive_mins: { label: 'Driving Time', unit: 'mins', valueKind: 'duration_mins' },
  drive_trips: { label: 'Driving Trips', unit: 'trips', valueKind: 'int' },
  is_away_sleep: { label: 'Sleeping Away From Home', unit: '', valueKind: 'boolean_rate' },
  tv_active_mins: { label: 'TV Watch Time', unit: 'mins', valueKind: 'duration_mins' },
  tv_late_mins: { label: 'Late-Night TV Time', unit: 'mins', valueKind: 'duration_mins' },
  audio_playback_mins: { label: 'Audio Listening Time', unit: 'mins', valueKind: 'duration_mins' },
  music_mins: { label: 'Music Listening Time', unit: 'mins', valueKind: 'duration_mins' },
  video_mins: { label: 'Video Watching Time', unit: 'mins', valueKind: 'duration_mins' },
  bedtime_audio_used: { label: 'Audio Used Before Sleep', unit: '', valueKind: 'boolean_rate' },
  adhd_med_doses: { label: 'ADHD Med Doses', unit: 'doses', valueKind: 'decimal1' },
  adhd_total_mg: { label: 'Daily ADHD Medication', unit: 'mg', valueKind: 'int' },
  last_adhd_med_hour: { label: 'Last ADHD Dose Hour', unit: 'hr', valueKind: 'decimal1' },
  social_bandwidth: { label: 'Social Level', unit: '/3', valueKind: 'decimal1' },
  task_completion_rate: { label: 'Task Completion', unit: '%', valueKind: 'int' },
  tasks_remaining: { label: 'Unfinished Tasks', unit: 'tasks', valueKind: 'int' },
};

function titleCaseFallback(rawKey: string): string {
  return rawKey
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
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

export function getFeatureDedupeGroup(featureKey: string): string {
  return FEATURE_META[featureKey]?.dedupeGroup ?? featureKey;
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

export function getStrengthBand(spearmanR: number): StrengthBand {
  const absR = Math.abs(spearmanR);
  if (absR >= 0.45) return 'Strong';
  if (absR >= 0.3) return 'Moderate';
  return 'Mild';
}

export function getConfidenceLabel(
  pValue: number,
  fdrQValue: number | null,
): ConfidenceLabel {
  if ((fdrQValue !== null && fdrQValue < 0.01) || pValue < 0.001) {
    return 'High Confidence';
  }
  if (pValue < 0.05) {
    return 'Moderate Confidence';
  }
  return 'Early Signal';
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
    return `${rounded} mins`;
  }
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
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
    return formatMetricNumber(value, 1);
  }
  if (meta.valueKind === 'duration_mins') {
    return formatMinutesHm(value);
  }
  if (meta.valueKind === 'gbp') {
    return `£${value.toFixed(2)}`;
  }
  if (meta.valueKind === 'boolean_rate') {
    return `${Math.round(value * 100)}% of days`;
  }
  if (meta.valueKind === 'int') {
    const rounded = Math.round(value);
    return meta.unit ? `${rounded} ${meta.unit}` : String(rounded);
  }
  const formatted = formatMetricNumber(value, 1);
  return meta.unit ? `${formatted} ${meta.unit}` : formatted;
}

export function formatOutcomeValue(outcomeKey: string, value: number): string {
  const unit = getOutcomeUnit(outcomeKey);
  const numStr = formatMetricNumber(value, 1);
  if (unit === '%' || unit === '/10') {
    return `${numStr}${unit}`;
  }
  return unit ? `${numStr} ${unit}` : numStr;
}

export function formatOutcomeDelta(outcomeKey: string, delta: number): string {
  const unit = getOutcomeUnit(outcomeKey);
  const numStr = formatMetricNumber(Math.abs(delta), 1);
  const sign = delta > 0 ? '+' : delta < 0 ? '-' : '';
  if (unit === '%' || unit === '/10') {
    return `${sign}${numStr}${unit}`;
  }
  return unit ? `${sign}${numStr} ${unit}` : `${sign}${numStr}`;
}

export function buildDriverTakeaway(
  featureLabel: string,
  outcomeKey: string,
  outcomeLabel: string,
  spearmanR: number,
  lagDays: number,
): string {
  const timing =
    lagDays === 0
      ? 'on the same day'
      : lagDays === 1
        ? 'next day'
        : `${lagDays} days later`;
  const effectDirection = spearmanR >= 0 ? 'higher' : 'lower';
  if (outcomeKey === 'lowest_hr_bpm') {
    return `Higher ${featureLabel} is linked to ${effectDirection} ${outcomeLabel} ${timing}.`;
  }
  return `Higher ${featureLabel} is linked to ${effectDirection} ${timing} ${outcomeLabel}.`;
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

  return {
    timingLabel,
    lowBucketLabel: lowLabel,
    highBucketLabel: highLabel,
    comparisonLabel,
    plainVerdict,
  };
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
}

export interface DomainCoverageItem {
  key: string;
  label: string;
  days: number;
  status: 'active' | 'warming' | 'pending';
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
