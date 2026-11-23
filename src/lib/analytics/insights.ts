import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  lifeAnalyticsRuns,
  lifeExperiments,
  lifeGroupContrasts,
  lifeInsightsDrivers,
  lifeThresholdCliffs,
} from '@/db/schema';
import { isoDaySchema } from '@/lib/life/ingest';

export type FeatureScope = 'behavioural' | 'environmental';
export type BeneficialDirection = 'beneficial' | 'detrimental';

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

const LOWER_IS_BETTER_OUTCOMES = new Set<string>([
  'lowest_hr_bpm',
  'sleep_latency_min',
  'tasks_remaining',
  'physical_soreness',
]);

export const OUTCOME_UNITS: Record<string, string> = {
  hrv_avg_ms: 'ms',
  deep_sleep_min: 'min',
  rem_sleep_min: 'min',
  total_sleep_min: 'min',
  sleep_efficiency_pct: '%',
  sleep_latency_min: 'min',
  lowest_hr_bpm: 'bpm',
  readiness_score: 'pts',
  sleep_score: 'pts',
  mental_focus: 'pts',
  energy: 'pts',
  mood_calm: 'pts',
  task_completion_rate: '%',
  tasks_remaining: 'tasks',
};

export function classifyFeatureScope(featureKey: string): FeatureScope {
  return ENVIRONMENTAL_FEATURES.has(featureKey) ? 'environmental' : 'behavioural';
}

export function getBeneficialDirection(
  outcomeKey: string,
  spearmanR: number,
): BeneficialDirection {
  const lowerBetter = LOWER_IS_BETTER_OUTCOMES.has(outcomeKey);
  if (lowerBetter) {
    return spearmanR <= 0 ? 'beneficial' : 'detrimental';
  }
  return spearmanR >= 0 ? 'beneficial' : 'detrimental';
}

