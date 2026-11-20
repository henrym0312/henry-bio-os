import { desc, gte, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { ouraRingBatteryLevel, syncLogs } from '@/db/schema';
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

const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours per alert id
const lastSentMap = new Map<string, number>();

function canSendAlert(id: string, nowMs: number): boolean {
  const prev = lastSentMap.get(id);
  if (prev !== undefined && nowMs - prev < COOLDOWN_MS) {
    return false;
  }
  return true;
}

function markAlertSent(id: string, nowMs: number): void {
  lastSentMap.set(id, nowMs);
}

export async function evaluateAlerts(): Promise<AlertEvaluationResult> {
  const now = new Date();
  const nowMs = now.getTime();
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

  // 1. Physiological strain / Z-score drift / low readiness
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

  // 2. Bedtime pharmacokinetic serum concentration ceiling
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

  // 3. Sleep architecture / duration deficit
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

  // 4. Evening task backlog accumulation (>= 6 remaining after 18:00 local/UTC)
  const remainingTasks = latestRow?.values['daily_task_metrics.remainingCount'];
  const hour = now.getUTCHours();
  if (typeof remainingTasks === 'number' && remainingTasks >= 6 && hour >= 18) {
    alerts.push({
      id: `tasks-backlog-${targetDay}`,
      title: 'Task Backlog Remaining',
      message: `${Math.round(remainingTasks)} reminders still left on ${targetDay}. Clear, defer, or cap WIP before winding down.`,
      severity: 'warning',
      url: 'https://bio.henrymilner.uk',
    });
  }

  // 5. Ring battery low or recent ingest/webhook errors
  const latestBattery = latestBatteryRows[0];
  if (latestBattery && typeof latestBattery.level === 'number' && latestBattery.level <= 20 && !latestBattery.charging) {
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

  const topic = process.env.NTFY_TOPIC?.trim();
  const serverUrl = (process.env.NTFY_SERVER_URL?.trim() || 'https://ntfy.sh').replace(/\/+$/, '');
  const token = process.env.NTFY_TOKEN?.trim();

  let dispatched = 0;
  let suppressedByCooldown = 0;

  for (const alert of alerts) {
    if (!canSendAlert(alert.id, nowMs)) {
      suppressedByCooldown += 1;
      continue;
    }

    if (topic) {
      try {
        const headers: Record<string, string> = {
          Title: alert.title,
          Priority: alert.severity === 'critical' ? 'urgent' : 'default',
          Tags: alert.severity === 'critical' ? 'rotating_light,heart_eyes_cat' : 'bar_chart',
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
          markAlertSent(alert.id, nowMs);
        }
      } catch {
        // Leave unsent in cooldown map so a transient network error retries next cycle
      }
    } else {
      markAlertSent(alert.id, nowMs);
    }
  }

  // Keep sql imported to avoid unused warning if needed later
  void sql;

  return {
    evaluatedAt: now.toISOString(),
    targetDay,
    alerts,
    dispatched,
    suppressedByCooldown,
  };
}
