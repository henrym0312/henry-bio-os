import { getLondonWallTimeOnDay } from '@/lib/life/helpers';

export const CAFFEINE_HALF_LIFE_HOURS = 5;
export const CAFFEINE_MAX_WINDOW_HOURS = 36;

export interface CaffeineDoseInput {
  mg: number;
  takenAt: Date | string;
}

/**
 * Computes remaining caffeine (mg) at targetDate using a 5-hour half-life
 * decay model across doses taken prior to targetDate within 36 hours.
 */
export function computeCaffeineAt(
  doses: CaffeineDoseInput[],
  targetDate: Date,
): number {
  const targetMs = targetDate.getTime();
  if (Number.isNaN(targetMs) || doses.length === 0) return 0;

  let total = 0;
  for (const dose of doses) {
    if (!Number.isFinite(dose.mg) || dose.mg <= 0) continue;

    const takenMs =
      dose.takenAt instanceof Date
        ? dose.takenAt.getTime()
        : Date.parse(dose.takenAt);
    if (Number.isNaN(takenMs)) continue;

    const dtHours = (targetMs - takenMs) / 3_600_000;
    if (dtHours < 0 || dtHours > CAFFEINE_MAX_WINDOW_HOURS) continue;

    total += dose.mg * Math.pow(0.5, dtHours / CAFFEINE_HALF_LIFE_HOURS);
  }

  return Math.round(total * 100) / 100;
}

/**
 * Estimates remaining caffeine (mg) at bedtimeDate, defaulting to 23:00
 * Europe/London on the day of referenceDate (or today) when unavailable.
 */
export function computeBedtimeCaffeine(
  doses: CaffeineDoseInput[],
  bedtimeDate?: Date | null,
  referenceDate?: Date,
): number {
  const resolvedBedtime =
    bedtimeDate && !Number.isNaN(bedtimeDate.getTime())
      ? bedtimeDate
      : getLondonWallTimeOnDay(referenceDate ?? new Date(), 23, 0);

  return computeCaffeineAt(doses, resolvedBedtime);
}
