'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Database, Search } from 'lucide-react';
import type { DailyMetricRow } from '@/lib/analytics/stats';
import { ALL_OURA_ENDPOINTS, type OuraEndpointKey } from '@/lib/oura/types';
import { cn } from '@/lib/utils';

const HEATMAP_METRICS = [
  { key: 'daily_readiness.score', label: 'Readiness Score', unit: 'pts', invert: false },
  { key: 'sleep.score', label: 'Sleep Score', unit: 'pts', invert: false },
  { key: 'sleep.average_hrv', label: 'Nocturnal HRV', unit: 'ms', invert: false },
  { key: 'sleep.lowest_heart_rate', label: 'Lowest HR', unit: 'bpm', invert: true },
  { key: 'daily_activity.score', label: 'Activity Score', unit: 'pts', invert: false },
  { key: 'daily_activity.steps', label: 'Daily Steps', unit: 'steps', invert: false },
  { key: 'daily_stress.stress_high', label: 'High Stress', unit: 'min', invert: true },
  { key: 'bedtime_serum_ng_ml', label: 'Bedtime Serum', unit: 'ng/mL', invert: true },
  { key: 'daily_task_metrics.completionPct', label: 'Task Completion', unit: '%', invert: false },
] as const;

interface RawRecordItem {
  id: string;
  day: string;
  preview: string;
  rawPayload: Record<string, unknown>;
}

function getHeatmapColor(
  val: number | null,
  min: number,
  max: number,
  invert: boolean,
): string {
  if (val === null || !Number.isFinite(val)) return '#1C1C1E';
  const span = max - min;
  let ratio = span > 1e-6 ? (val - min) / span : 0.5;
  if (invert) ratio = 1 - ratio;

  if (ratio >= 0.75) return '#30D158';
  if (ratio >= 0.5) return '#0A84FF';
  if (ratio >= 0.25) return '#1D4ED8';
  return '#172554';
}