export interface AnalyticsDriverItem {
  id: number;
  runId: number;
  outcomeKey: string;
  outcomeLabel: string;
  outcomeUnit: string;
  featureKey: string;
  featureLabel: string;
  scope: FeatureScope;
  lagDays: number;
  sampleN: number;
  spearmanR: number;
  pValue: number;
  fdrQValue: number | null;
  shapImportance: number | null;
  marginalEffect: number | null;
  direction: string;
  beneficialDirection: BeneficialDirection;
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
  effectSizeD: number;
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

function classifyDomainStatus(days: number): DomainCoverageItem['status'] {
  if (days >= 30) return 'active';
  if (days > 0) return 'warming';
  return 'pending';
}

export async function getInsightsData(): Promise<InsightsPayload> {
  const db = getDb();

  const [latestRuns, experimentRows, coverageRes] = await Promise.all([
    db.select().from(lifeAnalyticsRuns).orderBy(desc(lifeAnalyticsRuns.id)).limit(1),
    db
      .select()
      .from(lifeExperiments)
      .orderBy(desc(lifeExperiments.createdAt), desc(lifeExperiments.id)),
    db.execute(sql`
      SELECT
        COUNT(*)::int AS total_days,
        MIN(day) AS min_day,
        MAX(day) AS max_day,
        COUNT(COALESCE(readiness_score, hrv_avg_ms, total_sleep_min))::int AS oura_days,
        COUNT(temp_mean_c)::int AS weather_days,
        COUNT(imessages_total)::int AS comms_days,
        COUNT(am_pills_taken)::int AS supplements_days,
        COUNT(combined_screen_mins)::int AS screentime_days,
        COUNT(adhd_med_doses)::int AS meds_days,
        COUNT(task_completion_rate)::int AS tasks_days,
        COUNT(COALESCE(headphone_audio_avg_db, env_audio_avg_db, time_in_daylight_mins, body_mass_kg, workout_mins))::int AS apple_health_days,
        COUNT(caffeine_total_mg)::int AS caffeine_days,
        COUNT(energy)::int AS subjective_days,
        COUNT(spend_total_gbp)::int AS spending_days,
        COUNT(COALESCE(hours_at_home, tv_active_mins, audio_playback_mins))::int AS presence_media_days
      FROM daily_life_matrix
    `),
  ]);

  const latest = latestRuns[0] ?? null;

  const [driverRows, cliffRows, contrastRows] = latest
    ? await Promise.all([
        db
          .select()
          .from(lifeInsightsDrivers)
          .where(eq(lifeInsightsDrivers.runId, latest.id)),
        db
          .select()
          .from(lifeThresholdCliffs)
          .where(eq(lifeThresholdCliffs.runId, latest.id)),
        db
          .select()
          .from(lifeGroupContrasts)
          .where(eq(lifeGroupContrasts.runId, latest.id)),
      ])
    : [[], [], []];

  const drivers: AnalyticsDriverItem[] = driverRows
    .map((r) => ({
      id: r.id,
      runId: r.runId,
      outcomeKey: r.outcomeKey,
      outcomeLabel: r.outcomeLabel,
      outcomeUnit: OUTCOME_UNITS[r.outcomeKey] ?? '',
      featureKey: r.featureKey,
      featureLabel: r.featureLabel,
      scope: classifyFeatureScope(r.featureKey),
      lagDays: r.lagDays,
      sampleN: r.sampleN,
      spearmanR: r.spearmanR,
      pValue: r.pValue,
      fdrQValue: r.fdrQValue,
      shapImportance: r.shapImportance,
      marginalEffect: r.marginalEffect,
      direction: r.direction,
      beneficialDirection: getBeneficialDirection(r.outcomeKey, r.spearmanR),
      confidenceTier: r.confidenceTier,
    }))
    .sort((a, b) => {
      const pDiff = a.pValue - b.pValue;
      if (Math.abs(pDiff) > 1e-9) return pDiff;
      return Math.abs(b.spearmanR) - Math.abs(a.spearmanR);
    });

  const thresholdCliffs: AnalyticsCliffItem[] = cliffRows
    .map((c) => ({
      id: c.id,
      runId: c.runId,
      outcomeKey: c.outcomeKey,
      outcomeLabel: c.outcomeLabel,
      outcomeUnit: OUTCOME_UNITS[c.outcomeKey] ?? '',
      featureKey: c.featureKey,
      featureLabel: c.featureLabel,
      scope: classifyFeatureScope(c.featureKey),
      thresholdRule: c.thresholdRule,
      lowBucketLabel: c.lowBucketLabel,
      highBucketLabel: c.highBucketLabel,
      lowN: c.lowN,
      highN: c.highN,
      lowMedian: c.lowMedian,
      highMedian: c.highMedian,
      medianDelta: c.medianDelta,
      pValue: c.pValue,
    }))
    .sort((a, b) => a.pValue - b.pValue || Math.abs(b.medianDelta) - Math.abs(a.medianDelta));

  const groupContrasts: AnalyticsContrastItem[] = contrastRows
    .map((g) => ({
      id: g.id,
      runId: g.runId,
      cohortLabel: g.cohortLabel,
      featureKey: g.featureKey,
      featureLabel: g.featureLabel,
      scope: classifyFeatureScope(g.featureKey),
      best10Mean: g.best10Mean,
      worst10Mean: g.worst10Mean,
      effectSizeD: g.effectSizeD,
      sampleN: g.sampleN,
    }))
    .sort((a, b) => Math.abs(b.effectSizeD) - Math.abs(a.effectSizeD));

  const covRow = (coverageRes.rows[0] ?? {}) as Record<string, unknown>;
  const num = (key: string) => Number(covRow[key] ?? 0) || 0;

  const domains: DomainCoverageItem[] = [
    { key: 'oura', label: 'Oura Biometrics', days: num('oura_days') },
    { key: 'weather', label: 'Weather & AQI', days: num('weather_days') },
    { key: 'comms', label: 'Comms Bandwidth', days: num('comms_days') },
    { key: 'supplements', label: 'Supplements', days: num('supplements_days') },
    { key: 'screentime', label: 'Screen Time', days: num('screentime_days') },
    { key: 'apple_health', label: 'Apple Health', days: num('apple_health_days') },
    { key: 'meds', label: 'ADHD Meds', days: num('meds_days') },
    { key: 'tasks', label: 'Reminders Tasks', days: num('tasks_days') },
    { key: 'presence_media', label: 'Presence & Media', days: num('presence_media_days') },
    { key: 'caffeine', label: 'Caffeine Logs', days: num('caffeine_days') },
    { key: 'subjective', label: 'Subjective State', days: num('subjective_days') },
    { key: 'spending', label: 'Spending', days: num('spending_days') },
  ].map((d) => ({ ...d, status: classifyDomainStatus(d.days) }));

  const behaviouralDrivers = drivers.filter((d) => d.scope === 'behavioural');
  const environmentalDrivers = drivers.filter((d) => d.scope === 'environmental');

  return {
    latestRun: latest
      ? {
          id: latest.id,
          ranAt: latest.ranAt.toISOString(),
          windowDays: latest.windowDays,
          matrixDays: latest.matrixDays,
          summaryJson: latest.summaryJson,
        }
      : null,
    coverage: {
      totalDays: num('total_days'),
      minDay: typeof covRow.min_day === 'string' ? covRow.min_day : null,
      maxDay: typeof covRow.max_day === 'string' ? covRow.max_day : null,
      domains,
    },
    drivers,
    thresholdCliffs,
    groupContrasts,
    behavioural: {
      drivers: behaviouralDrivers,
      positiveDrivers: behaviouralDrivers.filter(
        (d) => d.beneficialDirection === 'beneficial',
      ),
      negativeDrivers: behaviouralDrivers.filter(
        (d) => d.beneficialDirection === 'detrimental',
      ),
      thresholdCliffs: thresholdCliffs.filter((c) => c.scope === 'behavioural'),
      groupContrasts: groupContrasts.filter((g) => g.scope === 'behavioural'),
    },
    environmental: {
      drivers: environmentalDrivers,
      thresholdCliffs: thresholdCliffs.filter((c) => c.scope === 'environmental'),
      groupContrasts: groupContrasts.filter((g) => g.scope === 'environmental'),
    },
    experiments: experimentRows.map((e) => ({
      id: e.id,
      name: e.name,
      hypothesis: e.hypothesis,
      featureKey: e.featureKey,
      targetOutcomes: e.targetOutcomes,
      startDay: e.startDay,
      endDay: e.endDay,
      baselineDays: e.baselineDays,
      status: e.status,
      verdict: e.verdict,
      resultsJson: e.resultsJson,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

export const createExperimentSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    hypothesis: z.string().trim().min(4).max(600),
    featureKey: z.string().trim().min(1).max(80),
    targetOutcomes: z.array(z.string().trim().min(1)).min(1),
    startDay: isoDaySchema,
    endDay: isoDaySchema,
    baselineDays: z.number().int().min(7).max(90).default(21),
  })
  .refine((v) => v.endDay >= v.startDay, {
    message: 'endDay must be on or after startDay',
  });

export const updateExperimentSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(['active', 'completed', 'cancelled']),
  verdict: z.string().trim().max(400).nullable().optional(),
});

export async function createExperimentRecord(
  input: z.infer<typeof createExperimentSchema>,
) {
  const db = getDb();
  const [created] = await db
    .insert(lifeExperiments)
    .values({
      name: input.name,
      hypothesis: input.hypothesis,
      featureKey: input.featureKey,
      targetOutcomes: input.targetOutcomes,
      startDay: input.startDay,
      endDay: input.endDay,
      baselineDays: input.baselineDays,
      status: 'active',
    })
    .returning();
  return created;
}

export async function updateExperimentRecord(
  input: z.infer<typeof updateExperimentSchema>,
) {
  const db = getDb();
  const patchValues: { status: string; verdict?: string | null } = {
    status: input.status,
  };
  if (input.verdict !== undefined) {
    patchValues.verdict = input.verdict?.trim() || null;
  }

  const [updated] = await db
    .update(lifeExperiments)
    .set(patchValues)
    .where(eq(lifeExperiments.id, input.id))
    .returning();
  return updated ?? null;
}

export async function listExperiments() {
  const db = getDb();
  return db
    .select()
    .from(lifeExperiments)
    .orderBy(desc(lifeExperiments.createdAt), desc(lifeExperiments.id));
}
