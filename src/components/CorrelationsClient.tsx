'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, ScatterChart as ScatterIcon } from 'lucide-react';
import type {
  CorrelationLag,
  CorrelationPreset,
  CorrelationResult,
  CorrelationWindow,
  MetricDefinition,
} from '@/lib/analytics/stats';
import { cn } from '@/lib/utils';

interface CorrelationsApiPayload {
  catalogue: MetricDefinition[];
  primary: CorrelationResult;
  presets?: Array<{
    preset: CorrelationPreset;
    result: CorrelationResult;
  }>;
  totalDaysTracked: number;
}

const DOMAIN_LABELS: Record<string, string> = {
  medication: 'Pharmacokinetics & Medication',
  sleep: 'Oura Sleep',
  readiness: 'Oura Readiness',
  stress: 'Stress & Resilience',
  activity: 'Activity & Workouts',
  cardio: 'Cardiovascular & SpO₂',
  tasks: 'Reminders Task Velocity',
};

function rBadgeColor(r: number | null): string {
  if (r === null) return 'text-[#8E8E93] bg-[#1C1C1E]';
  const abs = Math.abs(r);
  if (abs >= 0.5) return 'text-[#30D158] bg-[#30D158]/15';
  if (abs >= 0.25) return 'text-[#0A84FF] bg-[#0A84FF]/15';
  return 'text-[#8E8E93] bg-[#1C1C1E]';
}

