'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { Activity, HeartPulse, Wind } from 'lucide-react';
import type { CardioTelemetryData } from '@/lib/ui/telemetry-queries';
import { cn } from '@/lib/utils';

const SOURCE_COLORS: Record<string, string> = {
  sleep: '#0A84FF',
  rest: '#30D158',
  awake: '#8E8E93',
  workout: '#FF453A',
  session: '#BF5AF2',
  live: '#FF9F0A',
};

export function CardioClient({ data }: { data: CardioTelemetryData }) {
  const router = useRouter();

  const latestCardio = data.cardioSeries[data.cardioSeries.length - 1] ?? null;
  const latestVo2 = data.vo2MaxSeries[data.vo2MaxSeries.length - 1] ?? null;
  const latestSpo2 = data.spo2Series[data.spo2Series.length - 1] ?? null;

  const vascularDelta =
    latestCardio?.vascularAge !== null &&
    latestCardio?.vascularAge !== undefined &&
    data.chronologicalAge !== null
      ? latestCardio.vascularAge - data.chronologicalAge
      : null;

  const hrBySource = useMemo(() => {
    const groups: Record<
      string,
      Array<{ timeMin: number; timeLabel: string; bpm: number; source: string }>
    > = {
      sleep: [],
      rest: [],
      awake: [],
      workout: [],
      session: [],
      live: [],
    };

    for (const s of data.heartrateSamples) {
      const dt = new Date(s.timestamp);
      const timeMin = dt.getUTCHours() * 60 + dt.getUTCMinutes();
      const timeLabel = s.timestamp.slice(11, 16);
      const bucket = groups[s.source] ?? groups.awake;
      bucket.push({
        timeMin,
        timeLabel,
        bpm: s.bpm,
        source: s.source,
      });
    }

    return groups;
  }, [data.heartrateSamples]);

  const formatMinutesClock = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#F5F5F7]">
            Cardiovascular & Autonomic Telemetry
          </h1>
          <p className="text-xs text-[#8E8E93] mt-0.5">
            Longitudinal pulse wave velocity, vascular age divergence, VO₂ Max, nocturnal SpO₂, and discrete 24-hour heart rate resolution.
          </p>
        </div>
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-4">
          <p className="text-[11px] uppercase tracking-wider text-[#8E8E93]">
            Pulse Wave Velocity
          </p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-semibold tabular-nums text-[#0A84FF]">
              {latestCardio?.pulseWaveVelocity !== null &&
              latestCardio?.pulseWaveVelocity !== undefined
                ? latestCardio.pulseWaveVelocity.toFixed(2)
                : '—'}
            </span>
            <span className="text-xs font-mono text-[#8E8E93]">m/s</span>
          </div>
          <p className="text-[11px] font-mono text-[#8E8E93] mt-1">
            Latest reading: {latestCardio?.day ?? '—'}
          </p>
        </div>

        <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-4">
          <p className="text-[11px] uppercase tracking-wider text-[#8E8E93]">
            Vascular vs. Chronological Age
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-semibold tabular-nums text-[#F5F5F7]">
              {latestCardio?.vascularAge ?? '—'}
            </span>
            <span className="text-xs font-mono text-[#8E8E93]">
              yrs vs {data.chronologicalAge ?? '—'} chrono
            </span>
          </div>
          <p
            className={cn(
              'text-[11px] font-mono tabular-nums mt-1',
              vascularDelta === null
                ? 'text-[#8E8E93]'
                : vascularDelta <= 0
                  ? 'text-[#30D158]'
                  : 'text-[#FF9F0A]',
            )}
          >
            {vascularDelta !== null
              ? `Delta: ${vascularDelta >= 0 ? '+' : ''}${vascularDelta} years`
              : 'Personal info age required for delta'}
          </p>
        </div>

        <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-4">
          <p className="text-[11px] uppercase tracking-wider text-[#8E8E93] flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-[#30D158]" />
            Cardio Capacity (VO₂ Max)
          </p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-semibold tabular-nums text-[#30D158]">
              {latestVo2?.vo2Max ?? '—'}
            </span>
            <span className="text-xs font-mono text-[#8E8E93]">mL/kg/min</span>
          </div>
          <p className="text-[11px] font-mono text-[#8E8E93] mt-1">
            Updated: {latestVo2?.day ?? '—'}
          </p>
        </div>

        <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-4">
          <p className="text-[11px] uppercase tracking-wider text-[#8E8E93] flex items-center gap-1.5">
            <Wind className="w-3.5 h-3.5 text-[#FF9F0A]" />
            Nocturnal SpO₂ & BDI
          </p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-semibold tabular-nums text-[#F5F5F7]">
              {latestSpo2?.spo2Average !== null &&
              latestSpo2?.spo2Average !== undefined
                ? `${latestSpo2.spo2Average.toFixed(1)}%`
                : '—'}
            </span>
            <span className="text-xs font-mono text-[#8E8E93]">
              · BDI {latestSpo2?.breathingDisturbanceIndex ?? '—'}
            </span>
          </div>
          <p className="text-[11px] font-mono text-[#8E8E93] mt-1">
            Recorded: {latestSpo2?.day ?? '—'}
          </p>
        </div>
      </div>

      {/* Pulse Wave Velocity & Vascular Age Longitudinal Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-[#F5F5F7]">
                Pulse Wave Velocity (m/s) & Vascular Age
              </h2>
              <p className="text-xs text-[#8E8E93]">
                Arterial stiffness longitudinal trajectory
              </p>
            </div>
          </div>
          <div className="h-64">
            {data.cardioSeries.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.cardioSeries}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: '#8E8E93', fontSize: 10 }}
                    minTickGap={24}
                  />
                  <YAxis
                    yAxisId="pwv"
                    domain={['auto', 'auto']}
                    tick={{ fill: '#0A84FF', fontSize: 10 }}
                    width={40}
                  />
                  <YAxis
                    yAxisId="age"
                    orientation="right"
                    domain={['auto', 'auto']}
                    tick={{ fill: '#30D158', fontSize: 10 }}
                    width={36}
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
                  <Line
                    yAxisId="pwv"
                    type="monotone"
                    dataKey="pulseWaveVelocity"
                    name="PWV (m/s)"
                    stroke="#0A84FF"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="age"
                    type="monotone"
                    dataKey="vascularAge"
                    name="Vascular Age (yrs)"
                    stroke="#30D158"
                    strokeWidth={1.75}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs font-mono text-[#8E8E93] border border-dashed border-white/[0.08] rounded-lg">
                No cardiovascular age telemetry synced yet
              </div>
            )}
          </div>
        </div>

        {/* VO2 Max & SpO2 Trends */}
        <div className="grid grid-rows-2 gap-4">
          <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-4">
            <h2 className="text-sm font-semibold text-[#F5F5F7] mb-2">
              VO₂ Max Trend (mL/kg/min)
            </h2>
            <div className="h-28">
              {data.vo2MaxSeries.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.vo2MaxSeries}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fill: '#8E8E93', fontSize: 10 }} minTickGap={20} />
                    <YAxis domain={['auto', 'auto']} tick={{ fill: '#30D158', fontSize: 10 }} width={35} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1C1C1E',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '8px',
                        fontSize: '11px',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="vo2Max"
                      name="VO2 Max"
                      stroke="#30D158"
                      strokeWidth={2}
                      dot={{ r: 2, fill: '#30D158' }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs font-mono text-[#8E8E93]">
                  Awaiting VO₂ Max estimates
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-4">
            <h2 className="text-sm font-semibold text-[#F5F5F7] mb-2">
              SpO₂ Average (%) & Breathing Disturbance Index
            </h2>
            <div className="h-28">
              {data.spo2Series.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.spo2Series}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fill: '#8E8E93', fontSize: 10 }} minTickGap={20} />
                    <YAxis
                      yAxisId="spo2"
                      domain={[90, 100]}
                      tick={{ fill: '#0A84FF', fontSize: 10 }}
                      width={35}
                    />
                    <YAxis
                      yAxisId="bdi"
                      orientation="right"
                      domain={[0, 'auto']}
                      tick={{ fill: '#FF9F0A', fontSize: 10 }}
                      width={30}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1C1C1E',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '8px',
                        fontSize: '11px',
                      }}
                    />
                    <Line
                      yAxisId="spo2"
                      type="monotone"
                      dataKey="spo2Average"
                      name="SpO2 (%)"
                      stroke="#0A84FF"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="bdi"
                      type="monotone"
                      dataKey="breathingDisturbanceIndex"
                      name="BDI"
                      stroke="#FF9F0A"
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs font-mono text-[#8E8E93]">
                  Awaiting SpO₂ nocturnal aggregates
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 24-Hour Discrete Heart Rate Explorer */}
      <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-[#F5F5F7] flex items-center gap-1.5">
              <HeartPulse className="w-4 h-4 text-[#FF453A]" />
              24-Hour Discrete Heart Rate Explorer
            </h2>
            <p className="text-xs text-[#8E8E93]">
              Discrete `oura_heartrate` samples coloured by sensing context (`sleep`, `rest`, `awake`, `workout`, `session`, `live`).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
              {Object.entries(SOURCE_COLORS).map(([src, color]) => (
                <span key={src} className="flex items-center gap-1 text-[#8E8E93]">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                  {src}
                </span>
              ))}
            </div>

            {data.availableHrDays.length > 0 && (
              <select
                value={data.selectedDay ?? ''}
                onChange={(e) =>
                  router.push(`/cardio?day=${encodeURIComponent(e.target.value)}`)
                }
                className="rounded-lg bg-[#1C1C1E] border border-white/[0.12] px-2.5 py-1 text-xs font-mono tabular-nums text-[#F5F5F7]"
              >
                {data.availableHrDays.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="h-72">
          {data.heartrateSamples.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  type="number"
                  dataKey="timeMin"
                  domain={[0, 1440]}
                  ticks={[0, 180, 360, 540, 720, 900, 1080, 1260, 1440]}
                  tickFormatter={formatMinutesClock}
                  tick={{ fill: '#8E8E93', fontSize: 10 }}
                  name="Time (UTC)"
                />
                <YAxis
                  type="number"
                  dataKey="bpm"
                  domain={['auto', 'auto']}
                  tick={{ fill: '#8E8E93', fontSize: 10 }}
                  width={36}
                  name="BPM"
                />
                <ZAxis range={[18, 18]} />
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
                    if (name === 'Time (UTC)') {
                      return [formatMinutesClock(Number(value)), 'Time'];
                    }
                    return [`${value} bpm`, 'Heart Rate'];
                  }}
                />
                {Object.entries(hrBySource).map(([source, rows]) =>
                  rows.length > 0 ? (
                    <Scatter
                      key={source}
                      name={source}
                      data={rows}
                      fill={SOURCE_COLORS[source] ?? '#8E8E93'}
                      isAnimationActive={false}
                    />
                  ) : null,
                )}
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs font-mono text-[#8E8E93] border border-dashed border-white/[0.08] rounded-lg">
              No discrete heartrate samples recorded for selected day
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
