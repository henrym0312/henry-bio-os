import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  lifeAnalyticsRuns,
  lifeExperiments,
  lifeGroupContrasts,
  lifeInsightsDrivers,
  lifeSubjectiveDaily,
  lifeThresholdCliffs,
} from '@/db/schema';
import { toLondonDay } from '@/lib/life/helpers';
import { isoDaySchema } from '@/lib/life/ingest';
import { getCaffeineSummaryForToday } from '@/lib/life/quick-log';
import {
  buildDriverTakeaway,
  classifyFeatureScope,
  formatFeatureValue,
  formatMetricNumber,
  formatMinutesHm,
  getBeneficialDirection,
  getConfidenceLabel,
  getEffectSizeLabel,
  getFeatureFamily,
  getFeatureLabel,
  getLagLabel,
  getOutcomeLabel,
  getOutcomeUnit,
  getSampleStageLabel,
  getStrengthBand,
  isOutcomeHigherBetter,
  isPositiveHabitEligible,
  translateCliffFields,
  type AnalyticsCliffItem,
  type AnalyticsContrastItem,
  type AnalyticsDriverItem,
  type DomainCoverageItem,
  type InsightsPayload,
  type RecentShiftItem,
  type TodayScoreboard,
} from './insights-labels';

export * from './insights-labels';

function classifyDomainStatus(days: number): DomainCoverageItem['status'] {
  if (days >= 30) return 'active';
  if (days > 0) return 'warming';
  return 'pending';
}

