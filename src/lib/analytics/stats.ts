import { asc, desc } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  medLogs,
  ouraDailyActivity,
  ouraDailyCardiovascularAge,
  ouraDailyReadiness,
  ouraDailyResilience,
  ouraDailySleep,
  ouraDailySpo2,
  ouraDailyStress,
  ouraSleep,
  ouraVo2Max,
  ouraWorkout,
  dailyTaskMetrics,
} from '@/db/schema';
import { computeBedtimePkForNight, type MedDoseInput } from './pk';

export type CorrelationWindow = '30d' | '90d' | '365d' | 'all';
export type CorrelationLag = 0 | 1 | 2;

export type MetricDomain =
  | 'medication'
  | 'sleep'
  | 'readiness'
  | 'activity'
  | 'stress'
  | 'cardio'
  | 'tasks';

export interface MetricDefinition {
  key: string;
  label: string;
  domain: MetricDomain;
  unit: string;
  description: string;
}

export const METRIC_CATALOGUE: MetricDefinition[] = [
  {
    key: 'bedtime_serum_ng_ml',
    label: 'Bedtime Serum Concentration',
    domain: 'medication',
    unit: 'ng/mL',
    description: 'Estimated residual stimulant serum concentration at bedtime_start (Bateman PK)',
  },
  {
    key: 'hours_since_last_dose',
    label: 'Hours Since Last Dose',
    domain: 'medication',
    unit: 'hrs',
    description: 'Elapsed hours between final medication dose and bedtime_start',
  },
  {
    key: 'total_daily_med_mg',
    label: 'Total Daily Medication Dose',
    domain: 'medication',
    unit: 'mg',
    description: 'Cumulative LDX/IR milligrams taken prior to sleep',
  },
  {
    key: 'sleep.score',
    label: 'Daily Sleep Score',
    domain: 'sleep',
    unit: 'pts',
    description: 'Oura daily sleep composite score (0–100)',
  },
  {
    key: 'sleep.total_sleep_duration',
    label: 'Total Sleep Duration',
    domain: 'sleep',
    unit: 'min',
    description: 'Total nocturnal sleep duration in minutes',
  },
  {
    key: 'sleep.deep_sleep_duration',
    label: 'Deep Sleep Duration',
    domain: 'sleep',
    unit: 'min',
    description: 'Slow-wave deep sleep duration in minutes',
  },
  {
    key: 'sleep.rem_sleep_duration',
    label: 'REM Sleep Duration',
    domain: 'sleep',
    unit: 'min',
    description: 'Rapid eye movement sleep duration in minutes',
  },
  {
    key: 'sleep.latency',
    label: 'Sleep Onset Latency',
    domain: 'sleep',
    unit: 'min',
    description: 'Time required to fall asleep after getting into bed',
  },
  {
    key: 'sleep.efficiency',
    label: 'Sleep Efficiency',
    domain: 'sleep',
    unit: '%',
    description: 'Percentage of time in bed spent asleep',
  },
  {
    key: 'sleep.average_hrv',
    label: 'Nocturnal Average HRV',
    domain: 'sleep',
    unit: 'ms',
    description: 'Mean RMSSD heart rate variability during primary sleep',
  },
  {
    key: 'sleep.lowest_heart_rate',
    label: 'Lowest Nocturnal HR',
    domain: 'sleep',
    unit: 'bpm',
    description: 'eCore 30-second minimum heart rate during sleep',
  },
  {
    key: 'sleep.average_breath',
    label: 'Respiratory Rate',
    domain: 'sleep',
    unit: 'br/min',
    description: 'Average nocturnal breathing rate',
  },
  {
    key: 'sleep.time_to_lowest_hr_mins',
    label: 'Time to Lowest HR',
    domain: 'sleep',
    unit: 'min',
    description: 'Minutes from bedtime_start until lowest nocturnal heart rate occurs',
  },
  {
    key: 'daily_readiness.score',
    label: 'Readiness Score',
    domain: 'readiness',
    unit: 'pts',
    description: 'Oura daily readiness composite score (0–100)',
  },
  {
    key: 'daily_readiness.temperature_deviation',
    label: 'Temperature Deviation',
    domain: 'readiness',
    unit: '°C',
    description: 'Nocturnal skin temperature deviation from baseline',
  },
  {
    key: 'daily_stress.stress_high',
    label: 'Daytime High Stress',
    domain: 'stress',
    unit: 'min',
    description: 'Minutes spent in top-quartile physiological stress zone',
  },
  {
    key: 'daily_stress.recovery_high',
    label: 'Daytime High Recovery',
    domain: 'stress',
    unit: 'min',
    description: 'Minutes spent in bottom-quartile autonomic recovery zone',
  },
  {
    key: 'daily_resilience.level',
    label: 'Resilience Level (1–5)',
    domain: 'stress',
    unit: 'tier',
    description: 'Numeric resilience tier: Limited=1, Adequate=2, Solid=3, Strong=4, Exceptional=5',
  },
  {
    key: 'workout.calories',
    label: 'Workout Calories',
    domain: 'activity',
    unit: 'kcal',
    description: 'Cumulative energy burned across logged workouts',
  },
  {
    key: 'daily_activity.high_activity_time',
    label: 'High Activity Duration',
    domain: 'activity',
    unit: 'min',
    description: 'Minutes spent in vigorous physical activity',
  },
  {
    key: 'daily_activity.active_calories',
    label: 'Active Calories',
    domain: 'activity',
    unit: 'kcal',
    description: 'Daily active kilocalories expended',
  },
  {
    key: 'daily_activity.steps',
    label: 'Daily Steps',
    domain: 'activity',
    unit: 'steps',
    description: 'Total step count recorded by the Oura Ring',
  },
  {
    key: 'daily_activity.score',
    label: 'Activity Score',
    domain: 'activity',
    unit: 'pts',
    description: 'Oura daily activity composite score (0–100)',
  },
  {
    key: 'daily_cardiovascular_age.pulse_wave_velocity',
    label: 'Pulse Wave Velocity',
    domain: 'cardio',
    unit: 'm/s',
    description: 'Estimated arterial stiffness / pulse wave velocity',
  },
  {
    key: 'daily_cardiovascular_age.vascular_age',
    label: 'Vascular Age',
    domain: 'cardio',
    unit: 'yrs',
    description: 'Estimated cardiovascular age',
  },
  {
    key: 'daily_spo2.spo2_average',
    label: 'Nocturnal SpO2 Average',
    domain: 'cardio',
    unit: '%',
    description: 'Average blood oxygen saturation during sleep',
  },
  {
    key: 'daily_spo2.breathing_disturbance_index',
    label: 'Breathing Disturbance Index',
    domain: 'cardio',
    unit: 'idx',
    description: 'Detected oxygen desaturation disturbance index',
  },
  {
    key: 'vo2_max.vo2_max',
    label: 'VO2 Max',
    domain: 'cardio',
    unit: 'mL/kg/min',
    description: 'Estimated cardiorespiratory fitness capacity',
  },
  {
    key: 'daily_task_metrics.remainingCount',
    label: 'Tasks Remaining',
    domain: 'tasks',
    unit: 'tasks',
    description: 'Unfinished daily Reminders remaining at end of day',
  },
  {
    key: 'daily_task_metrics.addedCount',
    label: 'Tasks Added',
    domain: 'tasks',
    unit: 'tasks',
    description: 'New Reminders added during the day',
  },
  {
    key: 'daily_task_metrics.completedCount',
    label: 'Tasks Completed',
    domain: 'tasks',
    unit: 'tasks',
    description: 'Reminders completed during the day',
  },
  {
    key: 'daily_task_metrics.completionPct',
    label: 'Task Completion Rate',
    domain: 'tasks',
    unit: '%',
    description: 'Percentage of daily task pool completed',
  },
];

