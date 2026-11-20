import { desc, eq, gte } from 'drizzle-orm';
import { getDb } from '@/db';
import { alertCooldowns, ouraRingBatteryLevel, syncLogs } from '@/db/schema';
import {
  buildDailyTelemetryMatrix,
  computeAnomalyStatusFromMatrix,
} from './stats';

export type AlertSeverity = 'warning' | 'critical';

export interface TriggeredAlert {
  id: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  url: string;
}

export interface AlertEvaluationResult {
  evaluatedAt: string;
  targetDay: string;
  alerts: TriggeredAlert[];
  dispatched: number;
  suppressedByCooldown: number;
}

const COOLDOWN_MS = 4 * 60 * 60 * 1000;

export interface NightlySleepPlan {
  wakeTime: string;
  minimumOkayMin: number;
  recommendedSleepMin: number;
  recommendedSleepFormatted: string;
  targetBedtime: string;
  reminderTime: string;
  reasons: string[];
}

function formatMinutesAsHm(totalMin: number): string {
  const clamped = Math.max(0, Math.round(totalMin));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function subtractMinutesFromWakeTime(wakeHm: string, minutesBack: number): string {
  const [wh, wm] = wakeHm.split(':').map((n) => Number.parseInt(n, 10));
  const wakeTotal = (Number.isFinite(wh) ? wh : 7) * 60 + (Number.isFinite(wm) ? wm : 30);
  let targetTotal = (wakeTotal - Math.round(minutesBack)) % (24 * 60);
  if (targetTotal < 0) targetTotal += 24 * 60;
  const hh = String(Math.floor(targetTotal / 60)).padStart(2, '0');
  const mm = String(targetTotal % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function computeNightlySleepPlan(
  matrix: Awaited<ReturnType<typeof buildDailyTelemetryMatrix>>,
  strainAlert: boolean,
  wakeTime = '07:30',
): NightlySleepPlan {
  const minimumOkayMin = 420; // 7h00m realistic minimum to function okay
  const latencyBufferMin = 15;
  let targetSleepMin = 480; // 8h00m baseline target
  const reasons: string[] = [];

  const recent7 = matrix.slice(-7);
  const sleepSamples = recent7
    .map((r) => r.values['sleep.total_sleep_duration'])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

  if (sleepSamples.length > 0) {
    const avg7dSleep =
      sleepSamples.reduce((acc, v) => acc + v, 0) / sleepSamples.length;
    if (avg7dSleep < 450) {
      const deficitBoost = Math.min(30, Math.round((450 - avg7dSleep) * 0.5));
      targetSleepMin += deficitBoost;
      reasons.push(
        `7d sleep avg ${formatMinutesAsHm(avg7dSleep)} (+${deficitBoost}m debt recovery)`,
      );
    }
  }

  const latest = matrix.length > 0 ? matrix[matrix.length - 1] : null;
  const readiness = latest?.values['daily_readiness.score'];
  if (strainAlert) {
    targetSleepMin += 20;
    reasons.push('30d Z-score strain active (+20m)');
  } else if (typeof readiness === 'number' && readiness < 70) {
    targetSleepMin += 15;
    reasons.push(`Readiness ${Math.round(readiness)} pts (+15m)`);
  }

  const bedtimeSerum = latest?.values['bedtime_serum_ng_ml'];
  if (typeof bedtimeSerum === 'number' && bedtimeSerum > 35) {
    targetSleepMin += 15;
    reasons.push(`Bedtime serum ${bedtimeSerum.toFixed(1)} ng/mL (+15m)`);
  }

  const clampedSleepMin = Math.max(minimumOkayMin, Math.min(540, targetSleepMin));
  const totalInBedMin = clampedSleepMin + latencyBufferMin;
  const targetBedtime = subtractMinutesFromWakeTime(wakeTime, totalInBedMin);
  const reminderTime = subtractMinutesFromWakeTime(targetBedtime, 180); // 3 hours prior

  if (reasons.length === 0) {
    reasons.push('Baseline 8h00m target aligned with current telemetry');
  }

  return {
    wakeTime,
    minimumOkayMin,
    recommendedSleepMin: clampedSleepMin,
    recommendedSleepFormatted: formatMinutesAsHm(clampedSleepMin),
    targetBedtime,
    reminderTime,
    reasons,
  };
}

async function collectActiveAlerts(now: Date, nowMs: number): Promise<{
  targetDay: string;
  alerts: TriggeredAlert[];
}> {
  const db = getDb();

  const [matrix, latestBatteryRows, failedSyncRows] = await Promise.all([
    buildDailyTelemetryMatrix(),
    db
      .select()
      .from(ouraRingBatteryLevel)
      .orderBy(desc(ouraRingBatteryLevel.timestampUnix))
      .limit(1),
    db
      .select()
      .from(syncLogs)
      .where(gte(syncLogs.statusCode, 400))
      .orderBy(desc(syncLogs.createdAt))
      .limit(5),
  ]);

  const latestRow = matrix.length > 0 ? matrix[matrix.length - 1] : null;
  const targetDay = latestRow?.day ?? now.toISOString().slice(0, 10);
  const anomalies = computeAnomalyStatusFromMatrix(matrix);

  const alerts: TriggeredAlert[] = [];

  const readiness = latestRow?.values['daily_readiness.score'];
  const flaggedMetrics = anomalies.metrics.filter((m) => m.isAdverseDeviation);
  if (anomalies.strainAlert || flaggedMetrics.length >= 2) {
    const details = flaggedMetrics
      .map((m) => `${m.label} (z=${m.zScore !== null ? m.zScore.toFixed(2) : 'n/a'})`)
      .join(', ');
    alerts.push({
      id: `strain-${targetDay}`,
      title: 'Physiological Strain Alert',
      message: `30d Z-score strain detected on ${targetDay}: ${details || 'multiple markers elevated'}.`,
      severity: 'critical',
      url: 'https://bio.henrymilner.uk',
    });
  } else if (typeof readiness === 'number' && readiness < 70) {
    alerts.push({
      id: `readiness-low-${targetDay}`,
      title: 'Readiness Below 70',
      message: `Readiness at ${Math.round(readiness)} pts on ${targetDay}. Prioritise recovery and training load restraint.`,
      severity: 'warning',
      url: 'https://bio.henrymilner.uk',
    });
  }

  const bedtimeSerum = latestRow?.values['bedtime_serum_ng_ml'];
  if (typeof bedtimeSerum === 'number' && bedtimeSerum > 35) {
    alerts.push({
      id: `bedtime-serum-${targetDay}`,
      title: 'Elevated Bedtime Serum',
      message: `Projected bedtime concentration is ${bedtimeSerum.toFixed(1)} ng/mL (>35 ng/mL ceiling); expect deep sleep or HRV drag.`,
      severity: bedtimeSerum > 55 ? 'critical' : 'warning',
      url: 'https://bio.henrymilner.uk/sleep',
    });
  }

  const totalSleepMin = latestRow?.values['sleep.total_sleep_duration'];
  const deepSleepMin = latestRow?.values['sleep.deep_sleep_duration'];
  if (typeof totalSleepMin === 'number' && totalSleepMin < 390) {
    alerts.push({
      id: `sleep-short-${targetDay}`,
      title: 'Short Sleep Duration',
      message: `Total sleep ${Math.round(totalSleepMin)} min (<390 min) on ${targetDay}.`,
      severity: 'warning',
      url: 'https://bio.henrymilner.uk/sleep',
    });
  } else if (typeof deepSleepMin === 'number' && deepSleepMin < 60) {
    alerts.push({
      id: `deep-sleep-low-${targetDay}`,
      title: 'Low Deep Sleep',
      message: `Deep sleep ${Math.round(deepSleepMin)} min (<60 min) on ${targetDay}.`,
      severity: 'warning',
      url: 'https://bio.henrymilner.uk/sleep',
    });
  }

  const remainingTasks = latestRow?.values['daily_task_metrics.remainingCount'];
  const hour = now.getHours();
  if (typeof remainingTasks === 'number' && remainingTasks >= 6 && hour >= 18) {
    alerts.push({
      id: `tasks-backlog-${targetDay}`,
      title: 'Task Backlog Remaining',
      message: `${Math.round(remainingTasks)} reminders still left on ${targetDay}. Clear, defer, or cap WIP before winding down.`,
      severity: 'warning',
      url: 'https://bio.henrymilner.uk',
    });
  }

  const latestBattery = latestBatteryRows[0];
  if (
    latestBattery &&
    typeof latestBattery.level === 'number' &&
    latestBattery.level <= 20 &&
    !latestBattery.charging
  ) {
    alerts.push({
      id: `ring-battery-${targetDay}`,
      title: 'Oura Ring Battery Low',
      message: `Ring battery at ${latestBattery.level}% and not charging. Top up before sleep.`,
      severity: latestBattery.level <= 10 ? 'critical' : 'warning',
      url: 'https://bio.henrymilner.uk/settings',
    });
  }

  const recentFourHours = new Date(nowMs - 4 * 60 * 60 * 1000);
  const recentFailures = failedSyncRows.filter((r) => r.createdAt >= recentFourHours);
  if (recentFailures.length > 0) {
    const sample = recentFailures[0];
    alerts.push({
      id: `sync-error-${sample.id}`,
      title: 'Pipeline Sync Error',
      message: `${sample.source} (${sample.dataType}) returned HTTP ${sample.statusCode}: ${sample.errorMessage ?? 'check sync_logs'}.`,
      severity: 'critical',
      url: 'https://bio.henrymilner.uk/settings',
    });
  }

  const sleepPlan = computeNightlySleepPlan(matrix, anomalies.strainAlert, '07:30');
  const [remH, remM] = sleepPlan.reminderTime.split(':').map((n) => Number.parseInt(n, 10));
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const reminderMinutes = (Number.isFinite(remH) ? remH : 20) * 60 + (Number.isFinite(remM) ? remM : 0);

  // Trigger 3-hour-prior bedtime reminder once window is reached (within 90m after reminderTime)
  if (nowMinutes >= reminderMinutes && nowMinutes <= reminderMinutes + 90) {
    alerts.push({
      id: `bedtime-prep-${targetDay}`,
      title: `Bedtime in 3h (${sleepPlan.targetBedtime})`,
      message: `Target sleep ${sleepPlan.recommendedSleepFormatted} (min okay: ${formatMinutesAsHm(sleepPlan.minimumOkayMin)}) before ${sleepPlan.wakeTime} wake. ${sleepPlan.reasons.join('; ')}.`,
      severity: 'warning',
      url: 'https://bio.henrymilner.uk/sleep',
    });
  }

  return { targetDay, alerts, sleepPlan };
}

export async function getSleepAndAlertsOverview(): Promise<{
  alerts: TriggeredAlert[];
  sleepPlan: NightlySleepPlan;
}> {
  const fallbackPlan: NightlySleepPlan = {
    wakeTime: '07:30',
    minimumOkayMin: 420,
    recommendedSleepMin: 480,
    recommendedSleepFormatted: '8h 00m',
    targetBedtime: '23:15',
    reminderTime: '20:15',
    reasons: ['Default 8h00m target for 07:30 wake'],
  };
  try {
    const now = new Date();
    const { alerts, sleepPlan } = await collectActiveAlerts(now, now.getTime());
    return { alerts, sleepPlan };
  } catch {
    return { alerts: [], sleepPlan: fallbackPlan };
  }
}

export async function getActiveAlerts(): Promise<TriggeredAlert[]> {
  const { alerts } = await getSleepAndAlertsOverview();
  return alerts;
}

async function canSendAlert(
  db: ReturnType<typeof getDb>,
  id: string,
  nowMs: number,
): Promise<boolean> {
  const rows = await db
    .select({ lastSentAt: alertCooldowns.lastSentAt })
    .from(alertCooldowns)
    .where(eq(alertCooldowns.alertKey, id))
    .limit(1);
  const prev = rows[0]?.lastSentAt?.getTime();
  if (prev !== undefined && nowMs - prev < COOLDOWN_MS) {
    return false;
  }
  return true;
}

async function markAlertSent(
  db: ReturnType<typeof getDb>,
  id: string,
  now: Date,
): Promise<void> {
  await db
    .insert(alertCooldowns)
    .values({
      alertKey: id,
      lastSentAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: alertCooldowns.alertKey,
      set: {
        lastSentAt: now,
        updatedAt: now,
      },
    });
}

export async function evaluateAlerts(): Promise<AlertEvaluationResult> {
  const now = new Date();
  const nowMs = now.getTime();
  const db = getDb();
  const { targetDay, alerts } = await collectActiveAlerts(now, nowMs);

  const topic = process.env.NTFY_TOPIC?.trim();
  const serverUrl = (process.env.NTFY_SERVER_URL?.trim() || 'https://ntfy.sh').replace(/\/+$/, '');
  const token = process.env.NTFY_TOKEN?.trim();

  let dispatched = 0;
  let suppressedByCooldown = 0;

  for (const alert of alerts) {
    if (!(await canSendAlert(db, alert.id, nowMs))) {
      suppressedByCooldown += 1;
      continue;
    }

    if (topic) {
      try {
        const headers: Record<string, string> = {
          Title: alert.title,
          Priority: alert.severity === 'critical' ? 'urgent' : 'default',
          Tags: alert.severity === 'critical' ? 'rotating_light' : 'bar_chart',
          Click: alert.url,
        };
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
        const res = await fetch(`${serverUrl}/${encodeURIComponent(topic)}`, {
          method: 'POST',
          headers,
          body: alert.message,
        });
        if (res.ok) {
          dispatched += 1;
          await markAlertSent(db, alert.id, now);
        }
      } catch {
        // Retry on next evaluation if delivery fails
      }
    } else {
      await markAlertSent(db, alert.id, now);
    }
  }

  return {
    evaluatedAt: now.toISOString(),
    targetDay,
    alerts,
    dispatched,
    suppressedByCooldown,
  };
}
