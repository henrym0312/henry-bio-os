'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  FlaskConical,
  Loader2,
  Plus,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  createExperimentAction,
  updateExperimentStatusAction,
} from '@/app/insights/actions';
import type {
  AnalyticsContrastItem,
  AnalyticsDriverItem,
  FeatureScope,
  InsightsPayload,
} from '@/lib/analytics/insights';
import { cn } from '@/lib/utils';

type ScopeFilter = 'behavioural' | 'environmental' | 'all';

const OUTCOME_FILTERS = [
  { key: 'all', label: 'All Outcomes' },
  { key: 'hrv_avg_ms', label: 'HRV' },
  { key: 'deep_sleep_min', label: 'Deep Sleep' },
  { key: 'lowest_hr_bpm', label: 'Lowest HR' },
  { key: 'readiness_score', label: 'Readiness' },
  { key: 'sleep_efficiency_pct', label: 'Sleep Efficiency' },
  { key: 'mental_focus', label: 'Mental Focus' },
  { key: 'task_completion_rate', label: 'Task Completion' },
] as const;

const EXPERIMENT_OUTCOME_OPTIONS = [
  { key: 'hrv_avg_ms', label: 'Nocturnal HRV' },
  { key: 'lowest_hr_bpm', label: 'Lowest HR' },
  { key: 'readiness_score', label: 'Readiness Score' },
  { key: 'deep_sleep_min', label: 'Deep Sleep' },
  { key: 'sleep_efficiency_pct', label: 'Sleep Efficiency' },
  { key: 'sleep_latency_min', label: 'Sleep Latency' },
  { key: 'mental_focus', label: 'Mental Focus' },
  { key: 'task_completion_rate', label: 'Task Completion' },
] as const;

