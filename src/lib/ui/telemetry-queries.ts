import { desc, eq, gte, lte, and, sql, ilike, or } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  aiBriefings,
  dailyTaskMetrics,
  medLogs,
  ouraDailyActivity,
  ouraDailyCardiovascularAge,
  ouraDailyReadiness,
  ouraDailyResilience,
  ouraDailySleep,
  ouraDailySpo2,
  ouraDailyStress,
  ouraEnhancedTag,
  ouraHeartrate,
  ouraOauthTokens,
  ouraPersonalInfo,
  ouraRestModePeriod,
  ouraRingBatteryLevel,
  ouraRingConfiguration,
  ouraSession,
  ouraSleep,
  ouraSleepTime,
  ouraTag,
  ouraVo2Max,
  ouraWorkout,
  syncLogs,
  webhookSubscriptions,
} from '@/db/schema';
import {
  computeBedtimePkForNight,
  computeSerumConcentrationAt,
  generatePkCurve,
  type MedDoseInput,
} from '@/lib/analytics/pk';
import {
  buildDailyTelemetryMatrix,
  computeAnomalyStatusFromMatrix,
  type AnomalyDetectionReport,
  type DailyMetricRow,
} from '@/lib/analytics/stats';
import { ALL_OURA_ENDPOINTS, type OuraEndpointKey } from '@/lib/oura/types';

export interface ShellStatusData {
  oauthConnected: boolean;
  oauthExpiresAt: string | null;
  latestBatteryLevel: number | null;
  latestBatteryCharging: boolean | null;
  latestBatteryTimestamp: string | null;
  lastSyncAt: string | null;
  lastSyncDataType: string | null;
  lastSyncStatus: number | null;
  dbReady: boolean;
}

export async function getShellStatus(): Promise<ShellStatusData> {
  try {
    const db = getDb();
    const [tokenRows, batteryRows, syncRows] = await Promise.all([
      db.select().from(ouraOauthTokens).where(eq(ouraOauthTokens.id, 1)).limit(1),
      db
        .select()
        .from(ouraRingBatteryLevel)
        .orderBy(desc(ouraRingBatteryLevel.timestampUnix))
        .limit(1),
      db.select().from(syncLogs).orderBy(desc(syncLogs.createdAt)).limit(1),
    ]);

    const token = tokenRows[0];
    const battery = batteryRows[0];
    const latestSync = syncRows[0];

    return {
      oauthConnected: Boolean(token),
      oauthExpiresAt: token ? token.expiresAt.toISOString() : null,
      latestBatteryLevel: battery ? battery.level : null,
      latestBatteryCharging: battery ? battery.charging : null,
      latestBatteryTimestamp: battery ? battery.timestamp : null,
      lastSyncAt: latestSync ? latestSync.createdAt.toISOString() : null,
      lastSyncDataType: latestSync ? latestSync.dataType : null,
      lastSyncStatus: latestSync ? latestSync.statusCode : null,
      dbReady: true,
    };
  } catch {
    return {
      oauthConnected: false,
      oauthExpiresAt: null,
      latestBatteryLevel: null,
      latestBatteryCharging: null,
      latestBatteryTimestamp: null,
      lastSyncAt: null,
      lastSyncDataType: null,
      lastSyncStatus: null,
      dbReady: false,
    };
  }
}

export interface CommandOverviewData {
  dbReady: boolean;
  hasData: boolean;
  latestDay: string | null;
  anomalies: AnomalyDetectionReport;
  kpis: {
    readinessScore: number | null;
    temperatureDeviation: number | null;
    sleepScore: number | null;
    totalSleepDurationSec: number | null;
    sleepEfficiency: number | null;
    averageHrv: number | null;
    lowestHeartRate: number | null;
    activityScore: number | null;
    steps: number | null;
    activeCalories: number | null;
    resilienceLevel: string | null;
    resilienceContributors: {
      sleep_recovery?: number;
      daytime_recovery?: number;
      stress?: number;
    } | null;
    stressHighSec: number | null;
    recoveryHighSec: number | null;
    stressDaySummary: string | null;
    batteryLevel: number | null;
    batteryCharging: boolean | null;
    ringHardware: string | null;
    ringFirmware: string | null;
    currentSerumNgMl: number;
    bedtimeSerumNgMl: number | null;
    lastDoseLabel: string | null;
    lastDoseAt: string | null;
    taskCompletionPct: number | null;
    tasksCompleted: number | null;
    tasksRemaining: number | null;
  };
  sparklines: Array<{
    day: string;
    readiness: number | null;
    sleepScore: number | null;
    hrv: number | null;
    lowestHr: number | null;
    stressHighMins: number | null;
    bedtimeSerum: number | null;
    steps: number | null;
  }>;
}

