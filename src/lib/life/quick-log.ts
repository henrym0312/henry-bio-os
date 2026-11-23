import crypto from 'node:crypto';
import { eq, gte } from 'drizzle-orm';
import { getDb } from '@/db';
import { lifeCaffeineLogs, lifeSubjectiveDaily } from '@/db/schema';
import {
  CAFFEINE_MAX_WINDOW_HOURS,
  computeBedtimeCaffeine,
} from '@/lib/analytics/caffeine-pk';
import { toLondonDay } from '@/lib/life/helpers';

export interface QuickLogInitialState {
  todayDay: string;
  caffeine: {
    todayTotalMg: number;
    bedtimeEstimatedMg: number;
    todayEntriesCount: number;
    recentEntries: Array<{
      id: string;
      mg: number;
      source: string;
      takenAtIso: string;
    }>;
  };
  checkIn: {
    loggedToday: boolean;
    energy: number;
    mentalFocus: number;
    moodCalm: number;
    socialBandwidth: number;
    notes: string;
    updatedAtIso: string | null;
  };
}

export async function getCaffeineSummaryForToday(now = new Date()) {
  const db = getDb();
  const todayDay = toLondonDay(now);
  const windowStart = new Date(
    now.getTime() - CAFFEINE_MAX_WINDOW_HOURS * 3_600_000,
  );

  const [todayRows, recentRows] = await Promise.all([
    db
      .select({
        id: lifeCaffeineLogs.id,
        mg: lifeCaffeineLogs.mg,
        source: lifeCaffeineLogs.source,
        takenAt: lifeCaffeineLogs.takenAt,
      })
      .from(lifeCaffeineLogs)
      .where(eq(lifeCaffeineLogs.day, todayDay)),
    db
      .select({
        mg: lifeCaffeineLogs.mg,
        takenAt: lifeCaffeineLogs.takenAt,
      })
      .from(lifeCaffeineLogs)
      .where(gte(lifeCaffeineLogs.takenAt, windowStart)),
  ]);

  const todayTotalMg = todayRows.reduce((sum, r) => sum + r.mg, 0);
  const bedtimeEstimatedMg = computeBedtimeCaffeine(recentRows, null, now);
  const sortedEntries = [...todayRows].sort(
    (a, b) => b.takenAt.getTime() - a.takenAt.getTime(),
  );

  return {
    todayDay,
    todayTotalMg,
    bedtimeEstimatedMg,
    todayEntriesCount: todayRows.length,
    recentEntries: sortedEntries.slice(0, 6).map((e) => ({
      id: e.id,
      mg: e.mg,
      source: e.source,
      takenAtIso: e.takenAt.toISOString(),
    })),
  };
}

export async function getQuickLogInitialState(): Promise<QuickLogInitialState> {
  const now = new Date();
  const db = getDb();
  const todayDay = toLondonDay(now);

  const [caffeine, checkInRows] = await Promise.all([
    getCaffeineSummaryForToday(now),
    db
      .select()
      .from(lifeSubjectiveDaily)
      .where(eq(lifeSubjectiveDaily.day, todayDay))
      .limit(1),
  ]);

  const existing = checkInRows[0] ?? null;

  return {
    todayDay,
    caffeine: {
      todayTotalMg: caffeine.todayTotalMg,
      bedtimeEstimatedMg: caffeine.bedtimeEstimatedMg,
      todayEntriesCount: caffeine.todayEntriesCount,
      recentEntries: caffeine.recentEntries,
    },
    checkIn: existing
      ? {
          loggedToday: true,
          energy: existing.energy,
          mentalFocus: existing.mentalFocus,
          moodCalm: existing.moodCalm,
          socialBandwidth: existing.socialBandwidth,
          notes: existing.notes ?? '',
          updatedAtIso: existing.updatedAt.toISOString(),
        }
      : {
          loggedToday: false,
          energy: 7,
          mentalFocus: 7,
          moodCalm: 7,
          socialBandwidth: 1,
          notes: '',
          updatedAtIso: null,
        },
  };
}

export function buildCaffeineEntryId(now: Date, mg: number, source: string): string {
  const rand = crypto.randomBytes(4).toString('hex');
  const digest = crypto
    .createHash('sha256')
    .update(`${now.toISOString()}|${mg}|${source}|${rand}`)
    .digest('hex')
    .slice(0, 20);
  return `caf_${digest}`;
}
