'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  FlaskConical,
  Loader2,
  Plus,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  createExperimentAction,
  updateExperimentStatusAction,
} from '@/app/insights/actions';
import {
  formatCoverageDaysBadge,
  formatDayCountPhrase,
  formatOutcomeDelta,
  formatOutcomeValue,
  getOutcomeLabel,
  pluraliseUnit,
  selectHighlightCliffs,
  selectHighlightDrivers,
  type AnalyticsContrastItem,
  type AnalyticsDriverItem,
  type ConfidenceLabel,
  type EffectSizeLabel,
  type FeatureScope,
  type InsightsPayload,
  type SampleStageLabel,
  type StrengthBand,
} from '@/lib/analytics/insights-labels';
import { cn } from '@/lib/utils';

type ScopeFilter = 'behavioural' | 'environmental' | 'all';

const OUTCOME_FILTERS = [
  { key: 'all', label: 'All Outcomes' },
  { key: 'hrv_avg_ms', label: 'HRV (Recovery)' },
  { key: 'lowest_hr_bpm', label: 'Resting Heart Rate' },
  { key: 'deep_sleep_min', label: 'Deep Sleep' },
  { key: 'sleep_efficiency_pct', label: 'Sleep Efficiency' },
  { key: 'readiness_score', label: 'Readiness Score' },
  { key: 'mental_focus', label: 'Mental Focus' },
  { key: 'task_completion_rate', label: 'Task Completion' },
] as const;

const EXPERIMENT_OUTCOME_OPTIONS = [
  { key: 'hrv_avg_ms', label: 'HRV (Recovery)' },
  { key: 'lowest_hr_bpm', label: 'Resting Heart Rate' },
  { key: 'readiness_score', label: 'Readiness Score' },
  { key: 'deep_sleep_min', label: 'Deep Sleep' },
  { key: 'sleep_efficiency_pct', label: 'Sleep Efficiency' },
  { key: 'sleep_latency_min', label: 'Time to Fall Asleep' },
  { key: 'mental_focus', label: 'Mental Focus' },
  { key: 'task_completion_rate', label: 'Task Completion' },
] as const;

const FEATURE_KEY_OPTIONS = [
  { key: 'late_comms_count', label: 'Messages After 9pm' },
  { key: 'late_night_screen_mins', label: 'Late-Night Screen Time' },
  { key: 'spend_social_pubs_gbp', label: 'Pub & Social Spending' },
  { key: 'am_pills_taken', label: 'AM Supplements' },
  { key: 'pm_pills_taken', label: 'PM Supplements' },
  { key: 'creatine_mg', label: 'Daily Creatine' },
  { key: 'time_in_daylight_mins', label: 'Time Outside in Daylight' },
  { key: 'bedtime_caffeine_mg', label: 'Caffeine Left at Bedtime' },
  { key: 'workout_mins', label: 'Exercise Time' },
  { key: 'tv_late_mins', label: 'Late-Night TV Time' },
  { key: 'alcohol_units', label: 'Alcohol Units' },
  { key: 'imessages_total', label: 'Total iMessages' },
] as const;

interface ExperimentPreset {
  label: string;
  name: string;
  hypothesis: string;
  featureKey: string;
  targetOutcomes: string[];
}

const EXPERIMENT_PRESETS: ExperimentPreset[] = [
  {
    label: 'Cap Messages After 9pm (<= 10)',
    name: 'Cap Messages After 9pm (<= 10)',
    hypothesis:
      'Keeping messaging and email activity after 9pm to 10 messages or fewer lowers evening alertness before bed, helping overnight HRV recovery and resting heart rate.',
    featureKey: 'late_comms_count',
    targetOutcomes: ['hrv_avg_ms', 'lowest_hr_bpm', 'readiness_score'],
  },
  {
    label: 'No Screens After 10pm',
    name: 'No Screens After 10pm',
    hypothesis:
      'Avoiding Mac and iPhone screen use after 10pm increases deep sleep duration, sleep efficiency, and next-morning readiness.',
    featureKey: 'late_night_screen_mins',
    targetOutcomes: ['hrv_avg_ms', 'deep_sleep_min', 'sleep_efficiency_pct'],
  },
  {
    label: 'Consistent AM & PM Supplements',
    name: 'Consistent AM & PM Supplements',
    hypothesis:
      'Taking both morning and evening supplements without missed days steadies readiness scores and overnight recovery.',
    featureKey: 'am_pills_taken',
    targetOutcomes: ['readiness_score', 'hrv_avg_ms', 'deep_sleep_min'],
  },
  {
    label: '25m+ Outdoor Daylight',
    name: '25m+ Outdoor Daylight',
    hypothesis:
      'Spending at least 25 minutes outdoors in daylight anchors circadian timing, helping sleep onset and next-day readiness.',
    featureKey: 'time_in_daylight_mins',
    targetOutcomes: ['hrv_avg_ms', 'sleep_latency_min', 'readiness_score'],
  },
];

function formatLondonTimestamp(iso: string | null): string {
  if (!iso) return 'Not yet run';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return `${new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(dt)} London`;
}

function formatPValue(val: number | null): string {
  if (val === null || !Number.isFinite(val)) return 'n/a';
  if (val <= 0 || val < 0.000001) return '< 0.000001';
  if (val < 0.0001) return val.toFixed(6);
  if (val < 0.01) return val.toFixed(4);
  return val.toFixed(3);
}

function formatSigned(val: number, decimals = 3): string {
  const fixed = val.toFixed(decimals);
  return val > 0 ? `+${fixed}` : fixed;
}

function todayLondonIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDaysIso(dayIso: string, deltaDays: number): string {
  const dt = new Date(`${dayIso}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

function confidenceBadgeStyle(label: ConfidenceLabel): string {
  if (label === 'High Confidence') {
    return 'bg-[#30D158]/15 text-[#30D158] border-[#30D158]/30';
  }
  if (label === 'Moderate Confidence') {
    return 'bg-[#0A84FF]/15 text-[#0A84FF] border-[#0A84FF]/30';
  }
  return 'bg-[#141416] text-[#8E8E93] border-white/[0.08]';
}

function sampleStageBadgeStyle(stage: SampleStageLabel): string {
  if (stage === 'Early (<45d)') {
    return 'bg-[#FF9F0A]/15 text-[#FF9F0A] border-[#FF9F0A]/30';
  }
  if (stage === 'Building') {
    return 'bg-[#0A84FF]/10 text-[#0A84FF] border-[#0A84FF]/25';
  }
  return 'bg-[#141416] text-[#8E8E93] border-white/[0.08]';
}

function strengthBadgeStyle(strength: StrengthBand, positive: boolean): string {
  if (strength === 'Strong') {
    return positive
      ? 'bg-[#30D158]/15 text-[#30D158] border-[#30D158]/30'
      : 'bg-[#FF453A]/15 text-[#FF453A] border-[#FF453A]/30';
  }
  if (strength === 'Moderate') {
    return 'bg-[#FF9F0A]/15 text-[#FF9F0A] border-[#FF9F0A]/30';
  }
  return 'bg-[#141416] text-[#D1D1D6] border-white/[0.08]';
}

function impactSizeBadgeStyle(label: EffectSizeLabel): string {
  if (label === 'Very Large') {
    return 'bg-[#0A84FF]/15 text-[#0A84FF] border-[#0A84FF]/30';
  }
  if (label === 'Large') {
    return 'bg-[#30D158]/15 text-[#30D158] border-[#30D158]/30';
  }
  return 'bg-[#1C1C1E] text-[#D1D1D6] border-white/[0.08]';
}

function contrastScopeBadge(scope: FeatureScope): string {
  return scope === 'environmental' ? 'Seasonal' : 'Habit';
}

function buildTrialDefaults(input: {
  featureKey: string;
  featureLabel: string;
  outcomeKey: string;
  outcomeLabel: string;
  comparisonLabel?: string;
}): {
  name: string;
  hypothesis: string;
  featureKey: string;
  targetOutcomes: string[];
} {
  if (input.featureKey === 'late_comms_count') {
    return {
      name: 'Cap Messages After 9pm (<= 10)',
      hypothesis:
        'Keeping evening messages after 9pm at 10 or fewer will protect overnight HRV (Recovery) and lower Resting Heart Rate.',
      featureKey: input.featureKey,
      targetOutcomes: ['hrv_avg_ms', 'lowest_hr_bpm', 'readiness_score'],
    };
  }
  if (input.featureKey === 'spend_social_pubs_gbp') {
    return {
      name: 'Zero Pub & Social Spend Weekdays',
      hypothesis: `Eliminating weekday pub and social outings for 14 days will lower Resting Heart Rate and lift next-day ${input.outcomeLabel}.`,
      featureKey: input.featureKey,
      targetOutcomes: ['lowest_hr_bpm', 'readiness_score', 'hrv_avg_ms'],
    };
  }
  if (input.featureKey === 'late_night_screen_mins') {
    return {
      name: 'No Screens After 10pm',
      hypothesis: `Capping late-night screen time to 30 mins or less will improve ${input.outcomeLabel} and deep sleep consistency.`,
      featureKey: input.featureKey,
      targetOutcomes: ['hrv_avg_ms', 'deep_sleep_min', 'sleep_efficiency_pct'],
    };
  }
  return {
    name: `14-Day ${input.featureLabel} Test`,
    hypothesis: input.comparisonLabel
      ? `Testing ${input.featureLabel} (${input.comparisonLabel}) over 14 days to verify its direct effect on ${input.outcomeLabel}.`
      : `Modifying ${input.featureLabel} for 14 days against baseline to test its effect on ${input.outcomeLabel}.`,
    featureKey: input.featureKey,
    targetOutcomes: [input.outcomeKey],
  };
}

function DriverCard({
  driver,
  variant,
  showScopeTag,
  showTechnicalStats,
  onStartTrial,
}: {
  driver: AnalyticsDriverItem;
  variant: 'positive' | 'negative';
  showScopeTag: boolean;
  showTechnicalStats: boolean;
  onStartTrial: (driver: AnalyticsDriverItem) => void;
}) {
  const isPositive = variant === 'positive';

  return (
    <div className="rounded-lg bg-[#1C1C1E]/75 border border-white/[0.08] p-3.5 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#F5F5F7]">
            {driver.featureLabel}
          </div>
          <div className="text-xs text-[#8E8E93] mt-0.5">
            Outcome: <span className="text-[#D1D1D6]">{driver.outcomeLabel}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1 shrink-0">
          {showScopeTag && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#141416] border border-white/[0.08] text-[#8E8E93]">
              {driver.scope === 'environmental' ? 'Weather' : 'Habit'}
            </span>
          )}
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#0A84FF]/15 text-[#0A84FF] border border-[#0A84FF]/25 whitespace-nowrap">
            {driver.lagLabel}
          </span>
        </div>
      </div>

      <p className="text-xs text-[#D1D1D6] leading-relaxed">
        {driver.takeawayText}
      </p>

      {driver.observationalCaveat && (
        <div className="rounded-md bg-[#FF9F0A]/10 border border-[#FF9F0A]/25 px-2.5 py-1.5 text-[11px] text-[#FF9F0A]">
          {driver.observationalCaveat}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.06] text-[11px]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              'px-2 py-0.5 rounded-full border font-medium whitespace-nowrap',
              strengthBadgeStyle(driver.strengthLabel, isPositive),
            )}
          >
            {driver.strengthLabel}
          </span>
          <span
            className={cn(
              'px-2 py-0.5 rounded-full border font-medium whitespace-nowrap',
              confidenceBadgeStyle(driver.confidenceLabel),
            )}
          >
            {driver.confidenceLabel}
          </span>
          {driver.isEarlySample && (
            <span
              className={cn(
                'px-2 py-0.5 rounded-full border font-medium whitespace-nowrap',
                sampleStageBadgeStyle(driver.sampleStage),
              )}
            >
              {driver.sampleStage}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <span className="text-[#8E8E93] font-mono whitespace-nowrap">
            Based on {formatDayCountPhrase(driver.sampleN)}
          </span>
          {driver.scope === 'behavioural' && (
            <button
              type="button"
              onClick={() => onStartTrial(driver)}
              className="px-2 py-0.5 rounded bg-[#0A84FF]/15 text-[#0A84FF] border border-[#0A84FF]/30 hover:bg-[#0A84FF]/25 text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer"
            >
              Start 14-Day Trial
            </button>
          )}
        </div>
      </div>

      {showTechnicalStats && (
        <div className="pt-1.5 border-t border-white/[0.06] text-[11px] font-mono text-[#8E8E93] flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>r = {formatSigned(driver.spearmanR, 3)}</span>
          <span>p = {formatPValue(driver.pValue)}</span>
          {driver.fdrQValue !== null && (
            <span>FDR q = {formatPValue(driver.fdrQValue)}</span>
          )}
          {driver.marginalEffect !== null && (
            <span>RidgeCV = {formatSigned(driver.marginalEffect, 3)}</span>
          )}
          <span>n = {driver.sampleN}</span>
        </div>
      )}
    </div>
  );
}

export function InsightsDashboard({
  initialData,
}: {
  initialData: InsightsPayload;
}) {
  const router = useRouter();
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('behavioural');
  const [uniqueHabitsOnly, setUniqueHabitsOnly] = useState(true);
  const [showTechnicalStats, setShowTechnicalStats] = useState(false);
  const [showAllPositive, setShowAllPositive] = useState(false);
  const [showAllNegative, setShowAllNegative] = useState(false);
  const [showAllCliffs, setShowAllCliffs] = useState(false);
  const [contrastScope, setContrastScope] = useState<'all' | 'behavioural' | 'environmental'>('all');

  const [formOpen, setFormOpen] = useState(false);
  const [expPending, startExpTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const defaultStart = useMemo(() => todayLondonIso(), []);
  const [expName, setExpName] = useState(EXPERIMENT_PRESETS[0].name);
  const [expHypothesis, setExpHypothesis] = useState(EXPERIMENT_PRESETS[0].hypothesis);
  const [expFeatureKey, setExpFeatureKey] = useState(EXPERIMENT_PRESETS[0].featureKey);
  const [expOutcomes, setExpOutcomes] = useState<string[]>(
    EXPERIMENT_PRESETS[0].targetOutcomes,
  );
  const [expStartDay, setExpStartDay] = useState(defaultStart);
  const [expEndDay, setExpEndDay] = useState(() => addDaysIso(defaultStart, 13));
  const [expBaselineDays, setExpBaselineDays] = useState(21);

  const filteredDrivers = useMemo(() => {
    return initialData.drivers.filter((d) => {
      if (scopeFilter !== 'all' && d.scope !== scopeFilter) return false;
      if (outcomeFilter !== 'all' && d.outcomeKey !== outcomeFilter) return false;
      return true;
    });
  }, [initialData.drivers, scopeFilter, outcomeFilter]);

  const positiveDrivers = useMemo(
    () => filteredDrivers.filter((d) => d.isPositiveEligible),
    [filteredDrivers],
  );
  const negativeDrivers = useMemo(
    () => filteredDrivers.filter((d) => d.beneficialDirection === 'detrimental'),
    [filteredDrivers],
  );

  const visiblePositiveDrivers = useMemo(
    () =>
      showAllPositive
        ? selectHighlightDrivers(positiveDrivers, positiveDrivers.length, false)
        : selectHighlightDrivers(positiveDrivers, 5, uniqueHabitsOnly),
    [positiveDrivers, showAllPositive, uniqueHabitsOnly],
  );

  const visibleNegativeDrivers = useMemo(
    () =>
      showAllNegative
        ? selectHighlightDrivers(negativeDrivers, negativeDrivers.length, false)
        : selectHighlightDrivers(negativeDrivers, 5, uniqueHabitsOnly),
    [negativeDrivers, showAllNegative, uniqueHabitsOnly],
  );

  const sortedCliffs = useMemo(() => {
    const base = initialData.thresholdCliffs.filter((c) => {
      if (outcomeFilter !== 'all' && c.outcomeKey !== outcomeFilter) return false;
      if (scopeFilter === 'environmental') return c.scope === 'environmental';
      return true;
    });
    return [...base].sort((a, b) => {
      if (a.scope !== b.scope) {
        return a.scope === 'behavioural' ? -1 : 1;
      }
      return a.pValue - b.pValue || Math.abs(b.medianDelta) - Math.abs(a.medianDelta);
    });
  }, [initialData.thresholdCliffs, outcomeFilter, scopeFilter]);

  const visibleCliffs = useMemo(
    () =>
      showAllCliffs
        ? sortedCliffs
        : selectHighlightCliffs(sortedCliffs, 6, uniqueHabitsOnly),
    [sortedCliffs, showAllCliffs, uniqueHabitsOnly],
  );

  const filteredContrasts = useMemo<AnalyticsContrastItem[]>(() => {
    if (contrastScope === 'all') return initialData.groupContrasts;
    return initialData.groupContrasts.filter((c) => c.scope === contrastScope);
  }, [initialData.groupContrasts, contrastScope]);

  const openTrialFormWith = (suggestion: {
    name: string;
    hypothesis: string;
    featureKey: string;
    targetOutcomes: string[];
  }) => {
    const today = todayLondonIso();
    setExpName(suggestion.name);
    setExpHypothesis(suggestion.hypothesis);
    setExpFeatureKey(suggestion.featureKey);
    setExpOutcomes(suggestion.targetOutcomes);
    setExpStartDay(today);
    setExpEndDay(addDaysIso(today, 13));
    setFormError(null);
    setFormSuccess(null);
    setFormOpen(true);
    if (typeof document !== 'undefined') {
      document
        .getElementById('experiments-section')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const applyPreset = (preset: ExperimentPreset) => {
    openTrialFormWith({
      name: preset.name,
      hypothesis: preset.hypothesis,
      featureKey: preset.featureKey,
      targetOutcomes: preset.targetOutcomes,
    });
  };

  const toggleOutcomeTarget = (key: string) => {
    setExpOutcomes((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );
  };

  const handleCreateExperiment = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (expOutcomes.length === 0) {
      setFormError('Select at least one target outcome.');
      return;
    }

    startExpTransition(async () => {
      const res = await createExperimentAction({
        name: expName,
        hypothesis: expHypothesis,
        featureKey: expFeatureKey,
        targetOutcomes: expOutcomes,
        startDay: expStartDay,
        endDay: expEndDay,
        baselineDays: expBaselineDays,
      });
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      setFormSuccess(`Started 14-day experiment: ${res.experiment.name}`);
      setFormOpen(false);
      router.refresh();
    });
  };

  const handleStatusChange = (
    id: number,
    status: 'completed' | 'cancelled',
  ) => {
    startExpTransition(async () => {
      await updateExperimentStatusAction({
        id,
        status,
        verdict:
          status === 'completed'
            ? 'Trial period closed manually; awaiting next morning analytics scoring.'
            : 'Trial cancelled manually.',
      });
      router.refresh();
    });
  };

  const { todayScoreboard, recentShift } = initialData;
  const pillsStatusText =
    todayScoreboard.amPillsTaken === null && todayScoreboard.pmPillsTaken === null
      ? 'Pending sync'
      : `AM ${todayScoreboard.amPillsTaken ? 'Done' : 'Pending'} / PM ${todayScoreboard.pmPillsTaken ? 'Done' : 'Pending'}`;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-[#0A84FF]" />
            <h1 className="text-xl font-semibold tracking-tight text-[#F5F5F7]">
              Life Insights &amp; Habits
            </h1>
          </div>
          <p className="text-xs text-[#8E8E93] mt-1">
            Updated {formatLondonTimestamp(initialData.latestRun?.ranAt ?? null)} · Rolling{' '}
            <span className="font-mono text-[#D1D1D6]">
              {initialData.latestRun?.windowDays ?? 120}-day
            </span>{' '}
            analysis across{' '}
            <span className="font-mono text-[#D1D1D6]">
              {formatDayCountPhrase(initialData.coverage.totalDays)}
            </span>{' '}
            of personal history
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowTechnicalStats((v) => !v)}
          className={cn(
            'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer self-start lg:self-auto',
            showTechnicalStats
              ? 'bg-[#0A84FF]/15 text-[#0A84FF] border-[#0A84FF]/40'
              : 'bg-[#141416] text-[#8E8E93] border-white/[0.08] hover:text-[#F5F5F7]',
          )}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Show Technical Stats</span>
          <span className="font-mono text-[10px] uppercase">
            {showTechnicalStats ? 'ON' : 'OFF'}
          </span>
        </button>
      </div>

      {/* Today's Habit Check */}
      <section className="rounded-xl bg-[#141416] border border-white/[0.08] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#F5F5F7]">
            Today&apos;s Habit Check
          </h2>
          <span className="text-[11px] font-mono text-[#8E8E93]">
            {todayScoreboard.day} (London)
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {/* Messages After 9pm */}
          <div className="rounded-lg bg-[#1C1C1E]/75 border border-white/[0.08] px-3 py-2.5">
            <div className="text-[11px] text-[#8E8E93]">Messages After 9pm</div>
            <div
              className={cn(
                'text-sm font-mono font-semibold mt-0.5 whitespace-nowrap',
                todayScoreboard.lateCommsCount === null
                  ? 'text-[#8E8E93]'
                  : todayScoreboard.lateCommsCount > 10
                    ? 'text-[#FF453A]'
                    : 'text-[#30D158]',
              )}
            >
              {todayScoreboard.lateCommsCount !== null
                ? `${todayScoreboard.lateCommsCount} ${pluraliseUnit(todayScoreboard.lateCommsCount, 'msg', 'msgs')}`
                : 'Pending'}
            </div>
          </div>

          {/* Caffeine at 11pm */}
          <div className="rounded-lg bg-[#1C1C1E]/75 border border-white/[0.08] px-3 py-2.5">
            <div className="text-[11px] text-[#8E8E93]">Caffeine at 11pm</div>
            <div
              className={cn(
                'text-sm font-mono font-semibold mt-0.5 whitespace-nowrap',
                todayScoreboard.bedtimeCaffeineMg > 50
                  ? 'text-[#FF9F0A]'
                  : 'text-[#30D158]',
              )}
            >
              {Math.round(todayScoreboard.bedtimeCaffeineMg)} mg
            </div>
          </div>

          {/* Discretionary Spend */}
          <div className="rounded-lg bg-[#1C1C1E]/75 border border-white/[0.08] px-3 py-2.5">
            <div className="text-[11px] text-[#8E8E93]">Discretionary Spend</div>
            <div className="text-sm font-mono font-semibold text-[#F5F5F7] mt-0.5 whitespace-nowrap">
              {todayScoreboard.spendTotalGbp !== null
                ? `£${todayScoreboard.spendTotalGbp.toFixed(2)}`
                : 'No CSV today'}
            </div>
          </div>

          {/* Pub & Social Spend */}
          <div className="rounded-lg bg-[#1C1C1E]/75 border border-white/[0.08] px-3 py-2.5">
            <div className="text-[11px] text-[#8E8E93]">Pub &amp; Social Spend</div>
            <div
              className={cn(
                'text-sm font-mono font-semibold mt-0.5 whitespace-nowrap',
                todayScoreboard.spendSocialPubsGbp && todayScoreboard.spendSocialPubsGbp > 0
                  ? 'text-[#FF9F0A]'
                  : 'text-[#F5F5F7]',
              )}
            >
              {todayScoreboard.spendSocialPubsGbp !== null
                ? `£${todayScoreboard.spendSocialPubsGbp.toFixed(2)}`
                : 'No CSV today'}
            </div>
          </div>

          {/* AM / PM Pills */}
          <div className="rounded-lg bg-[#1C1C1E]/75 border border-white/[0.08] px-3 py-2.5">
            <div className="text-[11px] text-[#8E8E93]">AM / PM Pills</div>
            <div
              className={cn(
                'text-xs font-mono font-semibold mt-1 whitespace-nowrap',
                todayScoreboard.amPillsTaken && todayScoreboard.pmPillsTaken
                  ? 'text-[#30D158]'
                  : 'text-[#D1D1D6]',
              )}
            >
              {pillsStatusText}
            </div>
          </div>

          {/* Daily Check-In */}
          <Link
            href="/log"
            className={cn(
              'rounded-lg px-3 py-2.5 border transition-colors flex flex-col justify-between',
              todayScoreboard.checkInLogged
                ? 'bg-[#30D158]/[0.08] border-[#30D158]/30 hover:border-[#30D158]/50'
                : 'bg-[#0A84FF]/15 border-[#0A84FF]/35 hover:bg-[#0A84FF]/25',
            )}
          >
            <div className="text-[11px] text-[#D1D1D6]">Daily Check-In</div>
            <div
              className={cn(
                'text-xs font-semibold mt-0.5 flex items-center justify-between gap-1 whitespace-nowrap',
                todayScoreboard.checkInLogged ? 'text-[#30D158]' : 'text-[#0A84FF]',
              )}
            >
              <span>{todayScoreboard.checkInLogged ? 'Logged today' : 'Log now (10s)'}</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </div>
          </Link>
        </div>
      </section>

      {/* Last 14 Days vs. Previous 30 Days Shift */}
      <section className="rounded-xl bg-[#141416] border border-white/[0.08] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#F5F5F7]">
            Last 14 Days vs. Previous 30 Days
          </h2>
          <span className="text-[11px] text-[#8E8E93]">
            Recent 14-day average compared with prior 30-day baseline
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {recentShift.map((item) => (
            <div
              key={item.key}
              className="rounded-lg bg-[#1C1C1E]/65 border border-white/[0.06] px-3 py-2.5 space-y-1"
            >
              <div className="text-[11px] text-[#8E8E93] truncate">{item.label}</div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-mono font-semibold text-[#F5F5F7] whitespace-nowrap">
                  {item.nNow > 0 ? item.nowFormatted : 'No logs yet'}
                </span>
                {item.deltaFormatted && (
                  <span
                    className={cn(
                      'text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded whitespace-nowrap',
                      item.isFavourable === true
                        ? 'bg-[#30D158]/15 text-[#30D158]'
                        : item.isFavourable === false
                          ? 'bg-[#FF453A]/15 text-[#FF453A]'
                          : 'bg-[#141416] text-[#8E8E93]',
                    )}
                  >
                    {item.deltaFormatted}
                  </span>
                )}
              </div>
              <div className="text-[10px] font-mono text-[#8E8E93] whitespace-nowrap">
                Prior 30d: {item.nBefore > 0 ? item.beforeFormatted : 'No data'}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Telemetry Coverage Strip */}
      <section className="rounded-xl bg-[#141416] border border-white/[0.08] p-4 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#F5F5F7]">
            Data Sources Connected
          </h2>
          <div className="flex items-center gap-3 text-[11px] text-[#8E8E93]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#30D158]" />
              Established (30+ days)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#0A84FF]" />
              Warming up
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#8E8E93]/50" />
              Awaiting first log
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {initialData.coverage.domains.map((domain) => (
            <div
              key={domain.key}
              title={formatDayCountPhrase(domain.days)}
              className={cn(
                'rounded-lg px-3 py-2 border flex items-center justify-between gap-2',
                domain.status === 'active'
                  ? 'bg-[#30D158]/[0.07] border-[#30D158]/25'
                  : domain.status === 'warming'
                    ? 'bg-[#0A84FF]/[0.08] border-[#0A84FF]/25'
                    : 'bg-[#1C1C1E]/60 border-white/[0.06]',
              )}
            >
              <span className="text-[11px] text-[#D1D1D6] truncate">
                {domain.label}
              </span>
              <span
                className={cn(
                  'text-xs font-sans tabular-nums font-semibold shrink-0 whitespace-nowrap',
                  domain.status === 'active'
                    ? 'text-[#30D158]'
                    : domain.status === 'warming'
                      ? 'text-[#0A84FF]'
                      : 'text-[#8E8E93]',
                )}
              >
                {formatCoverageDaysBadge(domain.days)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Actionable Behavioural Drivers & Drains */}
      <section className="rounded-xl bg-[#141416] border border-white/[0.08] p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#F5F5F7]">
              What Helps vs. What Drains Your Recovery
            </h2>
            <p className="text-xs text-[#8E8E93] mt-0.5">
              Ranked by sample strength and confidence across your daily habits, screen time, spending, and environment.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Unique habits vs All variants */}
            <div className="inline-flex rounded-lg bg-[#1C1C1E] p-0.5 border border-white/[0.08]">
              <button
                type="button"
                onClick={() => setUniqueHabitsOnly(true)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer',
                  uniqueHabitsOnly
                    ? 'bg-[#141416] text-[#F5F5F7] border border-white/[0.1]'
                    : 'text-[#8E8E93] hover:text-[#F5F5F7]',
                )}
              >
                Unique habits
              </button>
              <button
                type="button"
                onClick={() => setUniqueHabitsOnly(false)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer',
                  !uniqueHabitsOnly
                    ? 'bg-[#141416] text-[#F5F5F7] border border-white/[0.1]'
                    : 'text-[#8E8E93] hover:text-[#F5F5F7]',
                )}
              >
                All variants
              </button>
            </div>

            {/* Scope Toggle */}
            <div className="inline-flex rounded-lg bg-[#1C1C1E] p-0.5 border border-white/[0.08]">
              {(
                [
                  { key: 'behavioural', label: 'Habits & Choices' },
                  { key: 'environmental', label: 'Weather & Season' },
                  { key: 'all', label: 'All' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setScopeFilter(opt.key)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer',
                    scopeFilter === opt.key
                      ? 'bg-[#0A84FF] text-white'
                      : 'text-[#8E8E93] hover:text-[#F5F5F7]',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Outcome Filter Pills */}
        <div className="flex flex-wrap gap-1.5">
          {OUTCOME_FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setOutcomeFilter(item.key)}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer',
                outcomeFilter === item.key
                  ? 'bg-[#0A84FF]/15 text-[#0A84FF] border-[#0A84FF]/40'
                  : 'bg-[#1C1C1E] text-[#8E8E93] border-white/[0.08] hover:text-[#F5F5F7]',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Positive Drivers Column */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#30D158] flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                Top Positive Drivers (Do More)
              </span>
              <span className="text-[11px] font-mono text-[#8E8E93]">
                {positiveDrivers.length} found
              </span>
            </div>

            {visiblePositiveDrivers.length === 0 ? (
              <div className="rounded-lg bg-[#1C1C1E]/50 border border-white/[0.06] p-4 text-xs text-[#8E8E93]">
                No positive habit claims passed sample-size guardrails for this filter yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {visiblePositiveDrivers.map((driver) => (
                  <DriverCard
                    key={driver.id}
                    driver={driver}
                    variant="positive"
                    showScopeTag={scopeFilter === 'all'}
                    showTechnicalStats={showTechnicalStats}
                    onStartTrial={(d) =>
                      openTrialFormWith(
                        buildTrialDefaults({
                          featureKey: d.featureKey,
                          featureLabel: d.featureLabel,
                          outcomeKey: d.outcomeKey,
                          outcomeLabel: d.outcomeLabel,
                        }),
                      )
                    }
                  />
                ))}
              </div>
            )}

            {positiveDrivers.length > visiblePositiveDrivers.length || showAllPositive ? (
              <button
                type="button"
                onClick={() => setShowAllPositive((v) => !v)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1C1C1E] border border-white/[0.08] text-xs text-[#D1D1D6] hover:border-white/[0.2] cursor-pointer"
              >
                {showAllPositive ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    Show all {positiveDrivers.length} positive drivers
                  </>
                )}
              </button>
            ) : null}
          </div>

          {/* Negative Drains Column */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#FF453A] flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5" />
                Top Drains &amp; Suppressors (Reduce)
              </span>
              <span className="text-[11px] font-mono text-[#8E8E93]">
                {negativeDrivers.length} found
              </span>
            </div>

            {visibleNegativeDrivers.length === 0 ? (
              <div className="rounded-lg bg-[#1C1C1E]/50 border border-white/[0.06] p-4 text-xs text-[#8E8E93]">
                No negative drains matched this filter yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {visibleNegativeDrivers.map((driver) => (
                  <DriverCard
                    key={driver.id}
                    driver={driver}
                    variant="negative"
                    showScopeTag={scopeFilter === 'all'}
                    showTechnicalStats={showTechnicalStats}
                    onStartTrial={(d) =>
                      openTrialFormWith(
                        buildTrialDefaults({
                          featureKey: d.featureKey,
                          featureLabel: d.featureLabel,
                          outcomeKey: d.outcomeKey,
                          outcomeLabel: d.outcomeLabel,
                        }),
                      )
                    }
                  />
                ))}
              </div>
            )}

            {negativeDrivers.length > visibleNegativeDrivers.length || showAllNegative ? (
              <button
                type="button"
                onClick={() => setShowAllNegative((v) => !v)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1C1C1E] border border-white/[0.08] text-xs text-[#D1D1D6] hover:border-white/[0.2] cursor-pointer"
              >
                {showAllNegative ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    Show all {negativeDrivers.length} drains
                  </>
                )}
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {/* Personal Operating Rules (Threshold Cliffs) */}
      <section className="rounded-xl bg-[#141416] border border-white/[0.08] p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[#F5F5F7]">
              Personal Operating Rules
            </h2>
            <p className="text-xs text-[#8E8E93] mt-0.5">
              Clear day-to-day cutoff points where your recovery or sleep noticeably shifts.
            </p>
          </div>
          <span className="text-xs font-mono text-[#8E8E93]">
            Showing {visibleCliffs.length} of {sortedCliffs.length} rules
          </span>
        </div>

        {visibleCliffs.length === 0 ? (
          <div className="rounded-lg bg-[#1C1C1E]/50 border border-white/[0.06] p-4 text-xs text-[#8E8E93]">
            No operating rules found for the selected filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {visibleCliffs.map((cliff) => {
              const totalDays = cliff.lowN + cliff.highN;
              const impactColor =
                Math.abs(cliff.medianDelta) < 0.05
                  ? 'text-[#8E8E93]'
                  : cliff.isBeneficialDelta
                    ? 'text-[#30D158]'
                    : 'text-[#FF453A]';

              return (
                <div
                  key={cliff.id}
                  className="rounded-lg bg-[#1C1C1E]/75 border border-white/[0.08] p-3.5 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-[#F5F5F7]">
                        {cliff.featureLabel}
                      </div>
                      <div className="text-[11px] text-[#8E8E93] mt-0.5">
                        {cliff.comparisonLabel}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-1 shrink-0">
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#141416] text-[#D1D1D6] border border-white/[0.08] whitespace-nowrap">
                        {cliff.timingLabel}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap',
                          confidenceBadgeStyle(cliff.confidenceLabel),
                        )}
                      >
                        {cliff.confidenceLabel}
                      </span>
                      {cliff.isEarlySample && (
                        <span
                          className={cn(
                            'text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap',
                            sampleStageBadgeStyle(cliff.sampleStage),
                          )}
                        >
                          {cliff.sampleStage}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div
                      className={cn(
                        'text-base font-mono font-semibold tracking-tight',
                        impactColor,
                      )}
                    >
                      {formatOutcomeDelta(cliff.outcomeKey, cliff.medianDelta)}{' '}
                      <span className="text-xs font-sans font-medium text-[#D1D1D6]">
                        {cliff.outcomeLabel}
                      </span>
                    </div>
                    <p className="text-xs text-[#D1D1D6]">{cliff.plainVerdict}</p>
                    {cliff.observationalCaveat && (
                      <div className="rounded-md bg-[#FF9F0A]/10 border border-[#FF9F0A]/25 px-2.5 py-1.5 text-[11px] text-[#FF9F0A]">
                        {cliff.observationalCaveat}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.06] text-xs">
                    <div className="rounded bg-[#141416] px-2.5 py-1.5 border border-white/[0.06]">
                      <div className="text-[11px] text-[#8E8E93] truncate">
                        {cliff.lowBucketLabel}
                      </div>
                      <div className="font-mono text-[#F5F5F7] font-semibold mt-0.5 whitespace-nowrap">
                        {formatOutcomeValue(cliff.outcomeKey, cliff.lowMedian)}
                      </div>
                    </div>
                    <div className="rounded bg-[#141416] px-2.5 py-1.5 border border-white/[0.06]">
                      <div className="text-[11px] text-[#8E8E93] truncate">
                        {cliff.highBucketLabel}
                      </div>
                      <div className="font-mono text-[#F5F5F7] font-semibold mt-0.5 whitespace-nowrap">
                        {formatOutcomeValue(cliff.outcomeKey, cliff.highMedian)}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#8E8E93]">
                    <span className="font-mono whitespace-nowrap">
                      Based on {formatDayCountPhrase(totalDays)}
                    </span>
                    <div className="flex items-center gap-2.5">
                      {showTechnicalStats && (
                        <span className="font-mono whitespace-nowrap">
                          p = {formatPValue(cliff.pValue)} · n = {cliff.lowN} vs {cliff.highN}
                        </span>
                      )}
                      {cliff.scope === 'behavioural' && (
                        <button
                          type="button"
                          onClick={() =>
                            openTrialFormWith(
                              buildTrialDefaults({
                                featureKey: cliff.featureKey,
                                featureLabel: cliff.featureLabel,
                                outcomeKey: cliff.outcomeKey,
                                outcomeLabel: cliff.outcomeLabel,
                                comparisonLabel: cliff.comparisonLabel,
                              }),
                            )
                          }
                          className="px-2 py-0.5 rounded bg-[#0A84FF]/15 text-[#0A84FF] border border-[#0A84FF]/30 hover:bg-[#0A84FF]/25 text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer"
                        >
                          Start 14-Day Trial
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {(sortedCliffs.length > visibleCliffs.length || showAllCliffs) && (
          <div className="pt-1 flex justify-center">
            <button
              type="button"
              onClick={() => setShowAllCliffs((v) => !v)}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#1C1C1E] border border-white/[0.08] text-xs text-[#D1D1D6] hover:border-white/[0.2] cursor-pointer"
            >
              {showAllCliffs
                ? 'Show less'
                : `Show all ${sortedCliffs.length} rules`}
            </button>
          </div>
        )}
      </section>

      {/* Best 10% vs Worst 10% Days Fingerprint */}
      <section className="rounded-xl bg-[#141416] border border-white/[0.08] p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#F5F5F7]">
              Your Best Days vs. Worst Days
            </h2>
            <p className="text-xs text-[#8E8E93] mt-0.5">
              Averages from your top 10% recovery days compared with your bottom 10% days.
            </p>
          </div>

          <div className="inline-flex rounded-lg bg-[#1C1C1E] p-0.5 border border-white/[0.08] self-start">
            {(
              [
                { key: 'all', label: 'All' },
                { key: 'behavioural', label: 'Habits Only' },
                { key: 'environmental', label: 'Seasonal Only' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setContrastScope(opt.key)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer',
                  contrastScope === opt.key
                    ? 'bg-[#0A84FF] text-white'
                    : 'text-[#8E8E93] hover:text-[#F5F5F7]',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[0.08] text-[11px] uppercase tracking-wider text-[#8E8E93]">
                <th className="py-2 pr-4">Habit or Factor</th>
                <th className="py-2 px-3">Type</th>
                <th className="py-2 px-3 text-right whitespace-nowrap">Best 10% Days</th>
                <th className="py-2 px-3 text-right whitespace-nowrap">Worst 10% Days</th>
                <th className="py-2 px-3 text-right whitespace-nowrap">Days Compared</th>
                <th className="py-2 pl-3 text-right whitespace-nowrap">Impact Size</th>
                {showTechnicalStats && (
                  <th className="py-2 pl-3 text-right font-mono whitespace-nowrap">
                    Cohen&apos;s d
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {filteredContrasts.slice(0, 18).map((c) => (
                <tr key={c.id} className="hover:bg-[#1C1C1E]/50 transition-colors">
                  <td className="py-2 pr-4 font-medium text-[#F5F5F7]">
                    {c.featureLabel}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <span
                      className={cn(
                        'text-[10px] font-medium px-2 py-0.5 rounded-full border',
                        c.scope === 'behavioural'
                          ? 'bg-[#0A84FF]/15 text-[#0A84FF] border-[#0A84FF]/30'
                          : 'bg-[#1C1C1E] text-[#8E8E93] border-white/[0.08]',
                      )}
                    >
                      {contrastScopeBadge(c.scope)}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-[#30D158] whitespace-nowrap">
                    {c.best10Formatted}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-[#FF9F0A] whitespace-nowrap">
                    {c.worst10Formatted}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-[#8E8E93] whitespace-nowrap">
                    {formatDayCountPhrase(c.sampleN)}
                  </td>
                  <td className="py-2 pl-3 text-right whitespace-nowrap">
                    <span
                      className={cn(
                        'inline-block text-[10px] font-medium px-2 py-0.5 rounded-full border',
                        impactSizeBadgeStyle(c.effectSizeLabel),
                      )}
                    >
                      {c.effectSizeLabel}
                    </span>
                  </td>
                  {showTechnicalStats && (
                    <td className="py-2 pl-3 text-right font-mono font-semibold text-[#D1D1D6] whitespace-nowrap">
                      {formatSigned(c.effectSizeD, 3)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Personal 14-Day Experiments */}
      <section
        id="experiments-section"
        className="rounded-xl bg-[#141416] border border-white/[0.08] p-4 sm:p-5 space-y-3.5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-[#0A84FF]" />
              <h2 className="text-sm font-semibold text-[#F5F5F7]">
                Personal 14-Day Experiments
              </h2>
            </div>
            <p className="text-xs text-[#8E8E93] mt-0.5">
              Test one habit change at a time and automatically compare against your prior baseline.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setFormOpen((open) => !open)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A84FF] text-white text-xs font-medium hover:bg-[#0A84FF]/90 transition-colors cursor-pointer self-start"
          >
            {formOpen ? (
              <>
                <X className="w-3.5 h-3.5" />
                Close Form
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                New Experiment
              </>
            )}
          </button>
        </div>

        {formError && (
          <div className="rounded-lg bg-[#FF453A]/10 border border-[#FF453A]/40 p-3 text-xs text-[#FF453A]">
            {formError}
          </div>
        )}
        {formSuccess && (
          <div className="rounded-lg bg-[#30D158]/10 border border-[#30D158]/35 p-3 text-xs text-[#30D158] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{formSuccess}</span>
          </div>
        )}

        {formOpen && (
          <form
            onSubmit={handleCreateExperiment}
            className="rounded-xl bg-[#1C1C1E]/80 border border-white/[0.1] p-4 space-y-4"
          >
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium uppercase tracking-wider text-[#8E8E93]">
                Quick Presets
              </div>
              <div className="flex flex-wrap gap-1.5">
                {EXPERIMENT_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="px-2.5 py-1 rounded-md bg-[#141416] border border-white/[0.1] text-xs text-[#D1D1D6] hover:border-[#0A84FF]/60 hover:text-white transition-colors cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[#8E8E93] mb-1">
                  Trial Name
                </label>
                <input
                  type="text"
                  required
                  value={expName}
                  onChange={(e) => setExpName(e.target.value)}
                  className="w-full rounded-lg bg-[#141416] border border-white/[0.12] px-3 py-2 text-xs text-[#F5F5F7] focus:outline-none focus:border-[#0A84FF]"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[#8E8E93] mb-1">
                  Habit to Test
                </label>
                <select
                  value={expFeatureKey}
                  onChange={(e) => setExpFeatureKey(e.target.value)}
                  className="w-full rounded-lg bg-[#141416] border border-white/[0.12] px-3 py-2 text-xs text-[#F5F5F7] focus:outline-none focus:border-[#0A84FF]"
                >
                  {FEATURE_KEY_OPTIONS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-[#8E8E93] mb-1">
                What You Expect to Improve
              </label>
              <textarea
                rows={2}
                required
                value={expHypothesis}
                onChange={(e) => setExpHypothesis(e.target.value)}
                className="w-full rounded-lg bg-[#141416] border border-white/[0.12] px-3 py-2 text-xs text-[#F5F5F7] focus:outline-none focus:border-[#0A84FF]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] uppercase tracking-wider text-[#8E8E93]">
                Outcomes to Track
              </label>
              <div className="flex flex-wrap gap-1.5">
                {EXPERIMENT_OUTCOME_OPTIONS.map((opt) => {
                  const selected = expOutcomes.includes(opt.key);
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => toggleOutcomeTarget(opt.key)}
                      className={cn(
                        'px-2.5 py-1 rounded-full text-xs border transition-colors cursor-pointer',
                        selected
                          ? 'bg-[#0A84FF]/20 text-[#0A84FF] border-[#0A84FF]/40'
                          : 'bg-[#141416] text-[#8E8E93] border-white/[0.08]',
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[#8E8E93] mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  required
                  value={expStartDay}
                  onChange={(e) => setExpStartDay(e.target.value)}
                  className="w-full rounded-lg bg-[#141416] border border-white/[0.12] px-3 py-2 text-xs font-mono text-[#F5F5F7] focus:outline-none focus:border-[#0A84FF]"
                />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[#8E8E93] mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  required
                  value={expEndDay}
                  onChange={(e) => setExpEndDay(e.target.value)}
                  className="w-full rounded-lg bg-[#141416] border border-white/[0.12] px-3 py-2 text-xs font-mono text-[#F5F5F7] focus:outline-none focus:border-[#0A84FF]"
                />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[#8E8E93] mb-1">
                  Baseline Days
                </label>
                <input
                  type="number"
                  min={7}
                  max={90}
                  required
                  value={expBaselineDays}
                  onChange={(e) => setExpBaselineDays(Number(e.target.value) || 21)}
                  className="w-full rounded-lg bg-[#141416] border border-white/[0.12] px-3 py-2 text-xs font-mono text-[#F5F5F7] focus:outline-none focus:border-[#0A84FF]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-[#141416] border border-white/[0.1] text-xs text-[#8E8E93] hover:text-[#F5F5F7] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={expPending}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#0A84FF] text-white text-xs font-medium hover:bg-[#0A84FF]/90 disabled:opacity-60 cursor-pointer"
              >
                {expPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Start Trial
              </button>
            </div>
          </form>
        )}

        {initialData.experiments.length === 0 ? (
          <div className="rounded-lg bg-[#1C1C1E]/50 border border-white/[0.06] p-5 text-center space-y-1.5">
            <p className="text-xs font-medium text-[#F5F5F7]">
              No Experiments Running Yet
            </p>
            <p className="text-xs text-[#8E8E93]">
              Tap &ldquo;Start 14-Day Trial&rdquo; on any rule above or &ldquo;New Experiment&rdquo; to begin testing a habit.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {initialData.experiments.map((exp) => (
              <div
                key={exp.id}
                className="rounded-lg bg-[#1C1C1E]/70 border border-white/[0.08] p-4 space-y-2.5"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-[#F5F5F7]">
                      {exp.name}
                    </span>
                    <span
                      className={cn(
                        'text-[10px] font-mono uppercase px-2 py-0.5 rounded border',
                        exp.status === 'active'
                          ? 'bg-[#0A84FF]/15 text-[#0A84FF] border-[#0A84FF]/30'
                          : exp.status === 'completed'
                            ? 'bg-[#30D158]/15 text-[#30D158] border-[#30D158]/30'
                            : 'bg-[#141416] text-[#8E8E93] border-white/[0.08]',
                      )}
                    >
                      {exp.status}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-[#8E8E93]">
                    {exp.startDay} to {exp.endDay} ({formatDayCountPhrase(exp.baselineDays)} baseline)
                  </div>
                </div>

                <p className="text-xs text-[#D1D1D6] leading-relaxed">
                  {exp.hypothesis}
                </p>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.06] text-[11px]">
                  <div className="flex flex-wrap items-center gap-1.5 text-[#8E8E93]">
                    <span>
                      Tracking: {exp.targetOutcomes.map((o) => getOutcomeLabel(o)).join(', ')}
                    </span>
                  </div>

                  {exp.status === 'active' && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={expPending}
                        onClick={() => handleStatusChange(exp.id, 'completed')}
                        className="px-2.5 py-1 rounded bg-[#30D158]/15 text-[#30D158] border border-[#30D158]/30 text-[11px] font-medium hover:bg-[#30D158]/25 cursor-pointer"
                      >
                        Mark Completed
                      </button>
                      <button
                        type="button"
                        disabled={expPending}
                        onClick={() => handleStatusChange(exp.id, 'cancelled')}
                        className="px-2.5 py-1 rounded bg-[#141416] text-[#8E8E93] border border-white/[0.1] text-[11px] font-medium hover:text-[#F5F5F7] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {exp.verdict && (
                  <div className="rounded bg-[#141416] border border-white/[0.06] px-3 py-2 text-xs text-[#D1D1D6]">
                    Verdict: {exp.verdict}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