export async function getCommandOverviewData(): Promise<CommandOverviewData> {
  try {
    const db = getDb();
    const [
      readinessRows,
      dailySleepRows,
      sleepRows,
      activityRows,
      resilienceRows,
      stressRows,
      batteryRows,
      ringConfigRows,
      taskRows,
      medRows,
      matrix,
    ] = await Promise.all([
      db.select().from(ouraDailyReadiness).orderBy(desc(ouraDailyReadiness.day)).limit(1),
      db.select().from(ouraDailySleep).orderBy(desc(ouraDailySleep.day)).limit(1),
      db.select().from(ouraSleep).orderBy(desc(ouraSleep.day), desc(ouraSleep.bedtimeStart)).limit(5),
      db.select().from(ouraDailyActivity).orderBy(desc(ouraDailyActivity.day)).limit(1),
      db.select().from(ouraDailyResilience).orderBy(desc(ouraDailyResilience.day)).limit(1),
      db.select().from(ouraDailyStress).orderBy(desc(ouraDailyStress.day)).limit(1),
      db
        .select()
        .from(ouraRingBatteryLevel)
        .orderBy(desc(ouraRingBatteryLevel.timestampUnix))
        .limit(1),
      db.select().from(ouraRingConfiguration).limit(1),
      db.select().from(dailyTaskMetrics).orderBy(desc(dailyTaskMetrics.day)).limit(1),
      db.select().from(medLogs).orderBy(desc(medLogs.takenAt)).limit(30),
      buildDailyTelemetryMatrix(),
    ]);

    const readiness = readinessRows[0];
    const dailySleep = dailySleepRows[0];
    const primarySleep =
      sleepRows.find((s) => s.type === 'long_sleep') ?? sleepRows[0] ?? null;
    const activity = activityRows[0];
    const resilience = resilienceRows[0];
    const stress = stressRows[0];
    const battery = batteryRows[0];
    const ringConfig = ringConfigRows[0];
    const latestTask = taskRows[0];

    const anomalies = computeAnomalyStatusFromMatrix(matrix);
    const doseInputs: MedDoseInput[] = medRows.map((m) => ({
      id: m.id,
      doseId: m.doseId,
      drugType: m.drugType,
      mg: m.mg,
      takenAt: m.takenAt,
      day: m.day,
    }));

    const currentSerumNgMl = computeSerumConcentrationAt(new Date(), doseInputs);
    const latestBedtimePk = primarySleep
      ? computeBedtimePkForNight(primarySleep.bedtimeStart, doseInputs)
      : null;

    const latestMed = medRows[0];
    const recent14 = matrix.slice(-14);
    const sparklines = recent14.map((row) => ({
      day: row.day,
      readiness: row.values['daily_readiness.score'] ?? null,
      sleepScore: row.values['sleep.score'] ?? null,
      hrv: row.values['sleep.average_hrv'] ?? null,
      lowestHr: row.values['sleep.lowest_heart_rate'] ?? null,
      stressHighMins: row.values['daily_stress.stress_high'] ?? null,
      bedtimeSerum: row.values['bedtime_serum_ng_ml'] ?? null,
      steps: row.values['daily_activity.steps'] ?? null,
    }));

    const hasData = matrix.length > 0 || Boolean(battery) || medRows.length > 0;

    return {
      dbReady: true,
      hasData,
      latestDay: matrix.length > 0 ? matrix[matrix.length - 1].day : null,
      anomalies,
      kpis: {
        readinessScore: readiness?.score ?? null,
        temperatureDeviation: readiness?.temperatureDeviation ?? null,
        sleepScore: dailySleep?.score ?? null,
        totalSleepDurationSec: primarySleep?.totalSleepDuration ?? null,
        sleepEfficiency: primarySleep?.efficiency ?? null,
        averageHrv: primarySleep?.averageHrv ?? null,
        lowestHeartRate: primarySleep?.lowestHeartRate ?? null,
        activityScore: activity?.score ?? null,
        steps: activity?.steps ?? null,
        activeCalories: activity?.activeCalories ?? null,
        resilienceLevel: resilience?.level ?? null,
        resilienceContributors: resilience?.contributors ?? null,
        stressHighSec: stress?.stressHigh ?? null,
        recoveryHighSec: stress?.recoveryHigh ?? null,
        stressDaySummary: stress?.daySummary ?? null,
        batteryLevel: battery?.level ?? null,
        batteryCharging: battery?.charging ?? null,
        ringHardware: ringConfig?.hardwareType ?? null,
        ringFirmware: ringConfig?.firmwareVersion ?? null,
        currentSerumNgMl,
        bedtimeSerumNgMl: latestBedtimePk ? latestBedtimePk.bedtimeSerumNgMl : null,
        lastDoseLabel: latestMed
          ? `${latestMed.doseId} (${latestMed.mg} mg)`
          : null,
        lastDoseAt: latestMed ? latestMed.takenAt.toISOString() : null,
        taskCompletionPct: latestTask?.completionPct ?? null,
        tasksCompleted: latestTask?.completedCount ?? null,
        tasksRemaining: latestTask?.remainingCount ?? null,
      },
      sparklines,
    };
  } catch {
    return {
      dbReady: false,
      hasData: false,
      latestDay: null,
      anomalies: computeAnomalyStatusFromMatrix([]),
      kpis: {
        readinessScore: null,
        temperatureDeviation: null,
        sleepScore: null,
        totalSleepDurationSec: null,
        sleepEfficiency: null,
        averageHrv: null,
        lowestHeartRate: null,
        activityScore: null,
        steps: null,
        activeCalories: null,
        resilienceLevel: null,
        resilienceContributors: null,
        stressHighSec: null,
        recoveryHighSec: null,
        stressDaySummary: null,
        batteryLevel: null,
        batteryCharging: null,
        ringHardware: null,
        ringFirmware: null,
        currentSerumNgMl: 0,
        bedtimeSerumNgMl: null,
        lastDoseLabel: null,
        lastDoseAt: null,
        taskCompletionPct: null,
        tasksCompleted: null,
        tasksRemaining: null,
      },
      sparklines: [],
    };
  }
}