function toNumberOrNull(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

function toBooleanFlagOrNull(val: unknown): boolean | null {
  if (val === null || val === undefined) return null;
  const num = Number(val);
  if (!Number.isFinite(num)) return null;
  return num >= 1;
}

function formatShiftMetricValue(
  key: string,
  val: number | null,
  unit: string,
): string {
  if (val === null) return '-';
  if (key === 'combined_screen_mins') return formatMinutesHm(val);
  if (unit === 'GBP') return `£${val.toFixed(2)}`;
  if (unit === '/10') return `${val.toFixed(1)}/10`;
  const rounded = formatMetricNumber(val, 1);
  return unit ? `${rounded} ${unit}` : rounded;
}

function formatShiftDeltaValue(
  key: string,
  delta: number | null,
  unit: string,
): string | null {
  if (delta === null) return null;
  const sign = delta > 0 ? '+' : delta < 0 ? '-' : '';
  const abs = Math.abs(delta);
  if (key === 'combined_screen_mins') return `${sign}${formatMinutesHm(abs)}`;
  if (unit === 'GBP') return `${sign}£${abs.toFixed(2)}`;
  if (unit === '/10') return `${sign}${abs.toFixed(1)}/10`;
  const rounded = formatMetricNumber(abs, 1);
  return unit ? `${sign}${rounded} ${unit}` : `${sign}${rounded}`;
}

export async function getInsightsData(): Promise<InsightsPayload> {
  const db = getDb();
  const now = new Date();
  const todayDay = toLondonDay(now);

  const [
    latestRuns,
    experimentRows,
    coverageRes,
    todayMatrixRes,
    todayCheckInRows,
    caffeineSummary,
    shiftRes,
  ] = await Promise.all([
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
        COUNT(headphone_audio_avg_db)::int AS headphone_audio_days,
        COUNT(caffeine_total_mg)::int AS caffeine_days,
        COUNT(energy)::int AS subjective_days,
        COUNT(spend_total_gbp)::int AS spending_days,
        COUNT(COALESCE(hours_at_home, tv_active_mins, audio_playback_mins))::int AS presence_media_days
      FROM daily_life_matrix
    `),
    db.execute(sql`
      SELECT
        late_comms_count,
        bedtime_caffeine_mg,
        spend_total_gbp,
        spend_social_pubs_gbp,
        am_pills_taken,
        pm_pills_taken
      FROM daily_life_matrix
      WHERE day = ${todayDay}
      LIMIT 1
    `),
    db
      .select({ day: lifeSubjectiveDaily.day })
      .from(lifeSubjectiveDaily)
      .where(eq(lifeSubjectiveDaily.day, todayDay))
      .limit(1),
    getCaffeineSummaryForToday(now),
    db.execute(sql`
      SELECT
        ROUND(AVG(hrv_avg_ms) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 13) AND ${todayDay}::date)::numeric, 1) AS hrv_now,
        COUNT(hrv_avg_ms) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 13) AND ${todayDay}::date)::int AS hrv_n_now,
        ROUND(AVG(hrv_avg_ms) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 43) AND (${todayDay}::date - 14))::numeric, 1) AS hrv_prev,
        COUNT(hrv_avg_ms) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 43) AND (${todayDay}::date - 14))::int AS hrv_n_prev,

        ROUND(AVG(lowest_hr_bpm) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 13) AND ${todayDay}::date)::numeric, 1) AS lhr_now,
        COUNT(lowest_hr_bpm) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 13) AND ${todayDay}::date)::int AS lhr_n_now,
        ROUND(AVG(lowest_hr_bpm) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 43) AND (${todayDay}::date - 14))::numeric, 1) AS lhr_prev,
        COUNT(lowest_hr_bpm) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 43) AND (${todayDay}::date - 14))::int AS lhr_n_prev,

        ROUND(AVG(readiness_score) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 13) AND ${todayDay}::date)::numeric, 1) AS rdy_now,
        COUNT(readiness_score) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 13) AND ${todayDay}::date)::int AS rdy_n_now,
        ROUND(AVG(readiness_score) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 43) AND (${todayDay}::date - 14))::numeric, 1) AS rdy_prev,
        COUNT(readiness_score) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 43) AND (${todayDay}::date - 14))::int AS rdy_n_prev,

        ROUND(AVG(mental_focus) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 13) AND ${todayDay}::date)::numeric, 1) AS focus_now,
        COUNT(mental_focus) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 13) AND ${todayDay}::date)::int AS focus_n_now,
        ROUND(AVG(mental_focus) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 43) AND (${todayDay}::date - 14))::numeric, 1) AS focus_prev,
        COUNT(mental_focus) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 43) AND (${todayDay}::date - 14))::int AS focus_n_prev,

        ROUND(AVG(late_comms_count) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 13) AND ${todayDay}::date)::numeric, 1) AS late_comms_now,
        COUNT(late_comms_count) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 13) AND ${todayDay}::date)::int AS late_comms_n_now,
        ROUND(AVG(late_comms_count) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 43) AND (${todayDay}::date - 14))::numeric, 1) AS late_comms_prev,
        COUNT(late_comms_count) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 43) AND (${todayDay}::date - 14))::int AS late_comms_n_prev,

        ROUND(AVG(spend_total_gbp) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 13) AND ${todayDay}::date)::numeric, 2) AS spend_now,
        COUNT(spend_total_gbp) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 13) AND ${todayDay}::date)::int AS spend_n_now,
        ROUND(AVG(spend_total_gbp) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 43) AND (${todayDay}::date - 14))::numeric, 2) AS spend_prev,
        COUNT(spend_total_gbp) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 43) AND (${todayDay}::date - 14))::int AS spend_n_prev,

        ROUND(AVG(spend_social_pubs_gbp) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 13) AND ${todayDay}::date)::numeric, 2) AS pubs_now,
        COUNT(spend_social_pubs_gbp) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 13) AND ${todayDay}::date)::int AS pubs_n_now,
        ROUND(AVG(spend_social_pubs_gbp) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 43) AND (${todayDay}::date - 14))::numeric, 2) AS pubs_prev,
        COUNT(spend_social_pubs_gbp) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 43) AND (${todayDay}::date - 14))::int AS pubs_n_prev,

        ROUND(AVG(combined_screen_mins) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 13) AND ${todayDay}::date)::numeric, 0) AS screen_now,
        COUNT(combined_screen_mins) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 13) AND ${todayDay}::date)::int AS screen_n_now,
        ROUND(AVG(combined_screen_mins) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 43) AND (${todayDay}::date - 14))::numeric, 0) AS screen_prev,
        COUNT(combined_screen_mins) FILTER (WHERE day::date BETWEEN (${todayDay}::date - 43) AND (${todayDay}::date - 14))::int AS screen_n_prev
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
    .map((r) => {
      const outcomeLabel = getOutcomeLabel(r.outcomeKey, r.outcomeLabel);
      const featureLabel = getFeatureLabel(r.featureKey, r.featureLabel);
      const beneficialDirection = getBeneficialDirection(r.outcomeKey, r.spearmanR);
      const takeaway = buildDriverTakeaway({
        featureKey: r.featureKey,
        featureLabel,
        outcomeKey: r.outcomeKey,
        outcomeLabel,
        spearmanR: r.spearmanR,
        lagDays: r.lagDays,
        sampleN: r.sampleN,
        beneficialDirection,
      });

      return {
        id: r.id,
        runId: r.runId,
        outcomeKey: r.outcomeKey,
        outcomeLabel,
        outcomeUnit: getOutcomeUnit(r.outcomeKey),
        featureKey: r.featureKey,
        featureLabel,
        dedupeGroup: getFeatureFamily(r.featureKey),
        scope: classifyFeatureScope(r.featureKey),
        lagDays: r.lagDays,
        lagLabel: getLagLabel(r.lagDays),
        sampleN: r.sampleN,
        sampleStage: getSampleStageLabel(r.sampleN),
        isEarlySample: r.sampleN < 45,
        isPositiveEligible: isPositiveHabitEligible({
          featureKey: r.featureKey,
          outcomeKey: r.outcomeKey,
          sampleN: r.sampleN,
          marginalEffect: r.marginalEffect,
          beneficialDirection,
        }),
        spearmanR: r.spearmanR,
        pValue: r.pValue,
        fdrQValue: r.fdrQValue,
        shapImportance: r.shapImportance,
        marginalEffect: r.marginalEffect,
        direction: r.direction,
        beneficialDirection,
        strengthLabel: getStrengthBand(r.spearmanR, r.sampleN),
        confidenceLabel: getConfidenceLabel(r.pValue, r.fdrQValue, r.sampleN),
        takeawayText: takeaway.takeawayText,
        observationalCaveat: takeaway.observationalCaveat,
        confidenceTier: r.confidenceTier,
      };
    })
    .sort((a, b) => {
      const pDiff = a.pValue - b.pValue;
      if (Math.abs(pDiff) > 1e-9) return pDiff;
      return Math.abs(b.spearmanR) - Math.abs(a.spearmanR);
    });

  const thresholdCliffs: AnalyticsCliffItem[] = cliffRows
    .map((c) => {
      const outcomeLabel = getOutcomeLabel(c.outcomeKey, c.outcomeLabel);
      const featureLabel = getFeatureLabel(c.featureKey, c.featureLabel);
      const totalSampleN = c.lowN + c.highN;
      const higherBetter = isOutcomeHigherBetter(c.outcomeKey);
      const isBeneficialDelta = higherBetter
        ? c.medianDelta > 0
        : c.medianDelta < 0;
      const translated = translateCliffFields({
        featureKey: c.featureKey,
        featureLabel,
        outcomeKey: c.outcomeKey,
        outcomeLabel,
        thresholdRule: c.thresholdRule,
        lowBucketLabel: c.lowBucketLabel,
        highBucketLabel: c.highBucketLabel,
        lowMedian: c.lowMedian,
        highMedian: c.highMedian,
        medianDelta: c.medianDelta,
        totalSampleN,
        isBeneficialDelta,
      });

      return {
        id: c.id,
        runId: c.runId,
        outcomeKey: c.outcomeKey,
        outcomeLabel,
        outcomeUnit: getOutcomeUnit(c.outcomeKey),
        featureKey: c.featureKey,
        featureLabel,
        scope: classifyFeatureScope(c.featureKey),
        thresholdRule: c.thresholdRule,
        timingLabel: translated.timingLabel,
        comparisonLabel: translated.comparisonLabel,
        plainVerdict: translated.plainVerdict,
        observationalCaveat: translated.observationalCaveat,
        sampleStage: getSampleStageLabel(totalSampleN),
        isEarlySample: totalSampleN < 45,
        confidenceLabel: getConfidenceLabel(c.pValue, null, totalSampleN),
        isBeneficialDelta,
        lowBucketLabel: translated.lowBucketLabel,
        highBucketLabel: translated.highBucketLabel,
        lowN: c.lowN,
        highN: c.highN,
        lowMedian: c.lowMedian,
        highMedian: c.highMedian,
        medianDelta: c.medianDelta,
        pValue: c.pValue,
      };
    })
    .sort((a, b) => a.pValue - b.pValue || Math.abs(b.medianDelta) - Math.abs(a.medianDelta));

  const groupContrasts: AnalyticsContrastItem[] = contrastRows
    .map((g) => ({
      id: g.id,
      runId: g.runId,
      cohortLabel: g.cohortLabel,
      featureKey: g.featureKey,
      featureLabel: getFeatureLabel(g.featureKey, g.featureLabel),
      scope: classifyFeatureScope(g.featureKey),
      best10Mean: g.best10Mean,
      worst10Mean: g.worst10Mean,
      best10Formatted: formatFeatureValue(g.featureKey, g.best10Mean),
      worst10Formatted: formatFeatureValue(g.featureKey, g.worst10Mean),
      effectSizeD: g.effectSizeD,
      effectSizeLabel: getEffectSizeLabel(g.effectSizeD),
      sampleN: g.sampleN,
      sampleStage: getSampleStageLabel(g.sampleN),
      isEarlySample: g.sampleN < 45,
    }))
    .sort((a, b) => Math.abs(b.effectSizeD) - Math.abs(a.effectSizeD));

  const covRow = (coverageRes.rows[0] ?? {}) as Record<string, unknown>;
  const num = (key: string) => Number(covRow[key] ?? 0) || 0;

  const domains: DomainCoverageItem[] = [
    { key: 'oura', label: 'Oura Biometrics', days: num('oura_days') },
    { key: 'weather', label: 'Weather & AQI', days: num('weather_days') },
    { key: 'comms', label: 'Comms Bandwidth', days: num('comms_days') },
    { key: 'supplements', label: 'Supplements', days: num('supplements_days') },
    { key: 'spending', label: 'Spending', days: num('spending_days') },
    { key: 'screentime', label: 'Screen Time', days: num('screentime_days') },
    { key: 'headphone_audio', label: 'Headphone Audio', days: num('headphone_audio_days') },
    { key: 'meds', label: 'ADHD Meds', days: num('meds_days') },
    { key: 'tasks', label: 'Reminders Tasks', days: num('tasks_days') },
    { key: 'presence_media', label: 'Presence & Media', days: num('presence_media_days') },
    { key: 'caffeine', label: 'Caffeine Logs', days: num('caffeine_days') },
    { key: 'subjective', label: 'Subjective State', days: num('subjective_days') },
  ].map((d) => ({ ...d, status: classifyDomainStatus(d.days) }));

  const todayRow = (todayMatrixRes.rows[0] ?? {}) as Record<string, unknown>;
  const todayScoreboard: TodayScoreboard = {
    day: todayDay,
    lateCommsCount: toNumberOrNull(todayRow.late_comms_count),
    bedtimeCaffeineMg: caffeineSummary.bedtimeEstimatedMg,
    todayCaffeineMg: caffeineSummary.todayTotalMg,
    spendTotalGbp: toNumberOrNull(todayRow.spend_total_gbp),
    spendSocialPubsGbp: toNumberOrNull(todayRow.spend_social_pubs_gbp),
    amPillsTaken: toBooleanFlagOrNull(todayRow.am_pills_taken),
    pmPillsTaken: toBooleanFlagOrNull(todayRow.pm_pills_taken),
    checkInLogged: todayCheckInRows.length > 0,
  };

  const sRow = (shiftRes.rows[0] ?? {}) as Record<string, unknown>;
  const shiftSpecs: Array<{
    key: string;
    prefix: string;
    label: string;
    unit: string;
    higherIsBetter: boolean;
  }> = [
    { key: 'hrv_avg_ms', prefix: 'hrv', label: 'HRV (Recovery)', unit: 'ms', higherIsBetter: true },
    { key: 'lowest_hr_bpm', prefix: 'lhr', label: 'Resting Heart Rate', unit: 'bpm', higherIsBetter: false },
    { key: 'readiness_score', prefix: 'rdy', label: 'Readiness Score', unit: 'pts', higherIsBetter: true },
    { key: 'mental_focus', prefix: 'focus', label: 'Mental Focus', unit: '/10', higherIsBetter: true },
    { key: 'late_comms_count', prefix: 'late_comms', label: 'Messages After 9pm', unit: 'msgs', higherIsBetter: false },
    { key: 'spend_total_gbp', prefix: 'spend', label: 'Discretionary Spend', unit: 'GBP', higherIsBetter: false },
    { key: 'spend_social_pubs_gbp', prefix: 'pubs', label: 'Pub & Social Spend', unit: 'GBP', higherIsBetter: false },
    { key: 'combined_screen_mins', prefix: 'screen', label: 'Total Screen Time', unit: 'mins', higherIsBetter: false },
  ];

  const recentShift: RecentShiftItem[] = shiftSpecs.map((spec) => {
    const meanNow = toNumberOrNull(sRow[`${spec.prefix}_now`]);
    const meanBefore = toNumberOrNull(sRow[`${spec.prefix}_prev`]);
    const nNow = Number(sRow[`${spec.prefix}_n_now`] ?? 0) || 0;
    const nBefore = Number(sRow[`${spec.prefix}_n_prev`] ?? 0) || 0;
    const delta =
      meanNow !== null && meanBefore !== null
        ? Math.round((meanNow - meanBefore) * 100) / 100
        : null;
    const isFavourable =
      delta === null || Math.abs(delta) < 0.05
        ? null
        : spec.higherIsBetter
          ? delta > 0
          : delta < 0;

    return {
      key: spec.key,
      label: spec.label,
      unit: spec.unit,
      meanBefore,
      nBefore,
      meanNow,
      nNow,
      delta,
      beforeFormatted: formatShiftMetricValue(spec.key, meanBefore, spec.unit),
      nowFormatted: formatShiftMetricValue(spec.key, meanNow, spec.unit),
      deltaFormatted: formatShiftDeltaValue(spec.key, delta, spec.unit),
      isFavourable,
    };
  });

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
    todayScoreboard,
    recentShift,
    drivers,
    thresholdCliffs,
    groupContrasts,
    behavioural: {
      drivers: behaviouralDrivers,
      positiveDrivers: behaviouralDrivers.filter((d) => d.isPositiveEligible),
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