export function ArchiveClient({
  heatmapMatrix,
  initialTable,
  initialRecords,
  initialTotal,
}: {
  heatmapMatrix: DailyMetricRow[];
  initialTable: OuraEndpointKey;
  initialRecords: RawRecordItem[];
  initialTotal: number;
}) {
  const [selectedMetricKey, setSelectedMetricKey] = useState<string>(
    HEATMAP_METRICS[0].key,
  );
  const [hoveredCell, setHoveredCell] = useState<{
    day: string;
    value: number | null;
  } | null>(null);

  const [tableKey, setTableKey] = useState<OuraEndpointKey>(initialTable);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [records, setRecords] = useState<RawRecordItem[]>(initialRecords);
  const [total, setTotal] = useState(initialTotal);
  const [loadingRows, setLoadingRows] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(
    initialRecords[0]?.id ?? null,
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const metricMeta =
    HEATMAP_METRICS.find((m) => m.key === selectedMetricKey) ?? HEATMAP_METRICS[0];

  // Build 53-week x 7-day calendar grid ending today
  const { weeks, minVal, maxVal } = useMemo(() => {
    const valMap = new Map<string, number>();
    let min = Infinity;
    let max = -Infinity;

    for (const row of heatmapMatrix) {
      const v = row.values[selectedMetricKey];
      if (typeof v === 'number' && Number.isFinite(v)) {
        valMap.set(row.day, v);
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }

    const endDt = new Date();
    const startDt = new Date(endDt);
    startDt.setUTCDate(startDt.getUTCDate() - 364);
    // Align start to Monday (1)
    const dayOfWeek = (startDt.getUTCDay() + 6) % 7;
    startDt.setUTCDate(startDt.getUTCDate() - dayOfWeek);

    const gridWeeks: Array<Array<{ day: string; value: number | null }>> = [];
    const cursor = new Date(startDt);

    while (cursor <= endDt) {
      const weekCol: Array<{ day: string; value: number | null }> = [];
      for (let d = 0; d < 7; d++) {
        const isoDay = cursor.toISOString().slice(0, 10);
        weekCol.push({
          day: isoDay,
          value: valMap.get(isoDay) ?? null,
        });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      gridWeeks.push(weekCol);
    }

    return {
      weeks: gridWeeks,
      minVal: Number.isFinite(min) ? min : 0,
      maxVal: Number.isFinite(max) ? max : 100,
    };
  }, [heatmapMatrix, selectedMetricKey]);

  const fetchRecords = useCallback(
    async (tbl: OuraEndpointKey, q: string, pg: number) => {
      setLoadingRows(true);
      try {
        const params = new URLSearchParams({
          table: tbl,
          q,
          page: String(pg),
        });
        const res = await fetch(`/api/archive/records?${params.toString()}`);
        if (res.ok) {
          const json = (await res.json()) as {
            rows: RawRecordItem[];
            total: number;
          };
          setRecords(json.rows);
          setTotal(json.total);
          setExpandedId(json.rows[0]?.id ?? null);
        }
      } finally {
        setLoadingRows(false);
      }
    },
    [],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchRecords(tableKey, search, page);
    }, 180);
    return () => clearTimeout(timer);
  }, [tableKey, search, page, fetchRecords]);

  const handleCopyJson = async (id: string, payload: Record<string, unknown>) => {
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#F5F5F7]">
            365-Day Archive & Raw Repository
          </h1>
          <p className="text-xs text-[#8E8E93] mt-0.5">
            Annual contribution heatmap across biometric/telemetry signals and searchable raw JSON inspector for all 19 Oura v2 tables.
          </p>
        </div>
      </div>

      {/* 365-Day Contribution Heatmap */}
      <section className="rounded-xl bg-[#141416] border border-white/[0.08] p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#F5F5F7]">
              365-Day Longitudinal Heatmap
            </h2>
            <p className="text-xs font-mono tabular-nums text-[#8E8E93] mt-0.5">
              {hoveredCell
                ? `${hoveredCell.day}: ${
                    hoveredCell.value !== null
                      ? `${hoveredCell.value} ${metricMeta.unit}`
                      : 'No record'
                  }`
                : `Range: ${minVal.toFixed(1)} – ${maxVal.toFixed(1)} ${metricMeta.unit}`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedMetricKey}
              onChange={(e) => setSelectedMetricKey(e.target.value)}
              className="rounded-lg bg-[#1C1C1E] border border-white/[0.12] px-3 py-1.5 text-xs text-[#F5F5F7]"
            >
              {HEATMAP_METRICS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label} ({m.unit})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto pb-2">
          <div className="inline-flex gap-1 min-w-max">
            {weeks.map((week, wIdx) => (
              <div key={wIdx} className="flex flex-col gap-1">
                {week.map((cell) => (
                  <button
                    key={cell.day}
                    type="button"
                    onMouseEnter={() => setHoveredCell(cell)}
                    onFocus={() => setHoveredCell(cell)}
                    title={`${cell.day}: ${cell.value !== null ? `${cell.value} ${metricMeta.unit}` : 'No data'}`}
                    className="w-3 h-3 rounded-[2px] transition-transform hover:scale-125 focus:outline-none"
                    style={{
                      backgroundColor: getHeatmapColor(
                        cell.value,
                        minVal,
                        maxVal,
                        metricMeta.invert,
                      ),
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 text-[11px] font-mono text-[#8E8E93]">
          <span>Low</span>
          <span className="w-3 h-3 rounded-[2px] bg-[#1C1C1E]" />
          <span className="w-3 h-3 rounded-[2px] bg-[#172554]" />
          <span className="w-3 h-3 rounded-[2px] bg-[#1D4ED8]" />
          <span className="w-3 h-3 rounded-[2px] bg-[#0A84FF]" />
          <span className="w-3 h-3 rounded-[2px] bg-[#30D158]" />
          <span>Optimal</span>
        </div>
      </section>

      {/* Searchable Raw JSON Repository Inspector */}
      <section className="rounded-xl bg-[#141416] border border-white/[0.08] overflow-hidden">
        <div className="p-4 border-b border-white/[0.08] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#F5F5F7] flex items-center gap-2">
              <Database className="w-4 h-4 text-[#0A84FF]" />
              Raw Oura JSON Repository (19 Production Tables)
            </h2>
            <p className="text-xs font-mono tabular-nums text-[#8E8E93] mt-0.5">
              {total.toLocaleString('en-GB')} total documents in `oura_{tableKey}`
              {loadingRows ? ' · Querying…' : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={tableKey}
              onChange={(e) => {
                setTableKey(e.target.value as OuraEndpointKey);
                setPage(1);
              }}
              className="rounded-lg bg-[#1C1C1E] border border-white/[0.12] px-3 py-1.5 text-xs font-mono text-[#F5F5F7]"
            >
              {ALL_OURA_ENDPOINTS.map((ep) => (
                <option key={ep} value={ep}>
                  oura_{ep}
                </option>
              ))}
            </select>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#8E8E93] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter by day or ID..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg bg-[#1C1C1E] border border-white/[0.12] pl-8 pr-3 py-1.5 text-xs font-mono text-[#F5F5F7] placeholder:text-[#8E8E93] focus:outline-none focus:border-[#0A84FF]"
              />
            </div>
          </div>
        </div>

        <div className="divide-y divide-white/[0.06]">
          {records.length === 0 ? (
            <div className="p-8 text-center text-xs font-mono text-[#8E8E93]">
              No matching records found in `oura_{tableKey}`.
            </div>
          ) : (
            records.map((rec) => {
              const isOpen = expandedId === rec.id;
              return (
                <div key={rec.id} className="bg-[#141416]">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isOpen ? null : rec.id)}
                    className={cn(
                      'w-full px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-left transition-colors',
                      isOpen ? 'bg-[#1C1C1E]/70' : 'hover:bg-[#1C1C1E]/40',
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-mono tabular-nums px-2 py-0.5 rounded bg-[#0A84FF]/15 text-[#0A84FF] shrink-0">
                        {rec.day}
                      </span>
                      <span className="text-xs text-[#F5F5F7] truncate">{rec.preview}</span>
                    </div>
                    <span className="text-[11px] font-mono text-[#8E8E93] truncate">
                      {rec.id}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 bg-[#0A0A0A]/80 border-t border-white/[0.06]">
                      <div className="flex items-center justify-between py-2">
                        <span className="text-[11px] font-mono text-[#8E8E93]">
                          rawPayload (JSONB)
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleCopyJson(rec.id, rec.rawPayload)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#1C1C1E] border border-white/[0.08] text-[11px] font-mono text-[#F5F5F7] hover:border-[#0A84FF]/50"
                        >
                          {copiedId === rec.id ? (
                            <>
                              <Check className="w-3 h-3 text-[#30D158]" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" /> Copy JSON
                            </>
                          )}
                        </button>
                      </div>
                      <pre className="text-[11px] font-mono text-[#F5F5F7] bg-[#141416] border border-white/[0.08] rounded-lg p-3 overflow-x-auto max-h-80">
                        {JSON.stringify(rec.rawPayload, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="p-3 border-t border-white/[0.08] flex items-center justify-between text-xs font-mono text-[#8E8E93]">
          <span>
            Page {page} · Showing {records.length} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1 rounded bg-[#1C1C1E] border border-white/[0.08] text-[#F5F5F7] disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page * 25 >= total}
              onClick={() => setPage((p) => p + 1)}
              className="px-2.5 py-1 rounded bg-[#1C1C1E] border border-white/[0.08] text-[#F5F5F7] disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