export interface SleepNightSummary {
  id: string;
  day: string;
  type: string | null;
  bedtimeStart: string;
  bedtimeEnd: string;
  totalSleepDuration: number | null;
  efficiency: number | null;
  averageHrv: number | null;
  lowestHeartRate: number | null;
}

export interface SleepLabData {
  dbReady: boolean;
  nights: SleepNightSummary[];
  selectedNight: {
    id: string;
    day: string;
    type: string | null;
    bedtimeStart: string;
    bedtimeEnd: string;
    totalSleepDuration: number | null;
    deepSleepDuration: number | null;
    remSleepDuration: number | null;
    lightSleepDuration: number | null;
    awakeTime: number | null;
    timeInBed: number | null;
    efficiency: number | null;
    latency: number | null;
    averageBreath: number | null;
    averageHeartRate: number | null;
    lowestHeartRate: number | null;
    averageHrv: number | null;
    restlessPeriods: number | null;
    sleepPhase30Sec: string | null;
    movement30Sec: string | null;
    heartRate: { interval: number; items: Array<number | null>; timestamp: string } | null;
    hrv: { interval: number; items: Array<number | null>; timestamp: string } | null;
    sleepAlgorithmVersion: string | null;
  } | null;
  bedtimePk: {
    bedtimeSerumNgMl: number;
    hoursSinceLastDose: number | null;
    totalDailyMg: number;
    lastDoseLabel: string | null;
    lastDoseAt: string | null;
    activeDoses: Array<{
      doseId: string;
      drugType: string;
      mg: number;
      takenAt: string;
      hoursElapsed: number;
      contributionNgMl: number;
    }>;
  } | null;
  nocturnalPkCurve: Array<{
    timestamp: string;
    elapsedMinutes: number;
    serumNgMl: number;
  }>;
  sleepDebt14d: {
    targetHoursPerNight: number;
    nightsEvaluated: number;
    cumulativeDebtHours: number;
    nightlySeries: Array<{
      day: string;
      actualHours: number;
      targetHours: number;
      deltaHours: number;
    }>;
  };
}

export async function getSleepLabData(selectedNightId?: string): Promise<SleepLabData> {
  try {
    const db = getDb();
    const allSleep = await db
      .select()
      .from(ouraSleep)
      .orderBy(desc(ouraSleep.day), desc(ouraSleep.bedtimeStart))
      .limit(180);

    const nights: SleepNightSummary[] = allSleep.map((s) => ({
      id: s.id,
      day: s.day,
      type: s.type,
      bedtimeStart: s.bedtimeStart,
      bedtimeEnd: s.bedtimeEnd,
      totalSleepDuration: s.totalSleepDuration,
      efficiency: s.efficiency,
      averageHrv: s.averageHrv,
      lowestHeartRate: s.lowestHeartRate,
    }));

    const selected =
      (selectedNightId ? allSleep.find((s) => s.id === selectedNightId) : null) ??
      allSleep.find((s) => s.type === 'long_sleep') ??
      allSleep[0] ??
      null;

    let bedtimePk: SleepLabData['bedtimePk'] = null;
    let nocturnalPkCurve: SleepLabData['nocturnalPkCurve'] = [];

    if (selected) {
      const startDt = new Date(selected.bedtimeStart);
      const endDt = new Date(selected.bedtimeEnd);
      const lookbackStart = new Date(startDt.getTime() - 72 * 3_600_000);

      const relevantMeds = await db
        .select()
        .from(medLogs)
        .where(and(gte(medLogs.takenAt, lookbackStart), lte(medLogs.takenAt, endDt)))
        .orderBy(desc(medLogs.takenAt));

      const doses: MedDoseInput[] = relevantMeds.map((m) => ({
        id: m.id,
        doseId: m.doseId,
        drugType: m.drugType,
        mg: m.mg,
        takenAt: m.takenAt,
        day: m.day,
      }));

      bedtimePk = computeBedtimePkForNight(selected.bedtimeStart, doses);
      nocturnalPkCurve = generatePkCurve(startDt, endDt, 15, doses);
    }

    // 14-day sleep debt accumulator (primary long_sleep per day vs 8.0h target)
    const primaryByDay = new Map<string, (typeof allSleep)[number]>();
    for (const s of allSleep) {
      const prev = primaryByDay.get(s.day);
      if (!prev || (s.totalSleepDuration ?? 0) > (prev.totalSleepDuration ?? 0)) {
        primaryByDay.set(s.day, s);
      }
    }

    const recent14 = Array.from(primaryByDay.values())
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(-14);

    const targetHoursPerNight = 8.0;
    let cumulativeDebtHours = 0;
    const nightlySeries = recent14.map((s) => {
      const actualHours =
        Math.round(((s.totalSleepDuration ?? 0) / 3600) * 100) / 100;
      const deltaHours = Math.round((actualHours - targetHoursPerNight) * 100) / 100;
      cumulativeDebtHours += targetHoursPerNight - actualHours;
      return {
        day: s.day,
        actualHours,
        targetHours: targetHoursPerNight,
        deltaHours,
      };
    });

    return {
      dbReady: true,
      nights,
      selectedNight: selected
        ? {
            id: selected.id,
            day: selected.day,
            type: selected.type,
            bedtimeStart: selected.bedtimeStart,
            bedtimeEnd: selected.bedtimeEnd,
            totalSleepDuration: selected.totalSleepDuration,
            deepSleepDuration: selected.deepSleepDuration,
            remSleepDuration: selected.remSleepDuration,
            lightSleepDuration: selected.lightSleepDuration,
            awakeTime: selected.awakeTime,
            timeInBed: selected.timeInBed,
            efficiency: selected.efficiency,
            latency: selected.latency,
            averageBreath: selected.averageBreath,
            averageHeartRate: selected.averageHeartRate,
            lowestHeartRate: selected.lowestHeartRate,
            averageHrv: selected.averageHrv,
            restlessPeriods: selected.restlessPeriods,
            sleepPhase30Sec: selected.sleepPhase30Sec,
            movement30Sec: selected.movement30Sec,
            heartRate: selected.heartRate,
            hrv: selected.hrv,
            sleepAlgorithmVersion: selected.sleepAlgorithmVersion,
          }
        : null,
      bedtimePk,
      nocturnalPkCurve,
      sleepDebt14d: {
        targetHoursPerNight,
        nightsEvaluated: recent14.length,
        cumulativeDebtHours: Math.round(cumulativeDebtHours * 100) / 100,
        nightlySeries,
      },
    };
  } catch {
    return {
      dbReady: false,
      nights: [],
      selectedNight: null,
      bedtimePk: null,
      nocturnalPkCurve: [],
      sleepDebt14d: {
        targetHoursPerNight: 8,
        nightsEvaluated: 0,
        cumulativeDebtHours: 0,
        nightlySeries: [],
      },
    };
  }
}

