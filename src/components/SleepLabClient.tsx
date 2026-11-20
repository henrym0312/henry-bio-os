'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Clock, Heart, Moon, Pill } from 'lucide-react';
import type { SleepLabData } from '@/lib/ui/telemetry-queries';
import { cn, formatDurationSeconds } from '@/lib/utils';

const STAGE_LABEL: Record<number, string> = {
  1: 'Deep',
  2: 'Light',
  3: 'REM',
  4: 'Awake',
};

const MOVEMENT_LABEL: Record<number, string> = {
  1: 'Still',
  2: 'Restless',
  3: 'Tossing',
  4: 'Active',
};

function formatClockTime(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso.slice(11, 16);
  return dt.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function SleepLabClient({ data }: { data: SleepLabData }) {
  const router = useRouter();
  const night = data.selectedNight;

  const hypnogramData = useMemo(() => {
    if (!night?.sleepPhase30Sec) return [];
    const phases = night.sleepPhase30Sec;
    const movements = night.movement30Sec ?? '';
    const startMs = Date.parse(night.bedtimeStart);
    const out: Array<{
      index: number;
      time: string;
      stage: number;
      stageName: string;
      movement: number;
      movementName: string;
    }> = [];

    for (let i = 0; i < phases.length; i++) {
      const stageCode = Number(phases[i]);
      const moveCode = movements[i] ? Number(movements[i]) : 1;
      const validStage = stageCode >= 1 && stageCode <= 4 ? stageCode : 2;
      const validMove = moveCode >= 1 && moveCode <= 4 ? moveCode : 1;
      const tIso = Number.isNaN(startMs)
        ? `${i}`
        : new Date(startMs + i * 30_000).toISOString();
      out.push({
        index: i,
        time: Number.isNaN(startMs) ? `${Math.round((i * 0.5))}m` : formatClockTime(tIso),
        stage: validStage,
        stageName: STAGE_LABEL[validStage] ?? 'Light',
        movement: validMove - 1, // 0 = Still, 1 = Restless, 2 = Tossing, 3 = Active
        movementName: MOVEMENT_LABEL[validMove] ?? 'Still',
      });
    }
    return out;
  }, [night]);

  const hrHrvSeries = useMemo(() => {
    if (!night) return { points: [], sampleMinHr: null as number | null, nadirTime: null as string | null };
    const hrItems = night.heartRate?.items ?? [];
    const hrInterval = night.heartRate?.interval ?? 300;
    const hrStartMs = Date.parse(night.heartRate?.timestamp ?? night.bedtimeStart);

    const hrvItems = night.hrv?.items ?? [];
    const hrvInterval = night.hrv?.interval ?? 300;
    const hrvStartMs = Date.parse(night.hrv?.timestamp ?? night.bedtimeStart);

    const maxLen = Math.max(hrItems.length, hrvItems.length);
    const points: Array<{
      time: string;
      hr: number | null;
      hrv: number | null;
    }> = [];

    let sampleMinHr: number | null = null;
    let nadirTime: string | null = null;

    for (let i = 0; i < maxLen; i++) {
      const hrVal = typeof hrItems[i] === 'number' ? hrItems[i] : null;
      const hrvVal = typeof hrvItems[i] === 'number' ? hrvItems[i] : null;
      const tMs = !Number.isNaN(hrStartMs)
        ? hrStartMs + i * hrInterval * 1000
        : hrvStartMs + i * hrvInterval * 1000;
      const label = !Number.isNaN(tMs)
        ? formatClockTime(new Date(tMs).toISOString())
        : `${i * 5}m`;

      if (hrVal !== null && (sampleMinHr === null || hrVal < sampleMinHr)) {
        sampleMinHr = hrVal;
        nadirTime = label;
      }

      points.push({
        time: label,
        hr: hrVal,
        hrv: hrvVal,
      });
    }

    return { points, sampleMinHr, nadirTime };
  }, [night]);

  if (!night) {
    return (
      <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-8 text-center">
        <Moon className="w-8 h-8 text-[#0A84FF] mx-auto mb-3" />
        <h2 className="text-base font-semibold text-[#F5F5F7]">
          No Sleep Epochs Ingested Yet
        </h2>
        <p className="text-xs text-[#8E8E93] mt-1 max-w-md mx-auto">
          Run an Oura historical backfill or wait for your next sleep webhook to inspect 30-second hypnograms, 5-minute HRV traces, and bedtime pharmacokinetic clearance.
        </p>
      </div>
    );
  }

  const totalStagesSec =
    (night.deepSleepDuration ?? 0) +
    (night.remSleepDuration ?? 0) +
    (night.lightSleepDuration ?? 0) +
    (night.awakeTime ?? 0);

  const stageBreakdown = [
    {
      label: 'Deep (SWS)',
      sec: night.deepSleepDuration ?? 0,
      color: '#0A84FF',
    },
    {
      label: 'REM',
      sec: night.remSleepDuration ?? 0,
      color: '#30D158',
    },
    {
      label: 'Light',
      sec: night.lightSleepDuration ?? 0,
      color: '#64D2FF',
    },
    {
      label: 'Awake',
      sec: night.awakeTime ?? 0,
      color: '#FF9F0A',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Night Selector Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl bg-[#141416] border border-white/[0.08] p-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-[#F5F5F7]">
              High-Resolution Sleep Lab
            </h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#1C1C1E] border border-white/[0.08] text-[#8E8E93]">
              {night.sleepAlgorithmVersion ?? 'v2'} · {night.type ?? 'sleep'}
            </span>
          </div>
          <p className="text-xs text-[#8E8E93] mt-0.5 font-mono tabular-nums">
            {night.day} · {formatClockTime(night.bedtimeStart)} →{' '}
            {formatClockTime(night.bedtimeEnd)} · Time in bed:{' '}
            {formatDurationSeconds(night.timeInBed)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="night-select"
            className="text-xs text-[#8E8E93] font-medium whitespace-nowrap"
          >
            Select Night:
          </label>
          <select
            id="night-select"
            value={night.id}
            onChange={(e) => router.push(`/sleep?night=${encodeURIComponent(e.target.value)}`)}
            className="rounded-lg bg-[#1C1C1E] border border-white/[0.12] px-3 py-1.5 text-xs font-mono tabular-nums text-[#F5F5F7] focus:outline-none focus:border-[#0A84FF]"
          >
            {data.nights.map((n) => (
              <option key={n.id} value={n.id}>
                {n.day} ({n.type ?? 'sleep'}) · {formatDurationSeconds(n.totalSleepDuration)} · HRV{' '}
                {n.averageHrv ?? '—'}ms
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Key Nocturnal Metrics & Bedtime Serum Callout */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-4">
          <p className="text-[11px] uppercase tracking-wider text-[#8E8E93]">
            Total Sleep & Efficiency
          </p>
          <p className="text-2xl font-semibold tabular-nums mt-1 text-[#F5F5F7]">
            {formatDurationSeconds(night.totalSleepDuration)}
          </p>
          <p className="text-xs font-mono tabular-nums text-[#8E8E93] mt-1">
            Efficiency: <span className="text-[#30D158]">{night.efficiency ?? '—'}%</span> ·
            Latency:{' '}
            <span className="text-[#F5F5F7]">
              {night.latency !== null ? `${Math.round(night.latency / 60)}m` : '—'}
            </span>
          </p>
        </div>

        <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-4">
          <p className="text-[11px] uppercase tracking-wider text-[#8E8E93] flex items-center gap-1.5">
            <Heart className="w-3.5 h-3.5 text-[#FF453A]" />
            eCore 30s Nadir HR
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-semibold tabular-nums text-[#30D158]">
              {night.lowestHeartRate ?? '—'}
            </span>
            <span className="text-xs font-mono text-[#8E8E93]">bpm (30s eCore)</span>
          </div>
          <p className="text-xs font-mono tabular-nums text-[#8E8E93] mt-1">
            5m sample min: {hrHrvSeries.sampleMinHr ?? '—'} bpm
            {hrHrvSeries.nadirTime ? ` @ ${hrHrvSeries.nadirTime}` : ''} · Avg:{' '}
            {night.averageHeartRate ? night.averageHeartRate.toFixed(1) : '—'} bpm
          </p>
        </div>

        <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-4">
          <p className="text-[11px] uppercase tracking-wider text-[#8E8E93]">
            Autonomic HRV & Respiration
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-semibold tabular-nums text-[#0A84FF]">
              {night.averageHrv ?? '—'}
            </span>
            <span className="text-xs font-mono text-[#8E8E93]">ms RMSSD</span>
          </div>
          <p className="text-xs font-mono tabular-nums text-[#8E8E93] mt-1">
            Resp rate:{' '}
            <span className="text-[#F5F5F7]">
              {night.averageBreath !== null ? `${night.averageBreath.toFixed(1)} br/m` : '—'}
            </span>{' '}
            · Restless: {night.restlessPeriods ?? '—'}
          </p>
        </div>

        {/* Bedtime Serum Callout */}
        <div className="rounded-xl bg-[#141416] border border-[#0A84FF]/30 p-4">
          <p className="text-[11px] uppercase tracking-wider text-[#0A84FF] flex items-center gap-1.5 font-medium">
            <Pill className="w-3.5 h-3.5" />
            Bedtime Serum Concentration
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <span
              className={cn(
                'text-2xl font-semibold tabular-nums',
                (data.bedtimePk?.bedtimeSerumNgMl ?? 0) > 25
                  ? 'text-[#FF453A]'
                  : (data.bedtimePk?.bedtimeSerumNgMl ?? 0) > 12
                    ? 'text-[#FF9F0A]'
                    : 'text-[#30D158]',
              )}
            >
              {data.bedtimePk ? data.bedtimePk.bedtimeSerumNgMl.toFixed(2) : '0.00'}
            </span>
            <span className="text-xs font-mono text-[#8E8E93]">ng/mL @ sleep onset</span>
          </div>
          <p className="text-xs font-mono tabular-nums text-[#8E8E93] mt-1">
            Last dose:{' '}
            {data.bedtimePk?.hoursSinceLastDose !== null &&
            data.bedtimePk?.hoursSinceLastDose !== undefined
              ? `${data.bedtimePk.hoursSinceLastDose.toFixed(1)}h prior`
              : 'None in 72h'}{' '}
            · 24h load: {data.bedtimePk?.totalDailyMg ?? 0} mg
          </p>
        </div>
      </div>

      {/* Stage Proportion Strip */}
      <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-[#F5F5F7]">
            Sleep Stage Architecture
          </span>
          <span className="text-xs font-mono tabular-nums text-[#8E8E93]">
            {formatDurationSeconds(totalStagesSec)} total epoch span
          </span>
        </div>
        <div className="h-3 rounded-full overflow-hidden flex bg-[#1C1C1E]">
          {stageBreakdown.map((st) => {
            const pct = totalStagesSec > 0 ? (st.sec / totalStagesSec) * 100 : 0;
            return (
              <div
                key={st.label}
                style={{ width: `${pct}%`, backgroundColor: st.color }}
                title={`${st.label}: ${formatDurationSeconds(st.sec)} (${pct.toFixed(1)}%)`}
              />
            );
          })}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          {stageBreakdown.map((st) => {
            const pct = totalStagesSec > 0 ? (st.sec / totalStagesSec) * 100 : 0;
            return (
              <div key={st.label} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-[#8E8E93]">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: st.color }}
                  />
                  {st.label}
                </span>
                <span className="font-mono tabular-nums text-[#F5F5F7]">
                  {formatDurationSeconds(st.sec)} ({pct.toFixed(0)}%)
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 30-Second Hypnogram + 30-Second Movement Overlay */}
      <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-[#F5F5F7]">
              30-Second Hypnogram & Movement Overlay
            </h2>
            <p className="text-xs text-[#8E8E93]">
              Raw 30s staging (`sleep_phase_30_sec`) with synchronised 30s accelerometry movement bars (`movement_30_sec`).
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono text-[#8E8E93]">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#0A84FF]" /> Sleep Stage
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#FF9F0A]/70 rounded-xs" /> Movement (0–3)
            </span>
          </div>
        </div>

        <div className="h-72">
          {hypnogramData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={hypnogramData}
                margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
              >
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="time"
                  tick={{ fill: '#8E8E93', fontSize: 10 }}
                  minTickGap={40}
                  stroke="rgba(255,255,255,0.08)"
                />
                <YAxis
                  yAxisId="stage"
                  domain={[0.5, 4.3]}
                  ticks={[1, 2, 3, 4]}
                  tickFormatter={(v) => STAGE_LABEL[v] ?? ''}
                  tick={{ fill: '#8E8E93', fontSize: 11 }}
                  stroke="rgba(255,255,255,0.08)"
                  width={50}
                />
                <YAxis
                  yAxisId="move"
                  orientation="right"
                  domain={[0, 5]}
                  ticks={[0, 1, 2, 3]}
                  tick={{ fill: '#8E8E93', fontSize: 10 }}
                  stroke="rgba(255,255,255,0.08)"
                  width={28}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1C1C1E',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '8px',
                    fontSize: '11px',
                    color: '#F5F5F7',
                  }}
                  formatter={(val, name) => {
                    if (name === 'stage') {
                      const stageStr: string =
                        STAGE_LABEL[Number(val)] ?? String(val);
                      const labelStr: string = 'Sleep Stage';
                      return [stageStr, labelStr];
                    }
                    const moveStr: string =
                      MOVEMENT_LABEL[Number(val) + 1] ?? String(val);
                    const moveLabel: string = '30s Movement';
                    return [moveStr, moveLabel];
                  }}
                />
                <Bar
                  yAxisId="move"
                  dataKey="movement"
                  fill="rgba(255, 159, 10, 0.55)"
                  barSize={2}
                  isAnimationActive={false}
                />
                <Area
                  yAxisId="stage"
                  type="stepAfter"
                  dataKey="stage"
                  stroke="#0A84FF"
                  strokeWidth={1.75}
                  fill="#0A84FF"
                  fillOpacity={0.14}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs font-mono text-[#8E8E93] border border-dashed border-white/[0.08] rounded-lg">
              30-second hypnogram string not present on this sleep record
            </div>
          )}
        </div>
      </div>

      {/* 5-Minute Nocturnal HR & HRV + eCore Nadir Marker */}
      <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-[#F5F5F7]">
              5-Minute Nocturnal Heart Rate & HRV Curves
            </h2>
            <p className="text-xs text-[#8E8E93]">
              Green dashed reference line marks Oura eCore 30-second nadir HR ({night.lowestHeartRate ?? '—'} bpm).
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono text-[#8E8E93]">
            <span className="text-[#FF453A]">— HR (bpm)</span>
            <span className="text-[#0A84FF]">— HRV (ms)</span>
            <span className="text-[#30D158]">--- eCore Lowest HR</span>
          </div>
        </div>

        <div className="h-72">
          {hrHrvSeries.points.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={hrHrvSeries.points}
                margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
              >
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="time"
                  tick={{ fill: '#8E8E93', fontSize: 10 }}
                  minTickGap={24}
                  stroke="rgba(255,255,255,0.08)"
                />
                <YAxis
                  yAxisId="hr"
                  domain={['auto', 'auto']}
                  tick={{ fill: '#FF453A', fontSize: 10 }}
                  stroke="rgba(255,255,255,0.08)"
                  width={40}
                />
                <YAxis
                  yAxisId="hrv"
                  orientation="right"
                  domain={['auto', 'auto']}
                  tick={{ fill: '#0A84FF', fontSize: 10 }}
                  stroke="rgba(255,255,255,0.08)"
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1C1C1E',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '8px',
                    fontSize: '11px',
                    color: '#F5F5F7',
                  }}
                />
                {night.lowestHeartRate !== null && (
                  <ReferenceLine
                    yAxisId="hr"
                    y={night.lowestHeartRate}
                    stroke="#30D158"
                    strokeDasharray="4 4"
                    label={{
                      value: `eCore 30s Min: ${night.lowestHeartRate} bpm`,
                      fill: '#30D158',
                      fontSize: 10,
                      position: 'insideTopLeft',
                    }}
                  />
                )}
                <Line
                  yAxisId="hr"
                  type="monotone"
                  dataKey="hr"
                  name="Heart Rate (bpm)"
                  stroke="#FF453A"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="hrv"
                  type="monotone"
                  dataKey="hrv"
                  name="HRV (ms)"
                  stroke="#0A84FF"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs font-mono text-[#8E8E93] border border-dashed border-white/[0.08] rounded-lg">
              5-minute HR/HRV sample arrays unavailable for this period
            </div>
          )}
        </div>
      </div>

      {/* Bottom Grid: Nocturnal Serum Washout & 14-Day Sleep Debt */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-[#F5F5F7]">
                Nocturnal Pharmacokinetic Washout
              </h2>
              <p className="text-xs text-[#8E8E93]">
                Bateman decay profile from bedtime_start through wake
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-[#0A84FF]">
              Start: {data.bedtimePk ? `${data.bedtimePk.bedtimeSerumNgMl.toFixed(2)} ng/mL` : '0.00 ng/mL'}
            </span>
          </div>
          <div className="h-52">
            {data.nocturnalPkCurve.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={data.nocturnalPkCurve.map((p) => ({
                    time: formatClockTime(p.timestamp),
                    serumNgMl: p.serumNgMl,
                  }))}
                >
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="time"
                    tick={{ fill: '#8E8E93', fontSize: 10 }}
                    minTickGap={24}
                  />
                  <YAxis tick={{ fill: '#8E8E93', fontSize: 10 }} width={40} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1C1C1E',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '8px',
                      fontSize: '11px',
                      color: '#F5F5F7',
                    }}
                    formatter={(v) => [`${Number(v).toFixed(2)} ng/mL`, 'Serum Conc.']}
                  />
                  <Area
                    type="monotone"
                    dataKey="serumNgMl"
                    stroke="#0A84FF"
                    fill="#0A84FF"
                    fillOpacity={0.2}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs font-mono text-[#8E8E93]">
                No medication doses within 72h of sleep onset
              </div>
            )}
          </div>
          {data.bedtimePk && data.bedtimePk.activeDoses.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/[0.08] space-y-1">
              {data.bedtimePk.activeDoses.map((dose, idx) => (
                <div
                  key={`${dose.doseId}-${idx}`}
                  className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[#8E8E93]"
                >
                  <span>
                    {dose.doseId} ({dose.mg}mg {dose.drugType}) · -{dose.hoursElapsed}h
                  </span>
                  <span className="text-[#F5F5F7]">{dose.contributionNgMl.toFixed(2)} ng/mL</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 14-Day Sleep Debt Tracker */}
        <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-[#F5F5F7] flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#FF9F0A]" />
                14-Day Sleep Debt Tracker
              </h2>
              <p className="text-xs text-[#8E8E93]">
                Nightly surplus/deficit vs. {data.sleepDebt14d.targetHoursPerNight}h baseline target
              </p>
            </div>
            <span
              className={cn(
                'text-xs font-mono tabular-nums px-2 py-0.5 rounded bg-[#1C1C1E] border border-white/[0.08]',
                data.sleepDebt14d.cumulativeDebtHours > 5
                  ? 'text-[#FF453A]'
                  : data.sleepDebt14d.cumulativeDebtHours > 0
                    ? 'text-[#FF9F0A]'
                    : 'text-[#30D158]',
              )}
            >
              Net Debt: {data.sleepDebt14d.cumulativeDebtHours >= 0 ? '+' : ''}
              {data.sleepDebt14d.cumulativeDebtHours.toFixed(1)}h
            </span>
          </div>

          <div className="h-52">
            {data.sleepDebt14d.nightlySeries.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.sleepDebt14d.nightlySeries}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(d) => String(d).slice(5)}
                    tick={{ fill: '#8E8E93', fontSize: 10 }}
                  />
                  <YAxis tick={{ fill: '#8E8E93', fontSize: 10 }} width={36} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1C1C1E',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '8px',
                      fontSize: '11px',
                      color: '#F5F5F7',
                    }}
                    formatter={(v) => [
                      `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(2)}h`,
                      'Delta vs 8h',
                    ]}
                  />
                  <Bar dataKey="deltaHours" isAnimationActive={false}>
                    {data.sleepDebt14d.nightlySeries.map((entry) => (
                      <Cell
                        key={entry.day}
                        fill={entry.deltaHours >= 0 ? '#30D158' : '#FF453A'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs font-mono text-[#8E8E93]">
                Insufficient nights to compute sleep debt
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
