import { desc, eq, gte } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  alertCooldowns,
  lifeSubjectiveDaily,
  ouraRingBatteryLevel,
  syncLogs,
} from '@/db/schema';
import { toLondonDay } from '@/lib/life/helpers';
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

function getLondonHourAndMinute(now: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hour = Number.parseInt(parts.find((x) => x.type === 'hour')?.value ?? '0', 10);
  const minute = Number.parseInt(parts.find((x) => x.type === 'minute')?.value ?? '0', 10);
  return {
    hour: Number.isFinite(hour) ? hour : now.getUTCHours(),
    minute: Number.isFinite(minute) ? minute : now.getUTCMinutes(),
  };
}

async function collectActiveAlerts(now: Date, nowMs: number): Promise<{
  targetDay: string;
  alerts: TriggeredAlert[];
  sleepPlan: NightlySleepPlan;
}> {
  const db = getDb();
  const todayLondonDay = toLondonDay(now);

  const [matrix, latestBatteryRows, failedSyncRows, todayCheckInRows] = await Promise.all([
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
    db
      .select({ day: lifeSubjectiveDaily.day })
      .from(lifeSubjectiveDaily)
      .where(eq(lifeSubjectiveDaily.day, todayLondonDay))
      .limit(1),
  ]);

  const latestRow = matrix.length > 0 ? matrix[matrix.length - 1] : null;
  const targetDay = latestRow?.day ?? now.toISOString().slice(0, 10);
  const anomalies = computeAnomalyStatusFromMatrix(matrix);

  const alerts: TriggeredAlert[] = [];
  const { hour: londonHour, minute: londonMinute } = getLondonHourAndMinute(now);

  const readiness = latestRow?.values['daily_readiness.score'];
  const flaggedMetrics = anomalies.metrics.filter((m) => m.isAdverseDeviation);
  if (anomalies.strainAlert || flaggedMetrics.length >= 2) {
    const details = flaggedMetrics
      .map((m) => `${m.label} (${m.zScore !== null ? m.zScore.toFixed(1) : 'n/a'}s)`)
      .join(', ');
    alerts.push({
      id: `strain-${targetDay}`,
      title: 'Strain Alert',
      message: details || 'Multiple 30d markers elevated.',
      severity: 'critical',
      url: 'https://bio.henrymilner.uk',
    });
  } else if (typeof readiness === 'number' && readiness < 70) {
    alerts.push({
      id: `readiness-low-${targetDay}`,
      title: 'Low Readiness',
      message: `Readiness ${Math.round(readiness)} pts. Prioritise recovery.`,
      severity: 'warning',
      url: 'https://bio.henrymilner.uk',
    });
  }

  const totalSleepMin = latestRow?.values['sleep.total_sleep_duration'];
  const deepSleepMin = latestRow?.values['sleep.deep_sleep_duration'];
  if (typeof totalSleepMin === 'number' && totalSleepMin < 390) {
    const totalSleepHours = (totalSleepMin / 60).toFixed(1);
    alerts.push({
      id: `sleep-short-${targetDay}`,
      title: 'Short Sleep',
      message: `Slept ${totalSleepHours}h (<6.5h).`,
      severity: 'warning',
      url: 'https://bio.henrymilner.uk/sleep',
    });
  } else if (typeof deepSleepMin === 'number' && deepSleepMin < 60) {
    alerts.push({
      id: `deep-sleep-low-${targetDay}`,
      title: 'Low Deep Sleep',
      message: `Deep sleep ${Math.round(deepSleepMin)} min (<60 min).`,
      severity: 'warning',
      url: 'https://bio.henrymilner.uk/sleep',
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
      title: 'Ring Battery Low',
      message: `Battery at ${latestBattery.level}%. Charge before bed.`,
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
      title: 'Sync Error',
      message: `${sample.source} (${sample.dataType}): HTTP ${sample.statusCode}.`,
      severity: 'critical',
      url: 'https://bio.henrymilner.uk/settings',
    });
  }

  const sleepPlan = computeNightlySleepPlan(matrix, anomalies.strainAlert, '07:30');
  const [remH, remM] = sleepPlan.reminderTime.split(':').map((n) => Number.parseInt(n, 10));
  const nowMinutes = londonHour * 60 + londonMinute;
  const reminderMinutes = (Number.isFinite(remH) ? remH : 20) * 60 + (Number.isFinite(remM) ? remM : 0);

  if (nowMinutes >= reminderMinutes && nowMinutes <= reminderMinutes + 180) {
    alerts.push({
      id: `bedtime-prep-${targetDay}`,
      title: `Bed at ${sleepPlan.targetBedtime} (3h)`,
      message: `Target ${sleepPlan.recommendedSleepFormatted} (min ${formatMinutesAsHm(sleepPlan.minimumOkayMin)}) for ${sleepPlan.wakeTime} wake.`,
      severity: 'warning',
      url: 'https://bio.henrymilner.uk/sleep',
    });
  }

  if (londonHour >= 21 && londonHour < 24 && todayCheckInRows.length === 0) {
    alerts.push({
      id: `daily-checkin-${todayLondonDay}`,
      title: 'Daily Check-In',
      message: "Log today's energy, focus, mood, and social score (10s).",
      severity: 'warning',
      url: 'https://bio.henrymilner.uk/log',
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