export interface CardioTelemetryData {
  dbReady: boolean;
  chronologicalAge: number | null;
  cardioSeries: Array<{
    day: string;
    pulseWaveVelocity: number | null;
    vascularAge: number | null;
  }>;
  vo2MaxSeries: Array<{
    day: string;
    vo2Max: number | null;
  }>;
  spo2Series: Array<{
    day: string;
    spo2Average: number | null;
    breathingDisturbanceIndex: number | null;
  }>;
  selectedDay: string | null;
  availableHrDays: string[];
  heartrateSamples: Array<{
    timestamp: string;
    timestampUnix: number;
    bpm: number;
    source: string;
  }>;
  batterySamples: Array<{
    timestamp: string;
    timestampUnix: number;
    level: number;
    charging: boolean | null;
  }>;
}

export async function getCardioTelemetryData(
  requestedDay?: string,
): Promise<CardioTelemetryData> {
  try {
    const db = getDb();
    const [personalRows, cardioRows, vo2Rows, spo2Rows, latestHrRows] =
      await Promise.all([
        db.select().from(ouraPersonalInfo).limit(1),
        db
          .select()
          .from(ouraDailyCardiovascularAge)
          .orderBy(desc(ouraDailyCardiovascularAge.day))
          .limit(365),
        db.select().from(ouraVo2Max).orderBy(desc(ouraVo2Max.day)).limit(365),
        db.select().from(ouraDailySpo2).orderBy(desc(ouraDailySpo2.day)).limit(180),
        db
          .select({ day: sql<string>`LEFT(${ouraHeartrate.timestamp}, 10)` })
          .from(ouraHeartrate)
          .groupBy(sql`LEFT(${ouraHeartrate.timestamp}, 10)`)
          .orderBy(desc(sql`LEFT(${ouraHeartrate.timestamp}, 10)`))
          .limit(60),
      ]);

    const availableHrDays = latestHrRows.map((r) => r.day).filter(Boolean);
    const selectedDay =
      requestedDay && availableHrDays.includes(requestedDay)
        ? requestedDay
        : availableHrDays[0] ?? null;

    let heartrateSamples: CardioTelemetryData['heartrateSamples'] = [];
    let batterySamples: CardioTelemetryData['batterySamples'] = [];

    if (selectedDay) {
      const prefix = `${selectedDay}%`;
      const [hrRows, batRows] = await Promise.all([
        db
          .select()
          .from(ouraHeartrate)
          .where(ilike(ouraHeartrate.timestamp, prefix))
          .orderBy(ouraHeartrate.timestampUnix),
        db
          .select()
          .from(ouraRingBatteryLevel)
          .where(ilike(ouraRingBatteryLevel.timestamp, prefix))
          .orderBy(ouraRingBatteryLevel.timestampUnix),
      ]);

      heartrateSamples = hrRows.map((h) => ({
        timestamp: h.timestamp,
        timestampUnix: h.timestampUnix,
        bpm: h.bpm,
        source: h.source,
      }));
      batterySamples = batRows.map((b) => ({
        timestamp: b.timestamp,
        timestampUnix: b.timestampUnix,
        level: b.level,
        charging: b.charging,
      }));
    }

    return {
      dbReady: true,
      chronologicalAge: personalRows[0]?.age ?? null,
      cardioSeries: [...cardioRows]
        .reverse()
        .map((c) => ({
          day: c.day,
          pulseWaveVelocity: c.pulseWaveVelocity,
          vascularAge: c.vascularAge,
        })),
      vo2MaxSeries: [...vo2Rows]
        .reverse()
        .map((v) => ({
          day: v.day,
          vo2Max: v.vo2Max,
        })),
      spo2Series: [...spo2Rows]
        .reverse()
        .map((s) => ({
          day: s.day,
          spo2Average: s.spo2Average,
          breathingDisturbanceIndex: s.breathingDisturbanceIndex,
        })),
      selectedDay,
      availableHrDays,
      heartrateSamples,
      batterySamples,
    };
  } catch {
    return {
      dbReady: false,
      chronologicalAge: null,
      cardioSeries: [],
      vo2MaxSeries: [],
      spo2Series: [],
      selectedDay: null,
      availableHrDays: [],
      heartrateSamples: [],
      batterySamples: [],
    };
  }
}

