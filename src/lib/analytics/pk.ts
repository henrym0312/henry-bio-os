export type MedDrugType = 'LDX' | 'IR';
export type KnownDoseId = 'elvanse_40' | 'elvanse_30' | 'amfexa_10';

export interface PkDrugParams {
  doseId: string;
  label: string;
  drugType: MedDrugType;
  mg: number;
  ka: number; // Absorption rate constant (1/h)
  ke: number; // Elimination rate constant (1/h)
  scale: number; // Bioavailability & distribution scaling factor (ng/mL)
}

export const PK_FORMULATIONS: Record<KnownDoseId, PkDrugParams> = {
  elvanse_40: {
    doseId: 'elvanse_40',
    label: 'Elvanse 40 mg (LDX)',
    drugType: 'LDX',
    mg: 40,
    ka: 0.75,
    ke: 0.068,
    scale: 40 * 1.68,
  },
  elvanse_30: {
    doseId: 'elvanse_30',
    label: 'Elvanse 30 mg (LDX)',
    drugType: 'LDX',
    mg: 30,
    ka: 0.75,
    ke: 0.068,
    scale: 30 * 1.68,
  },
  amfexa_10: {
    doseId: 'amfexa_10',
    label: 'Amfexa 10 mg (IR)',
    drugType: 'IR',
    mg: 10,
    ka: 1.85,
    ke: 0.068,
    scale: 10 * 3.42,
  },
};

export interface MedDoseInput {
  id?: string;
  doseId: string;
  drugType: string;
  mg: number;
  takenAt: Date | string;
  day?: string;
}

export interface BedtimePkSummary {
  bedtimeSerumNgMl: number;
  hoursSinceLastDose: number | null;
  totalDailyMg: number;
  lastDoseLabel: string | null;
  lastDoseAt: string | null;
  activeDoses: Array<{
    doseId: string;
    drugType: MedDrugType;
    mg: number;
    takenAt: string;
    hoursElapsed: number;
    contributionNgMl: number;
  }>;
}

export function resolvePkParams(
  doseId: string,
  drugType?: string,
  mg?: number,
): PkDrugParams {
  if (doseId in PK_FORMULATIONS) {
    return PK_FORMULATIONS[doseId as KnownDoseId];
  }

  const resolvedType: MedDrugType = drugType === 'IR' ? 'IR' : 'LDX';
  const resolvedMg = typeof mg === 'number' && mg > 0 ? mg : 10;

  if (resolvedType === 'IR') {
    return {
      doseId,
      label: `${doseId} (${resolvedMg} mg IR)`,
      drugType: 'IR',
      mg: resolvedMg,
      ka: 1.85,
      ke: 0.068,
      scale: resolvedMg * 3.42,
    };
  }

  return {
    doseId,
    label: `${doseId} (${resolvedMg} mg LDX)`,
    drugType: 'LDX',
    mg: resolvedMg,
    ka: 0.75,
    ke: 0.068,
    scale: resolvedMg * 1.68,
  };
}

/**
 * One-compartment Bateman oral absorption / first-order elimination model:
 * C(t) = scale * (ka / (ka - ke)) * (exp(-ke * t) - exp(-ka * t))
 */
export function computeSingleDoseConcentration(
  dtHours: number,
  params: Pick<PkDrugParams, 'ka' | 'ke' | 'scale'>,
): number {
  if (!Number.isFinite(dtHours) || dtHours <= 0 || dtHours > 72) {
    return 0;
  }

  const { ka, ke, scale } = params;
  if (Math.abs(ka - ke) < 1e-9) {
    return Math.max(0, scale * ke * dtHours * Math.exp(-ke * dtHours));
  }

  const conc =
    scale * (ka / (ka - ke)) * (Math.exp(-ke * dtHours) - Math.exp(-ka * dtHours));
  return Math.max(0, conc);
}

/**
 * Computes total estimated serum concentration (ng/mL) at `targetTime` via linear superposition.
 */
