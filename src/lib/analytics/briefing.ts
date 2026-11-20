import { GoogleGenAI } from '@google/genai';
import { getDb } from '@/db';
import { aiBriefings } from '@/db/schema';
import { getEnv } from '@/lib/env';
import {
  buildDailyTelemetryMatrix,
  computeAnomalyStatusFromMatrix,
  computeCorrelationFromMatrix,
  METRIC_CATALOGUE,
  PRESET_CORRELATION_PAIRS,
  type DailyMetricRow,
} from './stats';

const SYSTEM_PROMPT = `You are the HenryBioOS Chief Physiological Telemetry Analyst.
Produce an objective, clinical, non-sycophantic diagnostic briefing in standard UK English (use "optimise", "normalised", "analysing", "behaviour", "programme", "kilometres").
Never flatter the user, never use filler phrases or motivational clichés, and never fabricate metrics not present in the provided JSON snapshot.
If a metric domain has insufficient observations (n < 3 or null), explicitly state the data gap instead of guessing.

Structure the Markdown response with these exact sections:
## 1. Executive Physiological Status & Strain Risk
- Summarise the 30-day rolling Z-score anomaly status, autonomic readiness trajectory, and cardiovascular indicators.
## 2. Key Protocol Wins (7-Day vs. 30-Day Baselines)
- Quantify statistically positive shifts with exact deltas and units.
## 3. Primary Degradation Drivers
- Isolate negative shifts across sleep architecture, pharmacokinetic bedtime serum levels, daytime high stress, or unfinished task accumulation.
## 4. Concrete Protocol Adjustments
- Provide 3–5 specific, falsifiable operational adjustments covering medication timing/dosing cutoffs, sleep scheduling, training load, and task management.`;

function computeMeanForKey(rows: DailyMetricRow[], key: string): number | null {
  const vals = rows
    .map((r) => r.values[key])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (vals.length === 0) return null;
  const mean = vals.reduce((acc, v) => acc + v, 0) / vals.length;
  return Math.round(mean * 100) / 100;
}

export async function generateAndSaveDiagnosticBriefing() {
  const env = getEnv();
  const db = getDb();
  const matrix = await buildDailyTelemetryMatrix();

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

  const anomalies = computeAnomalyStatusFromMatrix(matrix);

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
    topCorrelations90d: correlations,
  };

  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const userPrompt = `Analyse the following JSON biometric & cross-domain telemetry snapshot for HenryBioOS (${periodStart} to ${latestDay}) and produce the diagnostic protocol briefing:\n\n${JSON.stringify(metricsSnapshot, null, 2)}`;

  let summaryMarkdown = '';
  const modelsToTry = ['gemini-2.5-pro', 'gemini-2.5-flash'];
  let lastError: unknown = null;

  for (const model of modelsToTry) {
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
        summaryMarkdown = response.text.trim();
        break;
      }
    } catch (err) {
      lastError = err;
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
