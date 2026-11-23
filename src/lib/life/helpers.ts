export type SpendCategory =
  | 'groceries'
  | 'takeaway_convenience'
  | 'coffee'
  | 'social_pubs'
  | 'retail'
  | 'transport'
  | 'bills'
  | 'other';

export const SPEND_CATEGORIES: readonly SpendCategory[] = [
  'groceries',
  'takeaway_convenience',
  'coffee',
  'social_pubs',
  'retail',
  'transport',
  'bills',
  'other',
] as const;

export interface LondonDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const londonPartsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function getLondonParts(date: Date): LondonDateParts {
  const parts = londonPartsFormatter.formatToParts(date);
  const lookup = (type: Intl.DateTimeFormatPartTypes): number => {
    const raw = parts.find((p) => p.type === type)?.value ?? '0';
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  return {
    year: lookup('year'),
    month: lookup('month'),
    day: lookup('day'),
    hour: lookup('hour') % 24,
    minute: lookup('minute'),
    second: lookup('second'),
  };
}

function formatIsoCalendarDay(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Returns the YYYY-MM-DD calendar day in Europe/London.
 * When shiftNightCutoffHour is supplied (e.g. 5 for 00:00-04:59),
 * timestamps before that London hour are assigned to the previous calendar day.
 */
export function toLondonDay(date: Date, shiftNightCutoffHour?: number): string {
  const { year, month, day, hour } = getLondonParts(date);

  if (
    typeof shiftNightCutoffHour === 'number' &&
    shiftNightCutoffHour > 0 &&
    hour >= 0 &&
    hour < shiftNightCutoffHour
  ) {
    return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
  }

  return formatIsoCalendarDay(year, month, day);
}

/**
 * Returns true if the Europe/London hour falls in the late-night window
 * [startHour, 23] or [0, 3] (default 21:00-03:59).
 */
export function isLondonLateHour(date: Date, startHour = 21): boolean {
  const { hour } = getLondonParts(date);
  return hour >= startHour || hour < 4;
}

/**
 * Resolves a UTC Date corresponding to a given HH:MM wall-clock time in Europe/London
 * on the London calendar day of referenceDate.
 */
export function getLondonWallTimeOnDay(
  referenceDate: Date,
  targetHour: number,
  targetMinute = 0,
): Date {
  const { year, month, day } = getLondonParts(referenceDate);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, targetHour, targetMinute, 0, 0));
  const actual = getLondonParts(utcGuess);
  const guessMinutes = targetHour * 60 + targetMinute;
  const actualMinutes = actual.hour * 60 + actual.minute;
  let diffMinutes = actualMinutes - guessMinutes;
  if (diffMinutes > 12 * 60) diffMinutes -= 24 * 60;
  if (diffMinutes < -12 * 60) diffMinutes += 24 * 60;
  return new Date(utcGuess.getTime() - diffMinutes * 60_000);
}

const TAKEAWAY_KEYWORDS = [
  'deliveroo',
  'uber eats',
  'ubereats',
  'just eat',
  'justeat',
  'dominos',
  "domino's",
  'mcdonalds',
  "mcdonald's",
  'kfc',
  'greggs',
  'subway',
  'nandos',
  "nando's",
  'chippy',
  'kebab',
];

const GROCERY_KEYWORDS = [
  'tesco',
  'sainsbury',
  'aldi',
  'lidl',
  'waitrose',
  'marks & spencer',
  'marks and spencer',
  'm&s food',
  'morrisons',
  'asda',
  'co-op',
  'coop',
  'iceland',
];

const COFFEE_KEYWORDS = [
  'pret',
  'costa',
  'starbucks',
  'nero',
  'coffee',
  'cafe',
  'espresso',
];

const SOCIAL_PUB_PATTERNS: RegExp[] = [
  /\bpub\b/,
  /\bbar\b/,
  /\bwetherspoon/,
  /\bbeech tree\b/,
  /\binn\b/,
  /\btavern\b/,
  /\bbrewery\b/,
  /\bclub\b/,
  /\bslug\b/,
  /\brevolution\b/,
];

const BILLS_KEYWORDS = [
  'vodafone',
  'smarty',
  'lebara',
  'netflix',
  'spotify',
  'icloud',
  'council',
  'energy',
  'octopus',
  'water',
];

const TRANSPORT_PATTERNS: RegExp[] = [
  /\buber\b/,
  /\btrainline\b/,
  /\blner\b/,
  /\btranspennine\b/,
  /\bnorthern rail\b/,
  /\bshell\b/,
  /\bbp\b/,
  /\besso\b/,
  /\btexaco\b/,
  /\bfuel\b/,
  /\bparking\b/,
  /\bhumber bridge\b/,
  /\btfl\b/,
];

const RETAIL_KEYWORDS = [
  'amazon',
  'apple',
  'argos',
  'boots',
  'zara',
  'uniqlo',
  'nike',
  'asos',
  'halfords',
  'b&q',
  'ikea',
];

export function categoriseUkMerchant(merchant: string): SpendCategory {
  const m = merchant.trim().toLowerCase().replace(/[*_]+/g, ' ').replace(/\s+/g, ' ');
  if (!m) return 'other';

  // Check takeaway before transport so "Uber Eats" is not misclassified as "Uber".
  if (TAKEAWAY_KEYWORDS.some((kw) => m.includes(kw))) {
    return 'takeaway_convenience';
  }
  if (GROCERY_KEYWORDS.some((kw) => m.includes(kw))) {
    return 'groceries';
  }
  if (COFFEE_KEYWORDS.some((kw) => m.includes(kw))) {
    return 'coffee';
  }
  if (SOCIAL_PUB_PATTERNS.some((re) => re.test(m))) {
    return 'social_pubs';
  }
  // Check bills before retail so "Apple iCloud" maps to bills rather than retail.
  if (BILLS_KEYWORDS.some((kw) => m.includes(kw))) {
    return 'bills';
  }
  if (TRANSPORT_PATTERNS.some((re) => re.test(m))) {
    return 'transport';
  }
  if (RETAIL_KEYWORDS.some((kw) => m.includes(kw))) {
    return 'retail';
  }

  return 'other';
}

export interface SupplementNutrients {
  creatineMg: number;
  ginkgoMg: number;
  ashwagandhaMg: number;
  vitaminDUg: number;
  multivitaminTaken: boolean;
  vitaminCMg: number;
  zincMg: number;
  magnesiumCitrateMg: number;
}

export function computeSupplementNutrients(
  amTaken: boolean,
  pmTaken: boolean,
): SupplementNutrients {
  return {
    creatineMg: (amTaken ? 500 : 0) + (pmTaken ? 500 : 0),
    ginkgoMg: amTaken ? 600 : 0,
    ashwagandhaMg: amTaken ? 500 : 0,
    vitaminDUg: amTaken ? 25 : 0,
    multivitaminTaken: pmTaken,
    vitaminCMg: pmTaken ? 600 : 0,
    zincMg: pmTaken ? 20 : 0,
    magnesiumCitrateMg: pmTaken ? 186 : 0,
  };
}
