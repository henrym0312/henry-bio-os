import { GoogleGenAI } from '@google/genai';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { aiBriefings } from '@/db/schema';
import { getEnv } from '@/lib/env';
import { getInsightsData } from './insights';
import {
  buildDailyTelemetryMatrix,
  computeAnomalyStatusFromMatrix,
  computeCorrelationFromMatrix,
  METRIC_CATALOGUE,
  PRESET_CORRELATION_PAIRS,
  type DailyMetricRow,
} from './stats';

const SYSTEM_PROMPT = `You are the HenryBioOS Chief Physiological & Behavioural Analyst.
Produce an objective, clinical, non-sycophantic weekly diagnostic briefing in standard UK English (use "optimise", "normalised", "analysing", "behaviour", "programme", "kilometres").
Strict formatting rules:
- Use ZERO emojis anywhere in the response.
- Use ZERO em dashes or en dashes anywhere in the response; use standard ASCII hyphens (-) or colons instead.
- Never flatter the user, never use filler phrases or motivational cliches, and never fabricate metrics not present in the provided JSON snapshot.
- Write all numbers, deltas, Z-scores, and correlation coefficients in plain text (for example: "14.63 br/min", "Delta = -0.17", "r = -0.536", "p < 0.000001"); never use LaTeX delimiters ($) or commands like \\text{...}.
- Explicitly separate controllable behavioural levers (such as late-night comms, screen exposure, supplement consistency, exercise/daylight, caffeine/medication timing) from seasonal environmental/weather context (photoperiod hours, UV max, ambient temperature, European AQI).
- If a metric domain has insufficient observations (n < 3 or null), briefly state the gap instead of guessing.

Structure the Markdown response with these exact 4 sections:
## 1. Weekly Telemetry Delta (7d vs 30d)
- Summarise key 7-day vs 30-day biometric shifts (HRV, lowest nocturnal HR, deep/total sleep, readiness, steps), cross-domain behavioural deltas (comms, screen time, supplements, Apple Health), active Z-score strain risk, and briefly note seasonal weather context separately.
## 2. 3 Verified Wins
- List 3 concrete positive telemetry or behavioural adherence signals supported by exact numbers from the 7d vs 30d deltas, Best-vs-Worst decile contrasts, or favourable lagged drivers.
## 3. 2 Primary Bottlenecks (Controllable Levers)
- Isolate the 2 highest-impact controllable behavioural drains or breached personal threshold cliffs (never blame seasonal photoperiod/temperature as a bottleneck), citing exact cutoffs, median deltas, and sample sizes.
## 4. 1 Concrete 14-Day Experiment for Next Week
- Propose 1 falsifiable, operational 14-day N-of-1 protocol targeting one behavioural feature key, specifying target outcomes, numeric threshold rule, and expected biometric effect (or review progress if an active N-of-1 trial is already running).`;

function computeMeanForKey(rows: DailyMetricRow[], key: string): number | null {
  const vals = rows
    .map((r) => r.values[key])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (vals.length === 0) return null;
  const mean = vals.reduce((acc, v) => acc + v, 0) / vals.length;
  return Math.round(mean * 100) / 100;
}

interface LifeMatrixWindowSummary {
  metric: string;
  scope: 'biometric' | 'behavioural' | 'environmental';
  mean7d: number | null;
  n7d: number;
  mean30d: number | null;
  n30d: number;
  delta7dVs30d: number | null;
}

function round2(n: unknown): number | null {
  const num = Number(n);
  if (n === null || n === undefined || !Number.isFinite(num)) return null;
  return Math.round(num * 100) / 100;
}