const FEATURE_KEY_OPTIONS = [
  { key: 'late_comms_count', label: 'Late-Night Comms (21:00-04:00)' },
  { key: 'late_night_screen_mins', label: 'Late-Night Screen Time (min)' },
  { key: 'am_pills_taken', label: 'AM Supplements Taken' },
  { key: 'pm_pills_taken', label: 'PM Supplements Taken' },
  { key: 'time_in_daylight_mins', label: 'Time in Daylight (min)' },
  { key: 'bedtime_caffeine_mg', label: 'Bedtime Residual Caffeine (mg)' },
  { key: 'workout_mins', label: 'Exercise / Workout (min)' },
  { key: 'tv_late_mins', label: 'Late TV Usage (min)' },
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
    label: 'Cap Late Comms <= 10 after 21:00',
    name: 'Cap Late Comms <= 10 after 21:00',
    hypothesis:
      'Limiting messaging and email activity after 21:00 to 10 events or fewer reduces sympathetic arousal before sleep, improving nocturnal HRV and lowering minimum heart rate.',
    featureKey: 'late_comms_count',
    targetOutcomes: ['hrv_avg_ms', 'lowest_hr_bpm', 'readiness_score'],
  },
  {
    label: 'No Screens After 22:00',
    name: 'No Screens After 22:00',
    hypothesis:
      'Eliminating Mac and iPhone screen exposure after 22:00 improves deep sleep duration, sleep efficiency, and next-day readiness.',
    featureKey: 'late_night_screen_mins',
    targetOutcomes: ['hrv_avg_ms', 'deep_sleep_min', 'sleep_efficiency_pct'],
  },
  {
    label: 'Consistent AM+PM Supplements',
    name: 'Consistent AM+PM Supplements',
    hypothesis:
      'Maintaining uninterrupted daily AM and PM supplement adherence improves readiness recovery and nocturnal sleep stability.',
    featureKey: 'am_pills_taken',
    targetOutcomes: ['readiness_score', 'hrv_avg_ms', 'deep_sleep_min'],
  },
  {
    label: '25m+ Morning Daylight',
    name: '25m+ Morning Daylight',
    hypothesis:
      'Accumulating at least 25 minutes of outdoor daylight anchors circadian timing, shortening sleep onset latency and lifting morning readiness.',
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
  }).format(dt)} Europe/London`;
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

function formatDeltaWithUnit(delta: number, unit: string): string {
  const rounded =
    Math.abs(delta % 1) < 0.001 ? String(Math.round(delta)) : delta.toFixed(1);
  const signed = delta > 0 ? `+${rounded}` : rounded;
  return unit ? `${signed} ${unit}` : signed;
}

function formatLagLabel(lagDays: number): string {
  if (lagDays === 0) return 'Same Day';
  return `+${lagDays}d Lag`;
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

function contrastScopeBadge(scope: FeatureScope): string {
  return scope === 'environmental' ? 'Seasonal' : 'Behavioural';
}

function DriverCard({
  driver,
  variant,
  showScopeTag,
}: {
  driver: AnalyticsDriverItem;
  variant: 'positive' | 'negative';
  showScopeTag: boolean;
}) {
  const accentText = variant === 'positive' ? 'text-[#30D158]' : 'text-[#FF453A]';
  const accentPill =
    variant === 'positive'
      ? 'bg-[#30D158]/15 text-[#30D158] border-[#30D158]/30'
      : 'bg-[#FF453A]/15 text-[#FF453A] border-[#FF453A]/30';
  const significanceLabel =
    driver.fdrQValue !== null ? `q ${formatPValue(driver.fdrQValue)}` : `p ${formatPValue(driver.pValue)}`;

  return (
    <div className="rounded-lg bg-[#1C1C1E]/70 border border-white/[0.08] p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-[#F5F5F7] truncate">
            {driver.featureLabel}
          </div>
          <div className="text-[11px] text-[#8E8E93] mt-0.5 flex flex-wrap items-center gap-1.5">
            <span>Target:</span>
            <span className="text-[#D1D1D6]">{driver.outcomeLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {showScopeTag && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#141416] border border-white/[0.08] text-[#8E8E93]">
              {driver.scope === 'environmental' ? 'Env' : 'Habit'}
            </span>
          )}
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#0A84FF]/15 text-[#0A84FF] border border-[#0A84FF]/25">
            {formatLagLabel(driver.lagDays)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/[0.06] text-[11px] font-mono tabular-nums">
        <div>
          <div className="text-[10px] text-[#8E8E93] uppercase">Spearman r</div>
          <div className={cn('text-sm font-semibold', accentText)}>
            {formatSigned(driver.spearmanR, 3)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-[#8E8E93] uppercase">FDR / Sig</div>
          <div className="text-[#F5F5F7] mt-0.5">{significanceLabel}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-[#8E8E93] uppercase">Sample</div>
          <div className="mt-0.5 flex items-center justify-end gap-1.5">
            <span className="text-[#F5F5F7]">n={driver.sampleN}</span>
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.2 rounded border uppercase',
                driver.confidenceTier === 'high'
                  ? accentPill
                  : 'bg-[#141416] text-[#8E8E93] border-white/[0.08]',
              )}
            >
              {driver.confidenceTier}
            </span>
          </div>
        </div>
      </div>

      {(driver.marginalEffect !== null || driver.shapImportance !== null) && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-[#8E8E93] pt-1 border-t border-white/[0.06]">
          <span>
            RidgeCV effect:{' '}
            <span className="text-[#D1D1D6]">
              {driver.marginalEffect !== null ? formatSigned(driver.marginalEffect, 3) : 'n/a'}
            </span>
          </span>
          <span>
            Importance:{' '}
            <span className="text-[#D1D1D6]">
              {driver.shapImportance !== null ? driver.shapImportance.toFixed(4) : 'n/a'}
            </span>
          </span>
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
  const [showAllDrivers, setShowAllDrivers] = useState(false);
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
    () => filteredDrivers.filter((d) => d.beneficialDirection === 'beneficial'),
    [filteredDrivers],
  );
  const negativeDrivers = useMemo(
    () => filteredDrivers.filter((d) => d.beneficialDirection === 'detrimental'),
    [filteredDrivers],
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

  const filteredContrasts = useMemo<AnalyticsContrastItem[]>(() => {
    if (contrastScope === 'all') return initialData.groupContrasts;
    return initialData.groupContrasts.filter((c) => c.scope === contrastScope);
  }, [initialData.groupContrasts, contrastScope]);

  const driverLimit = showAllDrivers ? 50 : 8;
  const cliffLimit = showAllCliffs ? 40 : 10;

  const applyPreset = (preset: ExperimentPreset) => {
    setExpName(preset.name);
    setExpHypothesis(preset.hypothesis);
    setExpFeatureKey(preset.featureKey);
    setExpOutcomes(preset.targetOutcomes);
    const today = todayLondonIso();
    setExpStartDay(today);
    setExpEndDay(addDaysIso(today, 13));
    setFormError(null);
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
      setFormSuccess(`Started N-of-1 trial: ${res.experiment.name}`);
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
            ? 'Trial period closed manually; awaiting next nightly analytics scoring.'
            : 'Trial cancelled manually.',
      });
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-[#0A84FF]" />
            <h1 className="text-xl font-semibold tracking-tight text-[#F5F5F7]">
              Life Insights &amp; Causal Engine
            </h1>
          </div>
          <p className="text-xs text-[#8E8E93] mt-1">
            Last analytics run:{' '}
            <span className="font-mono text-[#D1D1D6]">
              {formatLondonTimestamp(initialData.latestRun?.ranAt ?? null)}
            </span>{' '}
            · Rolling window:{' '}
            <span className="font-mono tabular-nums text-[#D1D1D6]">
              {initialData.latestRun?.windowDays ?? 120}d
            </span>{' '}
            · Matrix coverage:{' '}
            <span className="font-mono tabular-nums text-[#D1D1D6]">
              {initialData.coverage.totalDays} days
            </span>
            {initialData.coverage.minDay && initialData.coverage.maxDay
              ? ` (${initialData.coverage.minDay} to ${initialData.coverage.maxDay})`
              : ''}
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
          <span className="px-2.5 py-1 rounded-md bg-[#141416] border border-white/[0.08] text-[#8E8E93]">
            Run #{initialData.latestRun?.id ?? '0'}
          </span>
          <span className="px-2.5 py-1 rounded-md bg-[#141416] border border-white/[0.08] text-[#D1D1D6]">
            {initialData.behavioural.drivers.length} behavioural ·{' '}
            {initialData.environmental.drivers.length} environmental drivers
          </span>
        </div>
      </div>

      {/* Section 1: Telemetry Coverage Strip */}
      <section className="rounded-xl bg-[#141416] border border-white/[0.08] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#F5F5F7]">
            Telemetry Coverage Strip
          </h2>
          <div className="flex items-center gap-3 text-[11px] font-mono text-[#8E8E93]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#30D158]" />
              Established (30d+)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#0A84FF]" />
              Warming up
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#8E8E93]/50" />
              Awaiting ingest
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {initialData.coverage.domains.map((domain) => (
            <div
              key={domain.key}
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
                  'text-xs font-mono tabular-nums font-semibold shrink-0',
                  domain.status === 'active'
                    ? 'text-[#30D158]'
                    : domain.status === 'warming'
                      ? 'text-[#0A84FF]'
                      : 'text-[#8E8E93]',
                )}
              >
                {domain.days}d
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Section 2: Actionable Behavioural Drivers & Drains */}
      <section className="rounded-xl bg-[#141416] border border-white/[0.08] p-5 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#F5F5F7]">
              Actionable Behavioural Drivers &amp; Drains
            </h2>
            <p className="text-xs text-[#8E8E93] mt-0.5">
              Lagged Spearman rank associations with Benjamini-Hochberg FDR control and RidgeCV permutation importance.
            </p>
          </div>

          {/* Scope Toggle */}
          <div className="inline-flex rounded-lg bg-[#1C1C1E] p-0.5 border border-white/[0.08] self-start">
            {(
              [
                { key: 'behavioural', label: 'Behavioural Levers' },
                { key: 'environmental', label: 'Environmental Context' },
                { key: 'all', label: 'All' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setScopeFilter(opt.key)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer',
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Positive Drivers Column */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#30D158] flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                Top Positive Drivers (Do More)
              </span>
              <span className="text-[11px] font-mono tabular-nums text-[#8E8E93]">
                {positiveDrivers.length} signals
              </span>
            </div>

            {positiveDrivers.length === 0 ? (
              <div className="rounded-lg bg-[#1C1C1E]/50 border border-white/[0.06] p-4 text-xs text-[#8E8E93]">
                No significant beneficial drivers matched this outcome and scope filter yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {positiveDrivers.slice(0, driverLimit).map((driver) => (
                  <DriverCard
                    key={driver.id}
                    driver={driver}
                    variant="positive"
                    showScopeTag={scopeFilter === 'all'}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Negative Drains Column */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#FF453A] flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5" />
                Top Drains / Suppressors (Reduce)
              </span>
              <span className="text-[11px] font-mono tabular-nums text-[#8E8E93]">
                {negativeDrivers.length} signals
              </span>
            </div>

            {negativeDrivers.length === 0 ? (
              <div className="rounded-lg bg-[#1C1C1E]/50 border border-white/[0.06] p-4 text-xs text-[#8E8E93]">
                No significant negative suppressors matched this outcome and scope filter yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {negativeDrivers.slice(0, driverLimit).map((driver) => (
                  <DriverCard
                    key={driver.id}
                    driver={driver}
                    variant="negative"
                    showScopeTag={scopeFilter === 'all'}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {(positiveDrivers.length > 8 || negativeDrivers.length > 8) && (
          <div className="pt-1 flex justify-center">
            <button
              type="button"
              onClick={() => setShowAllDrivers((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1C1C1E] border border-white/[0.08] text-xs text-[#D1D1D6] hover:border-white/[0.2] cursor-pointer"
            >
              {showAllDrivers ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  Show Top 8 Per Column
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  Show All Matching Drivers ({positiveDrivers.length + negativeDrivers.length})
                </>
              )}
            </button>
          </div>
        )}
      </section>

      {/* Section 3: Personal Threshold Cliffs (Operating Rules) */}
      <section className="rounded-xl bg-[#141416] border border-white/[0.08] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[#F5F5F7]">
              Personal Threshold Cliffs (Operating Rules)
            </h2>
            <p className="text-xs text-[#8E8E93] mt-0.5">
              Mann-Whitney U step changes across behavioural cutoffs first, followed by seasonal thresholds.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-[#8E8E93]">
            {sortedCliffs.length} significant cutoffs
          </span>
        </div>

        {sortedCliffs.length === 0 ? (
          <div className="rounded-lg bg-[#1C1C1E]/50 border border-white/[0.06] p-4 text-xs text-[#8E8E93]">
            No threshold cliffs found for the selected filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sortedCliffs.slice(0, cliffLimit).map((cliff) => {
              const deltaIsGood =
                cliff.outcomeKey === 'lowest_hr_bpm' ||
                cliff.outcomeKey === 'sleep_latency_min'
                  ? cliff.medianDelta < 0
                  : cliff.medianDelta > 0;
              return (
                <div
                  key={cliff.id}
                  className="rounded-lg bg-[#1C1C1E]/70 border border-white/[0.08] p-4 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-[#F5F5F7]">
                          {cliff.featureLabel}
                        </span>
                        <span
                          className={cn(
                            'text-[10px] font-mono px-1.5 py-0.5 rounded border',
                            cliff.scope === 'behavioural'
                              ? 'bg-[#0A84FF]/15 text-[#0A84FF] border-[#0A84FF]/30'
                              : 'bg-[#141416] text-[#8E8E93] border-white/[0.08]',
                          )}
                        >
                          {cliff.scope === 'behavioural' ? 'Behavioural' : 'Seasonal'}
                        </span>
                      </div>
                      <p className="text-[11px] font-mono text-[#8E8E93] mt-1">
                        {cliff.thresholdRule}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'text-xs font-mono tabular-nums font-semibold px-2 py-1 rounded-md shrink-0',
                        deltaIsGood
                          ? 'bg-[#30D158]/15 text-[#30D158]'
                          : 'bg-[#FF453A]/15 text-[#FF453A]',
                      )}
                    >
                      {formatDeltaWithUnit(cliff.medianDelta, cliff.outcomeUnit)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.06] text-xs font-mono tabular-nums">
                    <div className="rounded bg-[#141416] px-2.5 py-1.5 border border-white/[0.06]">
                      <div className="text-[10px] text-[#8E8E93] truncate">
                        {cliff.lowBucketLabel}
                      </div>
                      <div className="text-[#F5F5F7] font-semibold mt-0.5">
                        {cliff.lowMedian}
                        {cliff.outcomeUnit ? ` ${cliff.outcomeUnit}` : ''}
                      </div>
                    </div>
                    <div className="rounded bg-[#141416] px-2.5 py-1.5 border border-white/[0.06]">
                      <div className="text-[10px] text-[#8E8E93] truncate">
                        {cliff.highBucketLabel}
                      </div>
                      <div className="text-[#F5F5F7] font-semibold mt-0.5">
                        {cliff.highMedian}
                        {cliff.outcomeUnit ? ` ${cliff.outcomeUnit}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[#8E8E93]">
                    <span>Outcome: {cliff.outcomeLabel}</span>
                    <span>
                      n={cliff.lowN} vs {cliff.highN} · p = {formatPValue(cliff.pValue)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {sortedCliffs.length > 10 && (
          <div className="pt-1 flex justify-center">
            <button
              type="button"
              onClick={() => setShowAllCliffs((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1C1C1E] border border-white/[0.08] text-xs text-[#D1D1D6] hover:border-white/[0.2] cursor-pointer"
            >
              {showAllCliffs ? 'Show Top 10 Cliffs' : `Show All ${sortedCliffs.length} Cliffs`}
            </button>
          </div>
        )}
      </section>

      {/* Section 4: Best 10% vs Worst 10% Days Fingerprint */}
      <section className="rounded-xl bg-[#141416] border border-white/[0.08] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#F5F5F7]">
              Best 10% vs Worst 10% Days Fingerprint
            </h2>
            <p className="text-xs text-[#8E8E93] mt-0.5">
              Composite recovery and focus decile separation sorted by absolute Cohen&apos;s d effect size.
            </p>
          </div>

          <div className="inline-flex rounded-lg bg-[#1C1C1E] p-0.5 border border-white/[0.08] self-start">
            {(
              [
                { key: 'all', label: 'All Variables' },
                { key: 'behavioural', label: 'Behavioural Only' },
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
              <tr className="border-b border-white/[0.08] text-[11px] font-mono uppercase tracking-wider text-[#8E8E93]">
                <th className="py-2.5 pr-4">Variable</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3 text-right">Best 10% Mean</th>
                <th className="py-2.5 px-3 text-right">Worst 10% Mean</th>
                <th className="py-2.5 px-3 text-right">Sample</th>
                <th className="py-2.5 pl-3 text-right">Cohen&apos;s d</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {filteredContrasts.slice(0, 18).map((c) => (
                <tr key={c.id} className="hover:bg-[#1C1C1E]/50 transition-colors">
                  <td className="py-2.5 pr-4 font-medium text-[#F5F5F7]">
                    {c.featureLabel}
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={cn(
                        'text-[10px] font-mono px-2 py-0.5 rounded border',
                        c.scope === 'behavioural'
                          ? 'bg-[#0A84FF]/15 text-[#0A84FF] border-[#0A84FF]/30'
                          : 'bg-[#1C1C1E] text-[#8E8E93] border-white/[0.08]',
                      )}
                    >
                      {contrastScopeBadge(c.scope)}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#30D158]">
                    {c.best10Mean.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#FF9F0A]">
                    {c.worst10Mean.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#8E8E93]">
                    n={c.sampleN}
                  </td>
                  <td
                    className={cn(
                      'py-2.5 pl-3 text-right font-mono tabular-nums font-semibold',
                      Math.abs(c.effectSizeD) >= 1.0 ? 'text-[#F5F5F7]' : 'text-[#8E8E93]',
                    )}
                  >
                    {formatSigned(c.effectSizeD, 3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 5: N-of-1 Self-Experiments */}
      <section className="rounded-xl bg-[#141416] border border-white/[0.08] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-[#0A84FF]" />
              <h2 className="text-sm font-semibold text-[#F5F5F7]">
                N-of-1 Self-Experiments
              </h2>
            </div>
            <p className="text-xs text-[#8E8E93] mt-0.5">
              Structured 14-day personal intervention trials scored nightly against prior baselines.
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
              <div className="text-[11px] font-mono uppercase tracking-wider text-[#8E8E93]">
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
                  Intervention Feature
                </label>
                <select
                  value={expFeatureKey}
                  onChange={(e) => setExpFeatureKey(e.target.value)}
                  className="w-full rounded-lg bg-[#141416] border border-white/[0.12] px-3 py-2 text-xs font-mono text-[#F5F5F7] focus:outline-none focus:border-[#0A84FF]"
                >
                  {FEATURE_KEY_OPTIONS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label} ({f.key})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-[#8E8E93] mb-1">
                Falsifiable Hypothesis
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
                Target Outcomes
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
                  Start Day
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
                  End Day
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
                  Baseline Lookback (days)
                </label>
                <input
                  type="number"
                  min={7}
                  max={90}
                  required
                  value={expBaselineDays}
                  onChange={(e) => setExpBaselineDays(Number(e.target.value) || 21)}
                  className="w-full rounded-lg bg-[#141416] border border-white/[0.12] px-3 py-2 text-xs font-mono tabular-nums text-[#F5F5F7] focus:outline-none focus:border-[#0A84FF]"
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
          <div className="rounded-lg bg-[#1C1C1E]/50 border border-white/[0.06] p-6 text-center space-y-1.5">
            <p className="text-xs font-medium text-[#F5F5F7]">
              No N-of-1 Self-Experiments Logged Yet
            </p>
            <p className="text-xs text-[#8E8E93]">
              Click &ldquo;New Experiment&rdquo; above to launch a 14-day intervention trial targeting a behavioural lever.
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
                  <div className="text-[11px] font-mono tabular-nums text-[#8E8E93]">
                    {exp.startDay} to {exp.endDay} ({exp.baselineDays}d baseline)
                  </div>
                </div>

                <p className="text-xs text-[#D1D1D6] leading-relaxed">
                  {exp.hypothesis}
                </p>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.06] text-[11px]">
                  <div className="flex flex-wrap items-center gap-1.5 font-mono text-[#8E8E93]">
                    <span>Feature: {exp.featureKey}</span>
                    <span>·</span>
                    <span>Outcomes: {exp.targetOutcomes.join(', ')}</span>
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