export async function getArchiveHeatmapMatrix(): Promise<DailyMetricRow[]> {
  try {
    const matrix = await buildDailyTelemetryMatrix();
    return matrix.slice(-365);
  } catch {
    return [];
  }
}

export async function queryRawOuraTable(
  tableKey: OuraEndpointKey,
  search = '',
  page = 1,
  pageSize = 25,
): Promise<{
  rows: Array<{ id: string; day: string; preview: string; rawPayload: Record<string, unknown> }>;
  total: number;
}> {
  const db = getDb();
  const offset = Math.max(0, (page - 1) * pageSize);
  const q = search.trim();
  const likePattern = q ? `%${q}%` : null;

  switch (tableKey) {
    case 'personal_info': {
      const rows = await db.select().from(ouraPersonalInfo).limit(pageSize).offset(offset);
      return {
        rows: rows.map((r) => ({
          id: r.id,
          day: 'profile',
          preview: `Age: ${r.age ?? '—'} · Sex: ${r.biologicalSex ?? '—'} · Email: ${r.email ?? '—'}`,
          rawPayload: r.rawPayload,
        })),
        total: rows.length,
      };
    }
    case 'ring_configuration': {
      const rows = await db.select().from(ouraRingConfiguration).limit(pageSize).offset(offset);
      return {
        rows: rows.map((r) => ({
          id: r.id,
          day: r.setUpAt?.slice(0, 10) ?? '—',
          preview: `${r.hardwareType ?? 'Ring'} · ${r.color ?? '—'} · FW ${r.firmwareVersion ?? '—'} · Size ${r.size ?? '—'}`,
          rawPayload: r.rawPayload,
        })),
        total: rows.length,
      };
    }
    case 'daily_readiness': {
      const where = likePattern
        ? or(ilike(ouraDailyReadiness.day, likePattern), ilike(ouraDailyReadiness.id, likePattern))
        : undefined;
      const [rows, countRes] = await Promise.all([
        db
          .select()
          .from(ouraDailyReadiness)
          .where(where)
          .orderBy(desc(ouraDailyReadiness.day))
          .limit(pageSize)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(ouraDailyReadiness).where(where),
      ]);
      return {
        rows: rows.map((r) => ({
          id: r.id,
          day: r.day,
          preview: `Score: ${r.score ?? '—'} · Temp Dev: ${r.temperatureDeviation ?? '—'}°C`,
          rawPayload: r.rawPayload,
        })),
        total: countRes[0]?.count ?? 0,
      };
    }
    case 'daily_sleep': {
      const where = likePattern
        ? or(ilike(ouraDailySleep.day, likePattern), ilike(ouraDailySleep.id, likePattern))
        : undefined;
      const [rows, countRes] = await Promise.all([
        db
          .select()
          .from(ouraDailySleep)
          .where(where)
          .orderBy(desc(ouraDailySleep.day))
          .limit(pageSize)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(ouraDailySleep).where(where),
      ]);
      return {
        rows: rows.map((r) => ({
          id: r.id,
          day: r.day,
          preview: `Sleep Score: ${r.score ?? '—'}`,
          rawPayload: r.rawPayload,
        })),
        total: countRes[0]?.count ?? 0,
      };
    }
    case 'sleep': {
      const where = likePattern
        ? or(ilike(ouraSleep.day, likePattern), ilike(ouraSleep.id, likePattern))
        : undefined;
      const [rows, countRes] = await Promise.all([
        db
          .select()
          .from(ouraSleep)
          .where(where)
          .orderBy(desc(ouraSleep.day), desc(ouraSleep.bedtimeStart))
          .limit(pageSize)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(ouraSleep).where(where),
      ]);
      return {
        rows: rows.map((r) => ({
          id: r.id,
          day: r.day,
          preview: `${r.type ?? 'sleep'} · HRV ${r.averageHrv ?? '—'} ms · Min HR ${r.lowestHeartRate ?? '—'} bpm · Eff ${r.efficiency ?? '—'}%`,
          rawPayload: r.rawPayload,
        })),
        total: countRes[0]?.count ?? 0,
      };
    }
    case 'sleep_time': {
      const where = likePattern
        ? or(ilike(ouraSleepTime.day, likePattern), ilike(ouraSleepTime.id, likePattern))
        : undefined;
      const [rows, countRes] = await Promise.all([
        db
          .select()
          .from(ouraSleepTime)
          .where(where)
          .orderBy(desc(ouraSleepTime.day))
          .limit(pageSize)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(ouraSleepTime).where(where),
      ]);
      return {
        rows: rows.map((r) => ({
          id: r.id,
          day: r.day,
          preview: `Recommendation: ${r.recommendation ?? '—'} · Status: ${r.status ?? '—'}`,
          rawPayload: r.rawPayload,
        })),
        total: countRes[0]?.count ?? 0,
      };
    }
    case 'daily_activity': {
      const where = likePattern
        ? or(ilike(ouraDailyActivity.day, likePattern), ilike(ouraDailyActivity.id, likePattern))
        : undefined;
      const [rows, countRes] = await Promise.all([
        db
          .select()
          .from(ouraDailyActivity)
          .where(where)
          .orderBy(desc(ouraDailyActivity.day))
          .limit(pageSize)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(ouraDailyActivity).where(where),
      ]);
      return {
        rows: rows.map((r) => ({
          id: r.id,
          day: r.day,
          preview: `Score: ${r.score ?? '—'} · Steps: ${r.steps ?? '—'} · Active: ${r.activeCalories ?? '—'} kcal`,
          rawPayload: r.rawPayload,
        })),
        total: countRes[0]?.count ?? 0,
      };
    }
    case 'daily_stress': {
      const where = likePattern
        ? or(ilike(ouraDailyStress.day, likePattern), ilike(ouraDailyStress.id, likePattern))
        : undefined;
      const [rows, countRes] = await Promise.all([
        db
          .select()
          .from(ouraDailyStress)
          .where(where)
          .orderBy(desc(ouraDailyStress.day))
          .limit(pageSize)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(ouraDailyStress).where(where),
      ]);
      return {
        rows: rows.map((r) => ({
          id: r.id,
          day: r.day,
          preview: `Summary: ${r.daySummary ?? '—'} · Stress: ${Math.round((r.stressHigh ?? 0) / 60)}m · Recovery: ${Math.round((r.recoveryHigh ?? 0) / 60)}m`,
          rawPayload: r.rawPayload,
        })),
        total: countRes[0]?.count ?? 0,
      };
    }
    case 'daily_resilience': {
      const where = likePattern
        ? or(ilike(ouraDailyResilience.day, likePattern), ilike(ouraDailyResilience.id, likePattern))
        : undefined;
      const [rows, countRes] = await Promise.all([
        db
          .select()
          .from(ouraDailyResilience)
          .where(where)
          .orderBy(desc(ouraDailyResilience.day))
          .limit(pageSize)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(ouraDailyResilience).where(where),
      ]);
      return {
        rows: rows.map((r) => ({
          id: r.id,
          day: r.day,
          preview: `Level: ${r.level ?? '—'}`,
          rawPayload: r.rawPayload,
        })),
        total: countRes[0]?.count ?? 0,
      };
    }
    case 'daily_spo2': {
      const where = likePattern
        ? or(ilike(ouraDailySpo2.day, likePattern), ilike(ouraDailySpo2.id, likePattern))
        : undefined;
      const [rows, countRes] = await Promise.all([
        db
          .select()
          .from(ouraDailySpo2)
          .where(where)
          .orderBy(desc(ouraDailySpo2.day))
          .limit(pageSize)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(ouraDailySpo2).where(where),
      ]);
      return {
        rows: rows.map((r) => ({
          id: r.id,
          day: r.day,
          preview: `SpO2 Avg: ${r.spo2Average ?? '—'}% · BDI: ${r.breathingDisturbanceIndex ?? '—'}`,
          rawPayload: r.rawPayload,
        })),
        total: countRes[0]?.count ?? 0,
      };
    }
    case 'daily_cardiovascular_age': {
      const where = likePattern
        ? or(
            ilike(ouraDailyCardiovascularAge.day, likePattern),
            ilike(ouraDailyCardiovascularAge.id, likePattern),
          )
        : undefined;
      const [rows, countRes] = await Promise.all([
        db
          .select()
          .from(ouraDailyCardiovascularAge)
          .where(where)
          .orderBy(desc(ouraDailyCardiovascularAge.day))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(ouraDailyCardiovascularAge)
          .where(where),
      ]);
      return {
        rows: rows.map((r) => ({
          id: r.id,
          day: r.day,
          preview: `PWV: ${r.pulseWaveVelocity ?? '—'} m/s · Vascular Age: ${r.vascularAge ?? '—'} yrs`,
          rawPayload: r.rawPayload,
        })),
        total: countRes[0]?.count ?? 0,
      };
    }
    case 'vo2_max': {
      const where = likePattern
        ? or(ilike(ouraVo2Max.day, likePattern), ilike(ouraVo2Max.id, likePattern))
        : undefined;
      const [rows, countRes] = await Promise.all([
        db
          .select()
          .from(ouraVo2Max)
          .where(where)
          .orderBy(desc(ouraVo2Max.day))
          .limit(pageSize)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(ouraVo2Max).where(where),
      ]);
      return {
        rows: rows.map((r) => ({
          id: r.id,
          day: r.day,
          preview: `VO2 Max: ${r.vo2Max ?? '—'} mL/kg/min`,
          rawPayload: r.rawPayload,
        })),
        total: countRes[0]?.count ?? 0,
      };
    }
    case 'workout': {
      const where = likePattern
        ? or(
            ilike(ouraWorkout.day, likePattern),
            ilike(ouraWorkout.activity, likePattern),
            ilike(ouraWorkout.id, likePattern),
          )
        : undefined;
      const [rows, countRes] = await Promise.all([
        db
          .select()
          .from(ouraWorkout)
          .where(where)
          .orderBy(desc(ouraWorkout.day))
          .limit(pageSize)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(ouraWorkout).where(where),
      ]);
      return {
        rows: rows.map((r) => ({
          id: r.id,
          day: r.day,
          preview: `${r.activity ?? 'workout'} · ${r.intensity ?? '—'} · ${r.calories ?? '—'} kcal`,
          rawPayload: r.rawPayload,
        })),
        total: countRes[0]?.count ?? 0,
      };
    }
    case 'session': {
      const where = likePattern
        ? or(ilike(ouraSession.day, likePattern), ilike(ouraSession.type, likePattern))
        : undefined;
      const [rows, countRes] = await Promise.all([
        db
          .select()
          .from(ouraSession)
          .where(where)
          .orderBy(desc(ouraSession.day))
          .limit(pageSize)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(ouraSession).where(where),
      ]);
      return {
        rows: rows.map((r) => ({
          id: r.id,
          day: r.day,
          preview: `Type: ${r.type ?? '—'} · Mood: ${r.mood ?? '—'}`,
          rawPayload: r.rawPayload,
        })),
        total: countRes[0]?.count ?? 0,
      };
    }
    case 'enhanced_tag': {
      const where = likePattern
        ? or(
            ilike(ouraEnhancedTag.startDay, likePattern),
            ilike(ouraEnhancedTag.tagTypeCode, likePattern),
            ilike(ouraEnhancedTag.customName, likePattern),
          )
        : undefined;
      const [rows, countRes] = await Promise.all([
        db
          .select()
          .from(ouraEnhancedTag)
          .where(where)
          .orderBy(desc(ouraEnhancedTag.startDay))
          .limit(pageSize)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(ouraEnhancedTag).where(where),
      ]);
      return {
        rows: rows.map((r) => ({
          id: r.id,
          day: r.startDay,
          preview: `${r.customName ?? r.tagTypeCode ?? 'Tag'} · ${r.comment ?? ''}`.trim(),
          rawPayload: r.rawPayload,
        })),
        total: countRes[0]?.count ?? 0,
      };
    }
    case 'tag': {
      const where = likePattern
        ? or(ilike(ouraTag.day, likePattern), ilike(ouraTag.text, likePattern))
        : undefined;
      const [rows, countRes] = await Promise.all([
        db
          .select()
          .from(ouraTag)
          .where(where)
          .orderBy(desc(ouraTag.day))
          .limit(pageSize)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(ouraTag).where(where),
      ]);
      return {
        rows: rows.map((r) => ({
          id: r.id,
          day: r.day,
          preview: `${r.tags.join(', ')} ${r.text ? `· ${r.text}` : ''}`.trim(),
          rawPayload: r.rawPayload,
        })),
        total: countRes[0]?.count ?? 0,
      };
    }
    case 'rest_mode_period': {
      const where = likePattern
        ? or(ilike(ouraRestModePeriod.startDay, likePattern), ilike(ouraRestModePeriod.id, likePattern))
        : undefined;
      const [rows, countRes] = await Promise.all([
        db
          .select()
          .from(ouraRestModePeriod)
          .where(where)
          .orderBy(desc(ouraRestModePeriod.startDay))
          .limit(pageSize)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(ouraRestModePeriod).where(where),
      ]);
      return {
        rows: rows.map((r) => ({
          id: r.id,
          day: r.startDay,
          preview: `${r.startDay} -> ${r.endDay ?? 'ongoing'} (${r.episodes.length} episodes)`,
          rawPayload: r.rawPayload,
        })),
        total: countRes[0]?.count ?? 0,
      };
    }
    case 'heartrate': {
      const where = likePattern
        ? or(ilike(ouraHeartrate.timestamp, likePattern), ilike(ouraHeartrate.source, likePattern))
        : undefined;
      const [rows, countRes] = await Promise.all([
        db
          .select()
          .from(ouraHeartrate)
          .where(where)
          .orderBy(desc(ouraHeartrate.timestampUnix))
          .limit(pageSize)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(ouraHeartrate).where(where),
      ]);
      return {
        rows: rows.map((r) => ({
          id: `${r.timestampUnix}-${r.source}`,
          day: r.timestamp.slice(0, 10),
          preview: `${r.bpm} bpm · source: ${r.source} · ${r.timestamp}`,
          rawPayload: r.rawPayload,
        })),
        total: countRes[0]?.count ?? 0,
      };
    }
    case 'ring_battery_level': {
      const where = likePattern
        ? ilike(ouraRingBatteryLevel.timestamp, likePattern)
        : undefined;
      const [rows, countRes] = await Promise.all([
        db
          .select()
          .from(ouraRingBatteryLevel)
          .where(where)
          .orderBy(desc(ouraRingBatteryLevel.timestampUnix))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(ouraRingBatteryLevel)
          .where(where),
      ]);
      return {
        rows: rows.map((r) => ({
          id: String(r.timestampUnix),
          day: r.timestamp.slice(0, 10),
          preview: `${r.level}% · charging: ${r.charging ? 'yes' : 'no'} · ${r.timestamp}`,
          rawPayload: r.rawPayload,
        })),
        total: countRes[0]?.count ?? 0,
      };
    }
  }
}