async function queryLifeMatrix7dVs30d(
  latestDay: string,
  periodStart: string,
  baselineStart: string,
): Promise<LifeMatrixWindowSummary[]> {
  const db = getDb();
  const res = await db.execute(sql`
    SELECT
      ROUND(AVG(hrv_avg_ms) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::numeric, 2) AS hrv_7d,
      COUNT(hrv_avg_ms) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::int AS hrv_n7,
      ROUND(AVG(hrv_avg_ms) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::numeric, 2) AS hrv_30d,
      COUNT(hrv_avg_ms) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::int AS hrv_n30,

      ROUND(AVG(lowest_hr_bpm) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::numeric, 2) AS lhr_7d,
      COUNT(lowest_hr_bpm) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::int AS lhr_n7,
      ROUND(AVG(lowest_hr_bpm) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::numeric, 2) AS lhr_30d,
      COUNT(lowest_hr_bpm) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::int AS lhr_n30,

      ROUND(AVG(deep_sleep_min) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::numeric, 2) AS deep_7d,
      COUNT(deep_sleep_min) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::int AS deep_n7,
      ROUND(AVG(deep_sleep_min) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::numeric, 2) AS deep_30d,
      COUNT(deep_sleep_min) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::int AS deep_n30,

      ROUND(AVG(imessages_total) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::numeric, 2) AS imsg_7d,
      COUNT(imessages_total) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::int AS imsg_n7,
      ROUND(AVG(imessages_total) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::numeric, 2) AS imsg_30d,
      COUNT(imessages_total) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::int AS imsg_n30,

      ROUND(AVG(late_comms_count) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::numeric, 2) AS late_comms_7d,
      COUNT(late_comms_count) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::int AS late_comms_n7,
      ROUND(AVG(late_comms_count) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::numeric, 2) AS late_comms_30d,
      COUNT(late_comms_count) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::int AS late_comms_n30,

      ROUND(AVG(emails_total) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::numeric, 2) AS emails_7d,
      COUNT(emails_total) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::int AS emails_n7,
      ROUND(AVG(emails_total) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::numeric, 2) AS emails_30d,
      COUNT(emails_total) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::int AS emails_n30,

      ROUND(AVG(combined_screen_mins) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::numeric, 2) AS screen_7d,
      COUNT(combined_screen_mins) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::int AS screen_n7,
      ROUND(AVG(combined_screen_mins) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::numeric, 2) AS screen_30d,
      COUNT(combined_screen_mins) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::int AS screen_n30,

      ROUND(AVG(late_night_screen_mins) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::numeric, 2) AS late_screen_7d,
      COUNT(late_night_screen_mins) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::int AS late_screen_n7,
      ROUND(AVG(late_night_screen_mins) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::numeric, 2) AS late_screen_30d,
      COUNT(late_night_screen_mins) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::int AS late_screen_n30,

      ROUND(AVG(deep_work_mins) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::numeric, 2) AS deep_work_7d,
      COUNT(deep_work_mins) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::int AS deep_work_n7,
      ROUND(AVG(deep_work_mins) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::numeric, 2) AS deep_work_30d,
      COUNT(deep_work_mins) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::int AS deep_work_n30,

      ROUND(AVG(am_pills_taken) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::numeric, 2) AS am_supp_7d,
      COUNT(am_pills_taken) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::int AS am_supp_n7,
      ROUND(AVG(am_pills_taken) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::numeric, 2) AS am_supp_30d,
      COUNT(am_pills_taken) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::int AS am_supp_n30,

      ROUND(AVG(headphone_audio_avg_db) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::numeric, 2) AS hp_db_7d,
      COUNT(headphone_audio_avg_db) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::int AS hp_db_n7,
      ROUND(AVG(headphone_audio_avg_db) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::numeric, 2) AS hp_db_30d,
      COUNT(headphone_audio_avg_db) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::int AS hp_db_n30,

      ROUND(AVG(temp_mean_c) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::numeric, 2) AS temp_7d,
      COUNT(temp_mean_c) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::int AS temp_n7,
      ROUND(AVG(temp_mean_c) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::numeric, 2) AS temp_30d,
      COUNT(temp_mean_c) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::int AS temp_n30,

      ROUND(AVG(photoperiod_hours) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::numeric, 2) AS photo_7d,
      COUNT(photoperiod_hours) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::int AS photo_n7,
      ROUND(AVG(photoperiod_hours) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::numeric, 2) AS photo_30d,
      COUNT(photoperiod_hours) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::int AS photo_n30,

      ROUND(AVG(european_aqi) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::numeric, 2) AS aqi_7d,
      COUNT(european_aqi) FILTER (WHERE day >= ${periodStart} AND day <= ${latestDay})::int AS aqi_n7,
      ROUND(AVG(european_aqi) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::numeric, 2) AS aqi_30d,
      COUNT(european_aqi) FILTER (WHERE day >= ${baselineStart} AND day <= ${latestDay})::int AS aqi_n30
    FROM daily_life_matrix
  `);

  const row = (res.rows[0] ?? {}) as Record<string, unknown>;
  const specs: Array<{
    metric: string;
    scope: LifeMatrixWindowSummary['scope'];
    prefix: string;
  }> = [
    { metric: 'hrv_avg_ms', scope: 'biometric', prefix: 'hrv' },
    { metric: 'lowest_hr_bpm', scope: 'biometric', prefix: 'lhr' },
    { metric: 'deep_sleep_min', scope: 'biometric', prefix: 'deep' },
    { metric: 'imessages_total', scope: 'behavioural', prefix: 'imsg' },
    { metric: 'late_comms_count', scope: 'behavioural', prefix: 'late_comms' },
    { metric: 'emails_total', scope: 'behavioural', prefix: 'emails' },
    { metric: 'combined_screen_mins', scope: 'behavioural', prefix: 'screen' },
    { metric: 'late_night_screen_mins', scope: 'behavioural', prefix: 'late_screen' },
    { metric: 'deep_work_mins', scope: 'behavioural', prefix: 'deep_work' },
    { metric: 'am_pills_taken', scope: 'behavioural', prefix: 'am_supp' },
    { metric: 'headphone_audio_avg_db', scope: 'behavioural', prefix: 'hp_db' },
    { metric: 'temp_mean_c', scope: 'environmental', prefix: 'temp' },
    { metric: 'photoperiod_hours', scope: 'environmental', prefix: 'photo' },
    { metric: 'european_aqi', scope: 'environmental', prefix: 'aqi' },
  ];

  return specs.map((s) => {
    const mean7d = round2(row[`${s.prefix}_7d`]);
    const mean30d = round2(row[`${s.prefix}_30d`]);
    const n7d = Number(row[`${s.prefix}_n7`] ?? 0) || 0;
    const n30d = Number(row[`${s.prefix}_n30`] ?? 0) || 0;
    const delta =
      mean7d !== null && mean30d !== null
        ? Math.round((mean7d - mean30d) * 100) / 100
        : null;
    return {
      metric: s.metric,
      scope: s.scope,
      mean7d,
      n7d,
      mean30d,
      n30d,
      delta7dVs30d: delta,
    };
  });
}

