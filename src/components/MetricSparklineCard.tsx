'use client';

import { useId } from 'react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface SparklinePoint {
  day: string;
  value: number | null;
}

export function MetricSparklineCard({
  title,
  unit,
  latestValue,
  accentColor,
  data,
  decimals = 0,
}: {
  title: string;
  unit: string;
  latestValue: number | null;
  accentColor: string;
  data: SparklinePoint[];
  decimals?: number;
}) {
  const gradId = useId().replace(/:/g, '');
  const validPoints = data.filter(
    (d): d is { day: string; value: number } =>
      typeof d.value === 'number' && Number.isFinite(d.value),
  );

  const avg =
    validPoints.length > 0
      ? validPoints.reduce((s, d) => s + d.value, 0) / validPoints.length
      : null;

  const delta =
    latestValue !== null && avg !== null ? latestValue - avg : null;

  return (
    <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-4 flex flex-col justify-between">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-[#8E8E93] font-medium">
            {title}
          </p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-semibold tracking-tight tabular-nums text-[#F5F5F7]">
              {latestValue !== null ? latestValue.toFixed(decimals) : '—'}
            </span>
            <span className="text-xs text-[#8E8E93] font-mono">{unit}</span>
          </div>
        </div>
        {delta !== null && (
          <span className="text-[11px] font-mono tabular-nums px-2 py-0.5 rounded bg-[#1C1C1E] border border-white/[0.08] text-[#8E8E93]">
            {delta >= 0 ? '+' : ''}
            {delta.toFixed(decimals)} vs 14d
          </span>
        )}
      </div>

      <div className="h-20 mt-3">
        {validPoints.length >= 2 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={validPoints}
              margin={{ top: 4, right: 2, left: 2, bottom: 0 }}
            >
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={accentColor} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={accentColor} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" hide />
              <YAxis domain={['auto', 'auto']} hide />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1C1C1E',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '8px',
                  fontSize: '11px',
                  color: '#F5F5F7',
                }}
                formatter={(val) => [
                  `${Number(val).toFixed(decimals)} ${unit}`,
                  title,
                ]}
                labelFormatter={(label) => String(label)}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={accentColor}
                strokeWidth={1.75}
                fillOpacity={1}
                fill={`url(#${gradId})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-[11px] font-mono text-[#8E8E93] border border-dashed border-white/[0.08] rounded-lg">
            Awaiting telemetry points
          </div>
        )}
      </div>
    </div>
  );
}