export interface CorrelationPreset {
  id: string;
  label: string;
  x: string;
  y: string;
  lag: CorrelationLag;
  category: 'Pharmacokinetics & Sleep' | 'Workload & Autonomic Stress' | 'Training & Recovery';
}

export const PRESET_CORRELATION_PAIRS: CorrelationPreset[] = [
  {
    id: 'pk-latency',
    label: 'Bedtime Serum vs. Sleep Latency',
    x: 'bedtime_serum_ng_ml',
    y: 'sleep.latency',
    lag: 0,
    category: 'Pharmacokinetics & Sleep',
  },
  {
    id: 'pk-deep',
    label: 'Bedtime Serum vs. Deep Sleep',
    x: 'bedtime_serum_ng_ml',
    y: 'sleep.deep_sleep_duration',
    lag: 0,
    category: 'Pharmacokinetics & Sleep',
  },
  {
    id: 'pk-rem',
    label: 'Bedtime Serum vs. REM Sleep',
    x: 'bedtime_serum_ng_ml',
    y: 'sleep.rem_sleep_duration',
    lag: 0,
    category: 'Pharmacokinetics & Sleep',
  },
  {
    id: 'pk-hrv',
    label: 'Bedtime Serum vs. Nocturnal HRV',
    x: 'bedtime_serum_ng_ml',
    y: 'sleep.average_hrv',
    lag: 0,
    category: 'Pharmacokinetics & Sleep',
  },
  {
    id: 'pk-nadir',
    label: 'Bedtime Serum vs. Time to Lowest HR',
    x: 'bedtime_serum_ng_ml',
    y: 'sleep.time_to_lowest_hr_mins',
    lag: 0,
    category: 'Pharmacokinetics & Sleep',
  },
  {
    id: 'tasks-remaining-stress',
    label: 'Tasks Remaining vs. Stress High',
    x: 'daily_task_metrics.remainingCount',
    y: 'daily_stress.stress_high',
    lag: 0,
    category: 'Workload & Autonomic Stress',
  },
  {
    id: 'tasks-added-stress',
    label: 'Tasks Added vs. Stress High',
    x: 'daily_task_metrics.addedCount',
    y: 'daily_stress.stress_high',
    lag: 0,
    category: 'Workload & Autonomic Stress',
  },
  {
    id: 'tasks-remaining-recovery',
    label: 'Tasks Remaining vs. Recovery High',
    x: 'daily_task_metrics.remainingCount',
    y: 'daily_stress.recovery_high',
    lag: 0,
    category: 'Workload & Autonomic Stress',
  },
  {
    id: 'workout-next-hrv',
    label: 'Workout Calories vs. Next-Day HRV (+1d)',
    x: 'workout.calories',
    y: 'sleep.average_hrv',
    lag: 1,
    category: 'Training & Recovery',
  },
  {
    id: 'high-activity-readiness',
    label: 'High Activity vs. Next-Day Readiness (+1d)',
    x: 'daily_activity.high_activity_time',
    y: 'daily_readiness.score',
    lag: 1,
    category: 'Training & Recovery',
  },
  {
    id: 'workout-resilience',
    label: 'Workout Calories vs. Next-Day Resilience (+1d)',
    x: 'workout.calories',
    y: 'daily_resilience.level',
    lag: 1,
    category: 'Training & Recovery',
  },
];