function sanitiseBriefingMarkdown(raw: string): string {
  return raw
    .replace(/\u2014|\u2013/g, '-')
    .replace(/\$/g, '')
    .trim();
}

export async function generateAndSaveDiagnosticBriefing() {
  const env = getEnv();
  const db = getDb();
  const [matrix, insightsData] = await Promise.all([
    buildDailyTelemetryMatrix(),
    getInsightsData(),
  ]);

  const latestDay =
    matrix.length > 0
      ? matrix[matrix.length - 1].day
      : new Date().toISOString().slice(0, 10);

  const sevenDaysAgoDt = new Date(`${latestDay}T00:00:00Z`);
  sevenDaysAgoDt.setUTCDate(sevenDaysAgoDt.getUTCDate() - 6);
  const periodStart = sevenDaysAgoDt.toISOString().slice(0, 10);

  const thirtyDaysAgoDt = new Date(`${latestDay}T00:00:00Z`);
  thirtyDaysAgoDt.setUTCDate(thirtyDaysAgoDt.getUTCDate() - 29);
  const baselineStart = thirtyDaysAgoDt.toISOString().slice(0, 10);

  const recent7d = matrix.filter((r) => r.day >= periodStart && r.day <= latestDay);
  const baseline30d = matrix.filter((r) => r.day >= baselineStart && r.day <= latestDay);

  const trackedKeys = [
    'daily_readiness.score',
    'daily_readiness.temperature_deviation',
    'sleep.score',
    'sleep.total_sleep_duration',
    'sleep.deep_sleep_duration',
    'sleep.rem_sleep_duration',
    'sleep.latency',
    'sleep.efficiency',
    'sleep.average_hrv',
    'sleep.lowest_heart_rate',
    'sleep.average_breath',
    'daily_stress.stress_high',
    'daily_stress.recovery_high',
    'daily_resilience.level',
    'daily_cardiovascular_age.pulse_wave_velocity',
    'daily_activity.steps',
    'daily_activity.active_calories',
    'workout.calories',
    'bedtime_serum_ng_ml',
    'hours_since_last_dose',
    'total_daily_med_mg',
    'daily_task_metrics.remainingCount',
    'daily_task_metrics.completionPct',
  ];

  const comparison = trackedKeys.map((key) => {
    const def = METRIC_CATALOGUE.find((m) => m.key === key);
    const mean7d = computeMeanForKey(recent7d, key);
    const mean30d = computeMeanForKey(baseline30d, key);
    const delta =
      mean7d !== null && mean30d !== null
        ? Math.round((mean7d - mean30d) * 100) / 100
        : null;
    return {
      key,
      label: def?.label ?? key,
      unit: def?.unit ?? '',
      mean7d,
      mean30d,
      delta7dVs30d: delta,
    };
  });

  const [anomalies, lifeMatrixDeltas] = await Promise.all([
    Promise.resolve(computeAnomalyStatusFromMatrix(matrix)),
    queryLifeMatrix7dVs30d(latestDay, periodStart, baselineStart),
  ]);

  const correlations = PRESET_CORRELATION_PAIRS.map((preset) => {
    const res = computeCorrelationFromMatrix(
      matrix,
      preset.x,
      preset.y,
      '90d',
      preset.lag,
    );
    return {
      label: preset.label,
      lagDays: preset.lag,
      n: res.n,
      r: res.r,
      rSquared: res.rSquared,
      slope: res.slope,
    };
  }).filter((c) => c.n >= 3);

  const causalDigest = {
    latestRun: insightsData.latestRun
      ? {
          id: insightsData.latestRun.id,
          ranAt: insightsData.latestRun.ranAt,
          windowDays: insightsData.latestRun.windowDays,
          matrixDays: insightsData.latestRun.matrixDays,
          summaryCounts: insightsData.latestRun.summaryJson.counts ?? null,
        }
      : null,
    domainCoverage: insightsData.coverage.domains,
    topBehaviouralPositiveDrivers: insightsData.behavioural.positiveDrivers
      .slice(0, 8)
      .map((d) => ({
        feature: d.featureLabel,
        featureKey: d.featureKey,
        outcome: d.outcomeLabel,
        lagDays: d.lagDays,
        spearmanR: d.spearmanR,
        pValue: d.pValue,
        fdrQValue: d.fdrQValue,
        marginalEffect: d.marginalEffect,
        sampleN: d.sampleN,
      })),
    topBehaviouralDrains: insightsData.behavioural.negativeDrivers
      .slice(0, 8)
      .map((d) => ({
        feature: d.featureLabel,
        featureKey: d.featureKey,
        outcome: d.outcomeLabel,
        lagDays: d.lagDays,
        spearmanR: d.spearmanR,
        pValue: d.pValue,
        fdrQValue: d.fdrQValue,
        marginalEffect: d.marginalEffect,
        sampleN: d.sampleN,
      })),
    topBehaviouralCliffs: insightsData.behavioural.thresholdCliffs
      .slice(0, 8)
      .map((c) => ({
        feature: c.featureLabel,
        outcome: c.outcomeLabel,
        unit: c.outcomeUnit,
        rule: c.thresholdRule,
        lowMedian: c.lowMedian,
        highMedian: c.highMedian,
        medianDelta: c.medianDelta,
        pValue: c.pValue,
        splitN: `${c.lowN} vs ${c.highN}`,
      })),
    bestVsWorstContrasts: {
      behavioural: insightsData.behavioural.groupContrasts.slice(0, 8).map((g) => ({
        feature: g.featureLabel,
        best10Mean: g.best10Mean,
        worst10Mean: g.worst10Mean,
        effectSizeD: g.effectSizeD,
        sampleN: g.sampleN,
      })),
      environmental: insightsData.environmental.groupContrasts.slice(0, 5).map((g) => ({
        feature: g.featureLabel,
        best10Mean: g.best10Mean,
        worst10Mean: g.worst10Mean,
        effectSizeD: g.effectSizeD,
        sampleN: g.sampleN,
      })),
    },
    activeAndRecentExperiments: insightsData.experiments.slice(0, 5).map((e) => ({
      name: e.name,
      featureKey: e.featureKey,
      targetOutcomes: e.targetOutcomes,
      startDay: e.startDay,
      endDay: e.endDay,
      status: e.status,
      verdict: e.verdict,
    })),
  };

  const metricsSnapshot = {
    periodStart,
    periodEnd: latestDay,
    daysIn7dWindow: recent7d.length,
    daysIn30dBaseline: baseline30d.length,
    totalDaysInWarehouse: matrix.length,
    anomalyReport: {
      targetDay: anomalies.targetDay,
      strainAlert: anomalies.strainAlert,
      adverseCount: anomalies.adverseCount,
      metrics: anomalies.metrics,
    },
    baselineComparison: comparison,
    lifeMatrix7dVs30d: lifeMatrixDeltas,
    topCorrelations90d: correlations,
    causalDigest,
  };

  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const userPrompt = `Analyse the following JSON biometric and cross-domain causal telemetry digest for HenryBioOS (${periodStart} to ${latestDay}) and produce the diagnostic weekly briefing:\n\n${JSON.stringify(metricsSnapshot, null, 2)}`;

  let summaryMarkdown = '';
  const modelsToTry = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
  let lastError: unknown = null;

  for (const model of modelsToTry) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: userPrompt,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            temperature: 0.2,
          },
        });
        if (response.text && response.text.trim().length > 0) {
          summaryMarkdown = sanitiseBriefingMarkdown(response.text);
          break;
        }
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        const transient =
          msg.includes('503') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('429') ||
          msg.includes('overloaded');
        if (!transient || attempt === 3) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }
    }
    if (summaryMarkdown) {
      break;
    }
  }

  if (!summaryMarkdown) {
    const errMsg =
      lastError instanceof Error ? lastError.message : 'Gemini API returned an empty response';
    throw new Error(`Failed to generate diagnostic briefing: ${errMsg}`);
  }

  const [saved] = await db
    .insert(aiBriefings)
    .values({
      periodStart,
      periodEnd: latestDay,
      summaryMarkdown,
      metricsSnapshot,
    })
    .returning();

  return saved;
}