export async function getBriefingsPageData() {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(aiBriefings)
      .orderBy(desc(aiBriefings.createdAt))
      .limit(25);
    return {
      dbReady: true,
      briefings: rows.map((b) => ({
        id: b.id,
        periodStart: b.periodStart,
        periodEnd: b.periodEnd,
        summaryMarkdown: b.summaryMarkdown,
        metricsSnapshot: b.metricsSnapshot,
        createdAt: b.createdAt.toISOString(),
      })),
    };
  } catch {
    return { dbReady: false, briefings: [] };
  }
}

export async function getSettingsPageData() {
  try {
    const db = getDb();
    const [tokenRows, subs, logs, counts] = await Promise.all([
      db.select().from(ouraOauthTokens).where(eq(ouraOauthTokens.id, 1)).limit(1),
      db
        .select()
        .from(webhookSubscriptions)
        .orderBy(webhookSubscriptions.dataType, webhookSubscriptions.eventType),
      db.select().from(syncLogs).orderBy(desc(syncLogs.createdAt)).limit(50),
      Promise.all([
        db.select({ c: sql<number>`count(*)::int` }).from(ouraPersonalInfo),
        db.select({ c: sql<number>`count(*)::int` }).from(ouraRingConfiguration),
        db.select({ c: sql<number>`count(*)::int` }).from(ouraDailyReadiness),
        db.select({ c: sql<number>`count(*)::int` }).from(ouraDailySleep),
        db.select({ c: sql<number>`count(*)::int` }).from(ouraSleep),
        db.select({ c: sql<number>`count(*)::int` }).from(ouraSleepTime),
        db.select({ c: sql<number>`count(*)::int` }).from(ouraDailyActivity),
        db.select({ c: sql<number>`count(*)::int` }).from(ouraDailyStress),
        db.select({ c: sql<number>`count(*)::int` }).from(ouraDailyResilience),
        db.select({ c: sql<number>`count(*)::int` }).from(ouraDailySpo2),
        db.select({ c: sql<number>`count(*)::int` }).from(ouraDailyCardiovascularAge),
        db.select({ c: sql<number>`count(*)::int` }).from(ouraVo2Max),
        db.select({ c: sql<number>`count(*)::int` }).from(ouraWorkout),
        db.select({ c: sql<number>`count(*)::int` }).from(ouraSession),
        db.select({ c: sql<number>`count(*)::int` }).from(ouraEnhancedTag),
        db.select({ c: sql<number>`count(*)::int` }).from(ouraTag),
        db.select({ c: sql<number>`count(*)::int` }).from(ouraRestModePeriod),
        db.select({ c: sql<number>`count(*)::int` }).from(ouraHeartrate),
        db.select({ c: sql<number>`count(*)::int` }).from(ouraRingBatteryLevel),
        db.select({ c: sql<number>`count(*)::int` }).from(medLogs),
        db.select({ c: sql<number>`count(*)::int` }).from(dailyTaskMetrics),
      ]),
    ]);

    const token = tokenRows[0] ?? null;

    const tableCounts: Array<{ name: string; count: number }> = ALL_OURA_ENDPOINTS.map(
      (endpoint, idx) => ({
        name: endpoint,
        count: counts[idx][0]?.c ?? 0,
      }),
    );
    tableCounts.push(
      { name: 'med_logs', count: counts[19][0]?.c ?? 0 },
      { name: 'daily_task_metrics', count: counts[20][0]?.c ?? 0 },
    );

    return {
      dbReady: true,
      oauth: token
        ? {
            connected: true,
            expiresAt: token.expiresAt.toISOString(),
            scopes: token.scopes,
            updatedAt: token.updatedAt.toISOString(),
          }
        : {
            connected: false,
            expiresAt: null,
            scopes: null,
            updatedAt: null,
          },
      subscriptions: subs.map((s) => ({
        id: s.id,
        dataType: s.dataType,
        eventType: s.eventType,
        expirationTime: s.expirationTime.toISOString(),
        callbackUrl: s.callbackUrl,
      })),
      syncLogs: logs.map((l) => ({
        id: l.id,
        source: l.source,
        dataType: l.dataType,
        eventType: l.eventType,
        objectId: l.objectId,
        statusCode: l.statusCode,
        recordsProcessed: l.recordsProcessed,
        errorMessage: l.errorMessage,
        createdAt: l.createdAt.toISOString(),
      })),
      tableCounts,
    };
  } catch {
    return {
      dbReady: false,
      oauth: { connected: false, expiresAt: null, scopes: null, updatedAt: null },
      subscriptions: [],
      syncLogs: [],
      tableCounts: [],
    };
  }
}