export function CorrelationsClient({
  initialData,
}: {
  initialData: CorrelationsApiPayload;
}) {
  const [xKey, setXKey] = useState(initialData.primary.xKey);
  const [yKey, setYKey] = useState(initialData.primary.yKey);
  const [windowVal, setWindowVal] = useState<CorrelationWindow>(
    initialData.primary.window,
  );
  const [lag, setLag] = useState<CorrelationLag>(initialData.primary.lag);
  const [data, setData] = useState<CorrelationsApiPayload>(initialData);
  const [loading, setLoading] = useState(false);

  const fetchCorrelation = useCallback(
    async (
      nextX: string,
      nextY: string,
      nextWindow: CorrelationWindow,
      nextLag: CorrelationLag,
    ) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          x: nextX,
          y: nextY,
          window: nextWindow,
          lag: String(nextLag),
          presets: 'true',
        });
        const res = await fetch(`/api/analytics/correlations?${params.toString()}`);
        if (res.ok) {
          const json = (await res.json()) as CorrelationsApiPayload;
          setData(json);
        }
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (
      xKey === initialData.primary.xKey &&
      yKey === initialData.primary.yKey &&
      windowVal === initialData.primary.window &&
      lag === initialData.primary.lag
    ) {
      return;
    }
    void fetchCorrelation(xKey, yKey, windowVal, lag);
  }, [xKey, yKey, windowVal, lag, fetchCorrelation, initialData.primary]);

  const groupedCatalogue = useMemo(() => {
    const groups = new Map<string, MetricDefinition[]>();
    for (const def of data.catalogue) {
      const list = groups.get(def.domain) ?? [];
      list.push(def);
      groups.set(def.domain, list);
    }
    return Array.from(groups.entries());
  }, [data.catalogue]);

  const primary = data.primary;

  const chartPoints = useMemo(() => {
    const sorted = [...primary.points].sort((a, b) => a.x - b.x);
    return sorted.map((pt) => ({
      ...pt,
      regY:
        primary.slope !== null && primary.intercept !== null
          ? Math.round((primary.slope * pt.x + primary.intercept) * 1000) / 1000
          : null,
    }));
  }, [primary]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#F5F5F7]">
            Cross-Domain Correlation Lab
          </h1>
          <p className="text-xs text-[#8E8E93] mt-0.5">
            Pearson linear correlation (`r`), OLS regression slope, and multi-day lag explorer across Oura, Pharmacokinetics, Workouts, and Reminders.
          </p>
        </div>
        <div className="text-xs font-mono tabular-nums text-[#8E8E93]">
          Warehouse Days: <span className="text-[#F5F5F7]">{data.totalDaysTracked}</span>
        </div>
      </div>

      {/* Interactive Controls */}
      <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
        <div className="lg:col-span-4">
          <label className="block text-[11px] uppercase tracking-wider text-[#8E8E93] mb-1.5">
            X-Axis Predictor
          </label>
          <select
            value={xKey}
            onChange={(e) => setXKey(e.target.value)}
            className="w-full rounded-lg bg-[#1C1C1E] border border-white/[0.12] px-3 py-2 text-xs text-[#F5F5F7] focus:outline-none focus:border-[#0A84FF]"
          >
            {groupedCatalogue.map(([domain, defs]) => (
              <optgroup key={domain} label={DOMAIN_LABELS[domain] ?? domain}>
                {defs.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label} ({d.unit})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="lg:col-span-4">
          <label className="block text-[11px] uppercase tracking-wider text-[#8E8E93] mb-1.5">
            Y-Axis Outcome
          </label>
          <select
            value={yKey}
            onChange={(e) => setYKey(e.target.value)}
            className="w-full rounded-lg bg-[#1C1C1E] border border-white/[0.12] px-3 py-2 text-xs text-[#F5F5F7] focus:outline-none focus:border-[#0A84FF]"
          >
            {groupedCatalogue.map(([domain, defs]) => (
              <optgroup key={domain} label={DOMAIN_LABELS[domain] ?? domain}>
                {defs.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label} ({d.unit})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="lg:col-span-2">
          <span className="block text-[11px] uppercase tracking-wider text-[#8E8E93] mb-1.5">
            Date Window
          </span>
          <div className="grid grid-cols-4 rounded-lg bg-[#1C1C1E] p-0.5 border border-white/[0.08]">
            {(['30d', '90d', '365d', 'all'] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWindowVal(w)}
                className={cn(
                  'py-1.5 text-[11px] font-mono rounded-md transition-colors',
                  windowVal === w
                    ? 'bg-[#0A84FF] text-white font-medium'
                    : 'text-[#8E8E93] hover:text-[#F5F5F7]',
                )}
              >
                {w === 'all' ? 'All' : w}
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2">
          <span className="block text-[11px] uppercase tracking-wider text-[#8E8E93] mb-1.5">
            Outcome Lag
          </span>
          <div className="grid grid-cols-3 rounded-lg bg-[#1C1C1E] p-0.5 border border-white/[0.08]">
            {([0, 1, 2] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLag(l)}
                className={cn(
                  'py-1.5 text-[11px] font-mono rounded-md transition-colors',
                  lag === l
                    ? 'bg-[#0A84FF] text-white font-medium'
                    : 'text-[#8E8E93] hover:text-[#F5F5F7]',
                )}
              >
                +{l}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Statistical Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-3.5">
          <span className="text-[11px] text-[#8E8E93]">Pearson r</span>
          <p className="text-xl font-semibold font-mono tabular-nums mt-1 text-[#F5F5F7]">
            {primary.r !== null ? primary.r.toFixed(3) : '—'}
          </p>
        </div>
        <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-3.5">
          <span className="text-[11px] text-[#8E8E93]">Variance (R²)</span>
          <p className="text-xl font-semibold font-mono tabular-nums mt-1 text-[#F5F5F7]">
            {primary.rSquared !== null ? `${(primary.rSquared * 100).toFixed(1)}%` : '—'}
          </p>
        </div>
        <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-3.5">
          <span className="text-[11px] text-[#8E8E93]">Sample Size (n)</span>
          <p className="text-xl font-semibold font-mono tabular-nums mt-1 text-[#F5F5F7]">
            {primary.n}
          </p>
        </div>
        <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-3.5">
          <span className="text-[11px] text-[#8E8E93]">Regression Slope</span>
          <p className="text-xl font-semibold font-mono tabular-nums mt-1 text-[#30D158]">
            {primary.slope !== null ? primary.slope.toFixed(3) : '—'}
          </p>
        </div>
        <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-3.5 col-span-2 sm:col-span-1">
          <span className="text-[11px] text-[#8E8E93]">Approx p-value</span>
          <p className="text-xl font-semibold font-mono tabular-nums mt-1 text-[#0A84FF]">
            {primary.pValueApprox !== null ? primary.pValueApprox.toFixed(4) : '—'}
          </p>
        </div>
      </div>

      {/* Scatter Plot + Regression Line */}
      <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-[#F5F5F7] flex items-center gap-2">
              <ScatterIcon className="w-4 h-4 text-[#0A84FF]" />
              {primary.xLabel} vs. {primary.yLabel}
              {lag > 0 ? ` (+${lag}d Lag)` : ''}
            </h2>
            {primary.slope !== null && primary.intercept !== null && (
              <p className="text-xs font-mono tabular-nums text-[#8E8E93] mt-0.5">
                ŷ = {primary.slope.toFixed(4)}x {primary.intercept >= 0 ? '+' : '−'}{' '}
                {Math.abs(primary.intercept).toFixed(3)}
              </p>
            )}
          </div>
          {loading && (
            <span className="text-xs font-mono text-[#0A84FF]">Analysing pairs…</span>
          )}
        </div>

        <div className="h-80">
          {chartPoints.length >= 2 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartPoints}
                margin={{ top: 12, right: 20, left: 4, bottom: 16 }}
              >
                <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name={primary.xLabel}
                  unit={primary.xUnit ? ` ${primary.xUnit}` : ''}
                  domain={['auto', 'auto']}
                  tick={{ fill: '#8E8E93', fontSize: 10 }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name={primary.yLabel}
                  unit={primary.yUnit ? ` ${primary.yUnit}` : ''}
                  domain={['auto', 'auto']}
                  tick={{ fill: '#8E8E93', fontSize: 10 }}
                  width={54}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.2)' }}
                  contentStyle={{
                    backgroundColor: '#1C1C1E',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '8px',
                    fontSize: '11px',
                    color: '#F5F5F7',
                  }}
                  formatter={(value, name) => {
                    if (name === 'regY') {
                      return [`${Number(value).toFixed(2)}`, 'Regression Fit'];
                    }
                    return [String(value), String(name)];
                  }}
                  labelFormatter={(_label, payload) => {
                    const pt = payload?.[0]?.payload;
                    if (!pt) return '';
                    return pt.dayX === pt.dayY
                      ? `Day: ${pt.dayX}`
                      : `X: ${pt.dayX} → Y: ${pt.dayY}`;
                  }}
                />
                <Scatter
                  name={primary.yLabel}
                  dataKey="y"
                  fill="#0A84FF"
                  fillOpacity={0.85}
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey="regY"
                  stroke="#30D158"
                  strokeWidth={2}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs font-mono text-[#8E8E93] border border-dashed border-white/[0.08] rounded-lg">
              Fewer than 2 overlapping days for this metric pair and window ({primary.n} points)
            </div>
          )}
        </div>
      </div>

      {/* Pre-Built Analytical Pairs Matrix */}
      <div className="rounded-xl bg-[#141416] border border-white/[0.08] overflow-hidden">
        <div className="p-4 border-b border-white/[0.08]">
          <h2 className="text-sm font-semibold text-[#F5F5F7]">
            Pre-Built Analytical Hypotheses ({windowVal === 'all' ? 'All Time' : windowVal})
          </h2>
          <p className="text-xs text-[#8E8E93] mt-0.5">
            Click any hypothesis row to inspect its scatter plot and regression fit above.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[0.08] text-[#8E8E93] text-[11px] uppercase tracking-wider">
                <th className="py-2.5 px-4 font-medium">Hypothesis</th>
                <th className="py-2.5 px-4 font-medium">Category</th>
                <th className="py-2.5 px-4 font-medium">Lag</th>
                <th className="py-2.5 px-4 font-medium">n</th>
                <th className="py-2.5 px-4 font-medium">Pearson r</th>
                <th className="py-2.5 px-4 font-medium">Slope</th>
                <th className="py-2.5 px-4 font-medium text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {(data.presets ?? []).map(({ preset, result }) => {
                const isSelected =
                  xKey === preset.x && yKey === preset.y && lag === preset.lag;
                return (
                  <tr
                    key={preset.id}
                    onClick={() => {
                      setXKey(preset.x);
                      setYKey(preset.y);
                      setLag(preset.lag);
                    }}
                    className={cn(
                      'cursor-pointer transition-colors',
                      isSelected ? 'bg-[#0A84FF]/10' : 'hover:bg-[#1C1C1E]/60',
                    )}
                  >
                    <td className="py-2.5 px-4 font-medium text-[#F5F5F7]">
                      {preset.label}
                    </td>
                    <td className="py-2.5 px-4 text-[#8E8E93]">{preset.category}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[#8E8E93]">
                      +{preset.lag}d
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[#F5F5F7]">
                      {result.n}
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={cn(
                          'font-mono tabular-nums px-2 py-0.5 rounded text-[11px] font-medium',
                          rBadgeColor(result.r),
                        )}
                      >
                        {result.r !== null ? result.r.toFixed(3) : '—'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[#8E8E93]">
                      {result.slope !== null ? result.slope.toFixed(3) : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right text-[#0A84FF]">
                      <ArrowRight className="w-3.5 h-3.5 inline" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