export function computeSerumConcentrationAt(
  targetTime: Date,
  doses: MedDoseInput[],
): number {
  const targetMs = targetTime.getTime();
  if (Number.isNaN(targetMs) || doses.length === 0) return 0;

  let total = 0;
  for (const dose of doses) {
    const takenMs =
      dose.takenAt instanceof Date
        ? dose.takenAt.getTime()
        : Date.parse(dose.takenAt);
    if (Number.isNaN(takenMs)) continue;

    const dtHours = (targetMs - takenMs) / 3_600_000;
    if (dtHours <= 0 || dtHours > 72) continue;

    const params = resolvePkParams(dose.doseId, dose.drugType, dose.mg);
    total += computeSingleDoseConcentration(dtHours, params);
  }

  return Math.round(total * 100) / 100;
}

/**
 * Joins a sleep period's `bedtimeStart` timestamp against medication logs to produce
 * `bedtime_serum_ng_ml`, `hours_since_last_dose`, and per-dose contribution breakdown.
 */
export function computeBedtimePkForNight(
  bedtimeStartIso: string,
  doses: MedDoseInput[],
): BedtimePkSummary {
  const bedtime = new Date(bedtimeStartIso);
  const bedtimeMs = bedtime.getTime();

  if (Number.isNaN(bedtimeMs) || doses.length === 0) {
    return {
      bedtimeSerumNgMl: 0,
      hoursSinceLastDose: null,
      totalDailyMg: 0,
      lastDoseLabel: null,
      lastDoseAt: null,
      activeDoses: [],
    };
  }

  let totalSerum = 0;
  let totalDailyMg = 0;
  let minHoursSinceLast: number | null = null;
  let lastDoseLabel: string | null = null;
  let lastDoseAt: string | null = null;

  const activeDoses: BedtimePkSummary['activeDoses'] = [];

  for (const dose of doses) {
    const takenDate =
      dose.takenAt instanceof Date ? dose.takenAt : new Date(dose.takenAt);
    const takenMs = takenDate.getTime();
    if (Number.isNaN(takenMs)) continue;

    const dtHours = (bedtimeMs - takenMs) / 3_600_000;
    if (dtHours <= 0 || dtHours > 72) continue;

    const params = resolvePkParams(dose.doseId, dose.drugType, dose.mg);
    const contribution = computeSingleDoseConcentration(dtHours, params);

    totalSerum += contribution;
    if (dtHours <= 24) {
      totalDailyMg += params.mg;
    }

    if (minHoursSinceLast === null || dtHours < minHoursSinceLast) {
      minHoursSinceLast = dtHours;
      lastDoseLabel = params.label;
      lastDoseAt = takenDate.toISOString();
    }

    activeDoses.push({
      doseId: dose.doseId,
      drugType: params.drugType,
      mg: params.mg,
      takenAt: takenDate.toISOString(),
      hoursElapsed: Math.round(dtHours * 100) / 100,
      contributionNgMl: Math.round(contribution * 100) / 100,
    });
  }

  activeDoses.sort((a, b) => a.hoursElapsed - b.hoursElapsed);

  return {
    bedtimeSerumNgMl: Math.round(totalSerum * 100) / 100,
    hoursSinceLastDose:
      minHoursSinceLast !== null ? Math.round(minHoursSinceLast * 100) / 100 : null,
    totalDailyMg: Math.round(totalDailyMg * 10) / 10,
    lastDoseLabel,
    lastDoseAt,
    activeDoses,
  };
}

/**
 * Generates a uniform-interval serum concentration curve across any start/end window.
 */
export function generatePkCurve(
  startTime: Date,
  endTime: Date,
  stepMinutes: number,
  doses: MedDoseInput[],
): Array<{ timestamp: string; elapsedMinutes: number; serumNgMl: number }> {
  const startMs = startTime.getTime();
  const endMs = endTime.getTime();
  if (
    Number.isNaN(startMs) ||
    Number.isNaN(endMs) ||
    startMs > endMs ||
    stepMinutes <= 0
  ) {
    return [];
  }

  const points: Array<{ timestamp: string; elapsedMinutes: number; serumNgMl: number }> = [];
  const stepMs = stepMinutes * 60_000;

  for (let t = startMs; t <= endMs; t += stepMs) {
    const dt = new Date(t);
    points.push({
      timestamp: dt.toISOString(),
      elapsedMinutes: Math.round((t - startMs) / 60_000),
      serumNgMl: computeSerumConcentrationAt(dt, doses),
    });
  }

  return points;
}