export type DailyMetricRow = {
  day: string;
  values: Record<string, number | null>;
};

const RESILIENCE_LEVEL_SCORE: Record<string, number> = {
  limited: 1,
  adequate: 2,
  solid: 3,
  strong: 4,
  exceptional: 5,
};

function addCalendarDays(day: string, offset: number): string {
  const dt = new Date(`${day}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + offset);
  return dt.toISOString().slice(0, 10);
}

function computeTimeToLowestHrMins(
  heartRate: { interval: number; items: Array<number | null> } | null,
): number | null {
  if (!heartRate || !Array.isArray(heartRate.items) || heartRate.items.length === 0) {
    return null;
  }
  let minVal = Infinity;
  let minIdx = -1;
  for (let i = 0; i < heartRate.items.length; i++) {
    const val = heartRate.items[i];
    if (typeof val === 'number' && val > 0 && val < minVal) {
      minVal = val;
      minIdx = i;
    }
  }
  if (minIdx < 0) return null;
  return Math.round(((minIdx * heartRate.interval) / 60) * 10) / 10;
}

/**
 * Queries all Oura + external telemetry tables and builds a unified, day-indexed metric matrix.
 */
export async function buildDailyTelemetryMatrix(): Promise<DailyMetricRow[]> {
  const db = getDb();

  const [
    readinessRows,
    dailySleepRows,
    sleepRows,
    activityRows,
    stressRows,
    resilienceRows,
    spo2Rows,
    cardioRows,
    vo2Rows,
    workoutRows,
    medRows,
    taskRows,
  ] = await Promise.all([
    db.select().from(ouraDailyReadiness).orderBy(asc(ouraDailyReadiness.day)),
    db.select().from(ouraDailySleep).orderBy(asc(ouraDailySleep.day)),
    db.select().from(ouraSleep).orderBy(asc(ouraSleep.day)),
    db.select().from(ouraDailyActivity).orderBy(asc(ouraDailyActivity.day)),
    db.select().from(ouraDailyStress).orderBy(asc(ouraDailyStress.day)),
    db.select().from(ouraDailyResilience).orderBy(asc(ouraDailyResilience.day)),
    db.select().from(ouraDailySpo2).orderBy(asc(ouraDailySpo2.day)),
    db
      .select()
      .from(ouraDailyCardiovascularAge)
      .orderBy(asc(ouraDailyCardiovascularAge.day)),
    db.select().from(ouraVo2Max).orderBy(asc(ouraVo2Max.day)),
    db.select().from(ouraWorkout).orderBy(asc(ouraWorkout.day)),
    db.select().from(medLogs).orderBy(asc(medLogs.takenAt)),
    db.select().from(dailyTaskMetrics).orderBy(asc(dailyTaskMetrics.day)),
  ]);

  const byDay = new Map<string, Record<string, number | null>>();
  const ensureDay = (day: string): Record<string, number | null> => {
    let entry = byDay.get(day);
    if (!entry) {
      entry = {};
      byDay.set(day, entry);
    }
    return entry;
  };

  for (const r of readinessRows) {
    const d = ensureDay(r.day);
    d['daily_readiness.score'] = r.score ?? null;
    d['daily_readiness.temperature_deviation'] = r.temperatureDeviation ?? null;
  }

  for (const s of dailySleepRows) {
    const d = ensureDay(s.day);
    d['sleep.score'] = s.score ?? null;
  }

  // Pick primary sleep period per day (long_sleep preferred, otherwise longest duration)
  const primarySleepByDay = new Map<string, (typeof sleepRows)[number]>();
  for (const sl of sleepRows) {
    const prev = primarySleepByDay.get(sl.day);
    if (!prev) {
      primarySleepByDay.set(sl.day, sl);
      continue;
    }
    const prevIsLong = prev.type === 'long_sleep';
    const currIsLong = sl.type === 'long_sleep';
    if (currIsLong && !prevIsLong) {
      primarySleepByDay.set(sl.day, sl);
    } else if (
      currIsLong === prevIsLong &&
      (sl.totalSleepDuration ?? 0) > (prev.totalSleepDuration ?? 0)
    ) {
      primarySleepByDay.set(sl.day, sl);
    }
  }

  const allMedDoses: MedDoseInput[] = medRows.map((m) => ({
    id: m.id,
    doseId: m.doseId,
    drugType: m.drugType,
    mg: m.mg,
    takenAt: m.takenAt,
    day: m.day,
  }));

  for (const [day, sl] of primarySleepByDay.entries()) {
    const d = ensureDay(day);
    d['sleep.total_sleep_duration'] =
      sl.totalSleepDuration !== null ? Math.round((sl.totalSleepDuration / 60) * 10) / 10 : null;
    d['sleep.deep_sleep_duration'] =
      sl.deepSleepDuration !== null ? Math.round((sl.deepSleepDuration / 60) * 10) / 10 : null;
    d['sleep.rem_sleep_duration'] =
      sl.remSleepDuration !== null ? Math.round((sl.remSleepDuration / 60) * 10) / 10 : null;
    d['sleep.latency'] =
      sl.latency !== null ? Math.round((sl.latency / 60) * 10) / 10 : null;
    d['sleep.efficiency'] = sl.efficiency ?? null;
    d['sleep.average_hrv'] = sl.averageHrv ?? null;
    d['sleep.lowest_heart_rate'] = sl.lowestHeartRate ?? null;
    d['sleep.average_breath'] = sl.averageBreath ?? null;
    d['sleep.time_to_lowest_hr_mins'] = computeTimeToLowestHrMins(sl.heartRate);

    if (allMedDoses.length > 0) {
      const pk = computeBedtimePkForNight(sl.bedtimeStart, allMedDoses);
      d['bedtime_serum_ng_ml'] = pk.bedtimeSerumNgMl;
      d['hours_since_last_dose'] = pk.hoursSinceLastDose;
      d['total_daily_med_mg'] = pk.totalDailyMg;
    }
  }

  // Also record daily total med mg on days with med logs even if no sleep row exists yet
  const dailyMedTotals = new Map<string, number>();
  for (const m of medRows) {
    dailyMedTotals.set(m.day, (dailyMedTotals.get(m.day) ?? 0) + m.mg);
  }
  for (const [day, totalMg] of dailyMedTotals.entries()) {
    const d = ensureDay(day);
    if (d['total_daily_med_mg'] === undefined) {
      d['total_daily_med_mg'] = totalMg;
    }
  }

  for (const a of activityRows) {
    const d = ensureDay(a.day);
    d['daily_activity.score'] = a.score ?? null;
    d['daily_activity.steps'] = a.steps ?? null;
    d['daily_activity.active_calories'] = a.activeCalories ?? null;
    d['daily_activity.high_activity_time'] =
      a.highActivityTime !== null ? Math.round((a.highActivityTime / 60) * 10) / 10 : null;
  }

  for (const st of stressRows) {
    const d = ensureDay(st.day);
    d['daily_stress.stress_high'] =
      st.stressHigh !== null ? Math.round((st.stressHigh / 60) * 10) / 10 : null;
    d['daily_stress.recovery_high'] =
      st.recoveryHigh !== null ? Math.round((st.recoveryHigh / 60) * 10) / 10 : null;
  }

  for (const res of resilienceRows) {
    const d = ensureDay(res.day);
    d['daily_resilience.level'] = res.level
      ? (RESILIENCE_LEVEL_SCORE[res.level] ?? null)
      : null;
  }

  for (const sp of spo2Rows) {
    const d = ensureDay(sp.day);
    d['daily_spo2.spo2_average'] = sp.spo2Average ?? null;
    d['daily_spo2.breathing_disturbance_index'] = sp.breathingDisturbanceIndex ?? null;
  }

  for (const cv of cardioRows) {
    const d = ensureDay(cv.day);
    d['daily_cardiovascular_age.pulse_wave_velocity'] = cv.pulseWaveVelocity ?? null;
    d['daily_cardiovascular_age.vascular_age'] = cv.vascularAge ?? null;
  }

  for (const v of vo2Rows) {
    const d = ensureDay(v.day);
    d['vo2_max.vo2_max'] = v.vo2Max ?? null;
  }

  const workoutTotals = new Map<string, number>();
  for (const w of workoutRows) {
    if (typeof w.calories === 'number') {
      workoutTotals.set(w.day, (workoutTotals.get(w.day) ?? 0) + w.calories);
    }
  }
  for (const [day, calories] of workoutTotals.entries()) {
    const d = ensureDay(day);
    d['workout.calories'] = Math.round(calories * 10) / 10;
  }

  for (const t of taskRows) {
    const d = ensureDay(t.day);
    d['daily_task_metrics.remainingCount'] = t.remainingCount;
    d['daily_task_metrics.addedCount'] = t.addedCount;
    d['daily_task_metrics.completedCount'] = t.completedCount;
    d['daily_task_metrics.completionPct'] = t.completionPct;
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, values]) => ({ day, values }));
}

export interface ZScoreMetricReport {
  metricKey: string;
  label: string;
  unit: string;
  adverseDirection: 'high' | 'low';
  value: number | null;
  mean30d: number | null;
  stdDev30d: number | null;
  baselineSampleSize: number;
  zScore: number | null;
  isAdverseDeviation: boolean;
}

export interface AnomalyDetectionReport {
  targetDay: string | null;
  strainAlert: boolean;
  adverseCount: number;
  thresholdSigma: number;
  metrics: ZScoreMetricReport[];
  recentTimeline: Array<{
    day: string;
    adverseCount: number;
    strainAlert: boolean;
    flaggedMetrics: string[];
  }>;
}

const MONITORED_ANOMALY_METRICS: Array<{
  metricKey: string;
  label: string;
  unit: string;
  adverseDirection: 'high' | 'low';
}> = [
  {
    metricKey: 'daily_readiness.temperature_deviation',
    label: 'Temperature Deviation',
    unit: '°C',
    adverseDirection: 'high',
  },
  {
    metricKey: 'sleep.average_breath',
    label: 'Respiratory Rate',
    unit: 'br/min',
    adverseDirection: 'high',
  },
  {
    metricKey: 'sleep.lowest_heart_rate',
    label: 'Lowest Nocturnal HR',
    unit: 'bpm',
    adverseDirection: 'high',
  },
  {
    metricKey: 'sleep.average_hrv',
    label: 'Nocturnal Average HRV',
    unit: 'ms',
    adverseDirection: 'low',
  },
  {
    metricKey: 'daily_cardiovascular_age.pulse_wave_velocity',
    label: 'Pulse Wave Velocity',
    unit: 'm/s',
    adverseDirection: 'high',
  },
];

function computeMeanAndStdDev(values: number[]): { mean: number; stdDev: number } {
  const n = values.length;
  const mean = values.reduce((acc, v) => acc + v, 0) / n;
  if (n < 2) {
    return { mean, stdDev: 0 };
  }
  const variance =
    values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1);
  return { mean, stdDev: Math.sqrt(variance) };
}

function evaluateDayZScores(
  targetRow: DailyMetricRow,
  matrix: DailyMetricRow[],
  thresholdSigma = 1.5,
): {
  metrics: ZScoreMetricReport[];
  adverseCount: number;
  strainAlert: boolean;
} {
  const windowStart = addCalendarDays(targetRow.day, -30);
  const baselineRows = matrix.filter(
    (r) => r.day >= windowStart && r.day < targetRow.day,
  );

  const metrics: ZScoreMetricReport[] = MONITORED_ANOMALY_METRICS.map((spec) => {
    const rawVal = targetRow.values[spec.metricKey];
    const value = typeof rawVal === 'number' && Number.isFinite(rawVal) ? rawVal : null;

    const baselineVals = baselineRows
      .map((r) => r.values[spec.metricKey])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

    if (value === null || baselineVals.length < 5) {
      const { mean, stdDev } =
        baselineVals.length > 0
          ? computeMeanAndStdDev(baselineVals)
          : { mean: 0, stdDev: 0 };
      return {
        metricKey: spec.metricKey,
        label: spec.label,
        unit: spec.unit,
        adverseDirection: spec.adverseDirection,
        value,
        mean30d: baselineVals.length > 0 ? Math.round(mean * 1000) / 1000 : null,
        stdDev30d: baselineVals.length > 1 ? Math.round(stdDev * 1000) / 1000 : null,
        baselineSampleSize: baselineVals.length,
        zScore: null,
        isAdverseDeviation: false,
      };
    }

    const { mean, stdDev } = computeMeanAndStdDev(baselineVals);
    const zScore =
      stdDev > 1e-6 ? Math.round(((value - mean) / stdDev) * 100) / 100 : 0;

    const isAdverseDeviation =
      spec.adverseDirection === 'high'
        ? zScore > thresholdSigma
        : zScore < -thresholdSigma;

    return {
      metricKey: spec.metricKey,
      label: spec.label,
      unit: spec.unit,
      adverseDirection: spec.adverseDirection,
      value: Math.round(value * 1000) / 1000,
      mean30d: Math.round(mean * 1000) / 1000,
      stdDev30d: Math.round(stdDev * 1000) / 1000,
      baselineSampleSize: baselineVals.length,
      zScore,
      isAdverseDeviation,
    };
  });

  const adverseCount = metrics.filter((m) => m.isAdverseDeviation).length;
  return {
    metrics,
    adverseCount,
    strainAlert: adverseCount >= 2,
  };
}

/**
 * 30-Day Rolling Z-Score Anomaly Detector across the 5 physiological strain metrics.
 * Flags `strainAlert: true` whenever >= 2 metrics deviate beyond 1.5 sigma in an adverse direction.
 */
export function computeAnomalyStatusFromMatrix(
  matrix: DailyMetricRow[],
  thresholdSigma = 1.5,
): AnomalyDetectionReport {
  if (matrix.length === 0) {
    return {
      targetDay: null,
      strainAlert: false,
      adverseCount: 0,
      thresholdSigma,
      metrics: MONITORED_ANOMALY_METRICS.map((m) => ({
        metricKey: m.metricKey,
        label: m.label,
        unit: m.unit,
        adverseDirection: m.adverseDirection,
        value: null,
        mean30d: null,
        stdDev30d: null,
        baselineSampleSize: 0,
        zScore: null,
        isAdverseDeviation: false,
      })),
      recentTimeline: [],
    };
  }

  // Pick the most recent day that has at least one monitored physiological metric
  let targetRow = matrix[matrix.length - 1];
  for (let i = matrix.length - 1; i >= 0; i--) {
    const row = matrix[i];
    const hasAny = MONITORED_ANOMALY_METRICS.some(
      (m) => typeof row.values[m.metricKey] === 'number',
    );
    if (hasAny) {
      targetRow = row;
      break;
    }
  }

  const latestEval = evaluateDayZScores(targetRow, matrix, thresholdSigma);
  const recentRows = matrix.slice(-30);
  const recentTimeline = recentRows.map((row) => {
    const ev = evaluateDayZScores(row, matrix, thresholdSigma);
    return {
      day: row.day,
      adverseCount: ev.adverseCount,
      strainAlert: ev.strainAlert,
      flaggedMetrics: ev.metrics
        .filter((m) => m.isAdverseDeviation)
        .map((m) => m.label),
    };
  });

  return {
    targetDay: targetRow.day,
    strainAlert: latestEval.strainAlert,
    adverseCount: latestEval.adverseCount,
    thresholdSigma,
    metrics: latestEval.metrics,
    recentTimeline,
  };
}

export async function getAnomalyReport(): Promise<AnomalyDetectionReport> {
  const matrix = await buildDailyTelemetryMatrix();
  return computeAnomalyStatusFromMatrix(matrix);
}

export interface ScatterPoint {
  dayX: string;
  dayY: string;
  x: number;
  y: number;
}

export interface CorrelationResult {
  xKey: string;
  yKey: string;
  xLabel: string;
  yLabel: string;
  xUnit: string;
  yUnit: string;
  window: CorrelationWindow;
  lag: CorrelationLag;
  n: number;
  r: number | null;
  rSquared: number | null;
  slope: number | null;
  intercept: number | null;
  pValueApprox: number | null;
  points: ScatterPoint[];
}

function erfcApprox(x: number): number {
  const absX = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * absX);
  const poly =
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t) *
    Math.exp(-absX * absX);
  return x >= 0 ? poly : 2 - poly;
}

function approximateTwoTailedPValue(r: number, n: number): number | null {
  if (n <= 2) return null;
  const clampedR = Math.max(-0.999999, Math.min(0.999999, r));
  const df = n - 2;
  const t = Math.abs(clampedR) * Math.sqrt(df / (1 - clampedR * clampedR));
  const z =
    (t * (1 - 1 / (4 * df))) /
    Math.sqrt(1 + (t * t) / (2 * df));
  const pOneTail = 0.5 * erfcApprox(z / Math.SQRT2);
  return Math.min(1, Math.max(0, Math.round(2 * pOneTail * 10000) / 10000));
}

function getWindowCutoffDay(
  matrix: DailyMetricRow[],
  window: CorrelationWindow,
): string | null {
  if (window === 'all' || matrix.length === 0) return null;
  const daysBack = window === '30d' ? 30 : window === '90d' ? 90 : 365;
  const latestDay = matrix[matrix.length - 1].day;
  return addCalendarDays(latestDay, -daysBack);
}

/**
 * Computes Pearson correlation (`r`), sample size (`n`), and OLS regression slope/intercept
 * for any two metrics across configurable date windows and day lag offsets.
 */
export function computeCorrelationFromMatrix(
  matrix: DailyMetricRow[],
  xKey: string,
  yKey: string,
  window: CorrelationWindow = '90d',
  lag: CorrelationLag = 0,
): CorrelationResult {
  const xDef = METRIC_CATALOGUE.find((m) => m.key === xKey);
  const yDef = METRIC_CATALOGUE.find((m) => m.key === yKey);

  const cutoff = getWindowCutoffDay(matrix, window);
  const byDay = new Map<string, DailyMetricRow>();
  for (const row of matrix) {
    byDay.set(row.day, row);
  }

  const points: ScatterPoint[] = [];

  for (const rowX of matrix) {
    if (cutoff && rowX.day < cutoff) continue;
    const xVal = rowX.values[xKey];
    if (typeof xVal !== 'number' || !Number.isFinite(xVal)) continue;

    const targetDayY = lag === 0 ? rowX.day : addCalendarDays(rowX.day, lag);
    const rowY = byDay.get(targetDayY);
    if (!rowY) continue;

    const yVal = rowY.values[yKey];
    if (typeof yVal !== 'number' || !Number.isFinite(yVal)) continue;

    points.push({
      dayX: rowX.day,
      dayY: targetDayY,
      x: Math.round(xVal * 1000) / 1000,
      y: Math.round(yVal * 1000) / 1000,
    });
  }

  const n = points.length;
  if (n < 2) {
    return {
      xKey,
      yKey,
      xLabel: xDef?.label ?? xKey,
      yLabel: yDef?.label ?? yKey,
      xUnit: xDef?.unit ?? '',
      yUnit: yDef?.unit ?? '',
      window,
      lag,
      n,
      r: null,
      rSquared: null,
      slope: null,
      intercept: null,
      pValueApprox: null,
      points,
    };
  }

  let sumX = 0;
  let sumY = 0;
  for (const pt of points) {
    sumX += pt.x;
    sumY += pt.y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const pt of points) {
    const dx = pt.x - meanX;
    const dy = pt.y - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }

  if (sxx <= 1e-12 || syy <= 1e-12) {
    return {
      xKey,
      yKey,
      xLabel: xDef?.label ?? xKey,
      yLabel: yDef?.label ?? yKey,
      xUnit: xDef?.unit ?? '',
      yUnit: yDef?.unit ?? '',
      window,
      lag,
      n,
      r: null,
      rSquared: null,
      slope: null,
      intercept: null,
      pValueApprox: null,
      points,
    };
  }

  const r = sxy / Math.sqrt(sxx * syy);
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  const rSquared = r * r;

  return {
    xKey,
    yKey,
    xLabel: xDef?.label ?? xKey,
    yLabel: yDef?.label ?? yKey,
    xUnit: xDef?.unit ?? '',
    yUnit: yDef?.unit ?? '',
    window,
    lag,
    n,
    r: Math.round(r * 1000) / 1000,
    rSquared: Math.round(rSquared * 1000) / 1000,
    slope: Math.round(slope * 10000) / 10000,
    intercept: Math.round(intercept * 1000) / 1000,
    pValueApprox: approximateTwoTailedPValue(r, n),
    points,
  };
}

export async function getCorrelationsData(options: {
  x?: string;
  y?: string;
  window?: CorrelationWindow;
  lag?: CorrelationLag;
  includePresets?: boolean;
}) {
  const matrix = await buildDailyTelemetryMatrix();
  const window = options.window ?? '90d';
  const lag = options.lag ?? 0;
  const xKey = options.x ?? 'bedtime_serum_ng_ml';
  const yKey = options.y ?? 'sleep.deep_sleep_duration';

  const primary = computeCorrelationFromMatrix(matrix, xKey, yKey, window, lag);

  const presets = options.includePresets
    ? PRESET_CORRELATION_PAIRS.map((preset) => ({
        preset,
        result: computeCorrelationFromMatrix(
          matrix,
          preset.x,
          preset.y,
          window,
          preset.lag,
        ),
      }))
    : undefined;

  return {
    catalogue: METRIC_CATALOGUE,
    primary,
    presets,
    totalDaysTracked: matrix.length,
  };
}

export async function getRecentBriefings(limit = 20) {
  const db = getDb();
  const { aiBriefings } = await import('@/db/schema');
  return db
    .select()
    .from(aiBriefings)
    .orderBy(desc(aiBriefings.createdAt))
    .limit(limit);
}
