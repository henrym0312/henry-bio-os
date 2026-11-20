import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Battery,
  CheckCircle2,
  Flame,
  HeartPulse,
  ListChecks,
  Moon,
  Pill,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { MetricSparklineCard } from '@/components/MetricSparklineCard';
import { getActiveAlerts } from '@/lib/analytics/alerts';
import { getCommandOverviewData } from '@/lib/ui/telemetry-queries';
import { cn, formatDurationSeconds } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function scoreAccent(score: number | null): string {
  if (score === null) return 'text-[#8E8E93]';
  if (score >= 85) return 'text-[#30D158]';
  if (score >= 70) return 'text-[#0A84FF]';
  if (score >= 55) return 'text-[#FF9F0A]';
  return 'text-[#FF453A]';
}

export default async function CommandOverviewPage() {
  const [data, activeAlerts] = await Promise.all([
    getCommandOverviewData(),
    getActiveAlerts(),
  ]);
  const { anomalies, kpis, sparklines } = data;

  const stressMins =
    kpis.stressHighSec !== null ? Math.round(kpis.stressHighSec / 60) : null;
  const recoveryMins =
    kpis.recoveryHighSec !== null ? Math.round(kpis.recoveryHighSec / 60) : null;
  const stressRatio =
    stressMins !== null && recoveryMins !== null && recoveryMins > 0
      ? (stressMins / recoveryMins).toFixed(2)
      : null;

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#F5F5F7]">
            Command Overview
          </h1>
          <p className="text-xs text-[#8E8E93] mt-0.5">
            Real-time physiological state, 30-day Z-score anomaly surveillance, and cross-domain telemetry.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
          <span className="px-2.5 py-1 rounded-md bg-[#141416] border border-white/[0.08] text-[#8E8E93]">
            Latest Day:{' '}
            <span className="text-[#F5F5F7]">{data.latestDay ?? 'Pending Sync'}</span>
          </span>
          <Link
            href="/briefings"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#0A84FF]/15 text-[#0A84FF] border border-[#0A84FF]/30 hover:bg-[#0A84FF]/25 transition-colors font-sans font-medium"
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI Diagnostics
          </Link>
        </div>
      </div>

      {/* Onboarding Banner if warehouse has no rows yet */}
      {!data.hasData && (
        <div className="rounded-xl bg-[#141416] border border-[#0A84FF]/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[#F5F5F7]">
              Telemetry Warehouse Ready for Synchronisation
            </p>
            <p className="text-xs text-[#8E8E93] mt-1">
              {data.dbReady
                ? 'Connect your Oura Ring via OAuth2, register real-time webhooks, and trigger your historical backfill in Pipeline Control.'
                : 'Push the Drizzle PostgreSQL schema (npx drizzle-kit push) and connect your Oura account to begin ingesting telemetry.'}
            </p>
          </div>
          <Link
            href="/settings"
            className="shrink-0 px-3.5 py-2 rounded-lg bg-[#0A84FF] text-white text-xs font-medium hover:bg-[#0A84FF]/90 transition-colors"
          >
            Open Pipeline Control
          </Link>
        </div>
      )}

      {/* Active Threshold Alerts Strip */}
      {activeAlerts.length > 0 && (
        <section className="rounded-xl bg-[#141416] border border-[#FF9F0A]/35 p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#FF9F0A] flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Active Threshold Alerts ({activeAlerts.length})
            </span>
            <span className="text-[11px] font-mono text-[#8E8E93]">
              4h push cooldown via ntfy
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {activeAlerts.map((a) => (
              <Link
                key={a.id}
                href={a.url.replace('https://bio.henrymilner.uk', '') || '/'}
                className={cn(
                  'rounded-lg p-3 border transition-colors block',
                  a.severity === 'critical'
                    ? 'bg-[#FF453A]/10 border-[#FF453A]/40 hover:border-[#FF453A]/70'
                    : 'bg-[#FF9F0A]/10 border-[#FF9F0A]/30 hover:border-[#FF9F0A]/60',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      'text-xs font-semibold',
                      a.severity === 'critical' ? 'text-[#FF453A]' : 'text-[#FF9F0A]',
                    )}
                  >
                    {a.title}
                  </span>
                  <span className="text-[10px] font-mono uppercase text-[#8E8E93]">
                    {a.severity}
                  </span>
                </div>
                <p className="text-xs text-[#D1D1D6] mt-1">{a.message}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 30-Day Rolling Z-Score Strain / Illness Surveillance Banner */}
      <section
        className={cn(
          'rounded-xl border p-4',
          anomalies.strainAlert
            ? 'bg-[#FF453A]/10 border-[#FF453A]/40'
            : anomalies.adverseCount === 1
              ? 'bg-[#FF9F0A]/10 border-[#FF9F0A]/35'
              : 'bg-[#141416] border-white/[0.08]',
        )}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            {anomalies.strainAlert ? (
              <AlertTriangle className="w-5 h-5 text-[#FF453A] shrink-0" />
            ) : anomalies.adverseCount === 1 ? (
              <AlertTriangle className="w-5 h-5 text-[#FF9F0A] shrink-0" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-[#30D158] shrink-0" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[#F5F5F7]">
                  {anomalies.strainAlert
                    ? 'ELEVATED PHYSIOLOGICAL STRAIN / ILLNESS RISK'
                    : anomalies.adverseCount === 1
                      ? 'SINGLE-MARKER AUTONOMIC DEVIATION WATCH'
                      : 'PHYSIOLOGICAL BASELINE NOMINAL'}
                </span>
                <span className="text-[11px] font-mono tabular-nums px-2 py-0.5 rounded bg-[#1C1C1E] border border-white/[0.08] text-[#8E8E93]">
                  {anomalies.adverseCount}/5 flags &gt; {anomalies.thresholdSigma}σ
                </span>
              </div>
              <p className="text-xs text-[#8E8E93] mt-0.5">
                30-day rolling Z-score surveillance across nocturnal temperature, respiration, nadir HR, HRV, and PWV
                {anomalies.targetDay ? ` (evaluated on ${anomalies.targetDay})` : ''}.
              </p>
            </div>
          </div>
          <span
            className={cn(
              'text-xs font-mono font-medium px-2.5 py-1 rounded-md self-start md:self-auto',
              anomalies.strainAlert
                ? 'bg-[#FF453A]/20 text-[#FF453A]'
                : anomalies.adverseCount === 1
                  ? 'bg-[#FF9F0A]/20 text-[#FF9F0A]'
                  : 'bg-[#30D158]/15 text-[#30D158]',
            )}
          >
            {anomalies.strainAlert
              ? 'ALERT: >= 2 SIGMA BREACHES'
              : anomalies.adverseCount === 1
                ? 'WATCH: 1 SIGMA BREACH'
                : 'STATUS: CLEAR'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-3">
          {anomalies.metrics.map((m) => (
            <div
              key={m.metricKey}
              className={cn(
                'rounded-lg p-3 border bg-[#0A0A0A]/60',
                m.isAdverseDeviation
                  ? 'border-[#FF453A]/45'
                  : 'border-white/[0.08]',
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] text-[#8E8E93] truncate">{m.label}</span>
                <span
                  className={cn(
                    'text-[11px] font-mono tabular-nums font-semibold',
                    m.zScore === null
                      ? 'text-[#8E8E93]'
                      : m.isAdverseDeviation
                        ? 'text-[#FF453A]'
                        : Math.abs(m.zScore) >= 1.0
                          ? 'text-[#FF9F0A]'
                          : 'text-[#30D158]',
                  )}
                >
                  {m.zScore !== null
                    ? `${m.zScore >= 0 ? '+' : ''}${m.zScore.toFixed(2)}σ`
                    : '—'}
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline gap-1">
                <span className="text-base font-semibold tabular-nums text-[#F5F5F7]">
                  {m.value !== null ? m.value : '—'}
                </span>
                <span className="text-[11px] font-mono text-[#8E8E93]">{m.unit}</span>
              </div>
              <p className="text-[10px] font-mono tabular-nums text-[#8E8E93] mt-1">
                μ₃₀: {m.mean30d !== null ? m.mean30d : '—'} · σ: {m.stdDev30d !== null ? m.stdDev30d : '—'}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Primary KPI Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#8E8E93] flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#30D158]" />
              Readiness
            </span>
            <span className="text-[11px] font-mono tabular-nums text-[#8E8E93]">
              Temp{' '}
              <span className="text-[#F5F5F7]">
                {kpis.temperatureDeviation !== null
                  ? `${kpis.temperatureDeviation >= 0 ? '+' : ''}${kpis.temperatureDeviation.toFixed(2)}°C`
                  : '—'}
              </span>
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={cn('text-3xl font-semibold tabular-nums', scoreAccent(kpis.readinessScore))}>
              {kpis.readinessScore ?? '—'}
            </span>
            <span className="text-xs font-mono text-[#8E8E93]">/ 100</span>
          </div>
          <div className="mt-3 pt-3 border-t border-white/[0.08] flex items-center justify-between text-xs text-[#8E8E93]">
            <span>Nadir HR</span>
            <span className="font-mono tabular-nums text-[#F5F5F7]">
              {kpis.lowestHeartRate !== null ? `${kpis.lowestHeartRate} bpm` : '—'}
            </span>
          </div>
        </div>

        <Link
          href="/sleep"
          className="rounded-xl bg-[#141416] border border-white/[0.08] hover:border-[#0A84FF]/40 p-4 transition-colors block"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#8E8E93] flex items-center gap-1.5">
              <Moon className="w-3.5 h-3.5 text-[#0A84FF]" />
              Sleep Architecture
            </span>
            <span className="text-[11px] font-mono tabular-nums text-[#8E8E93]">
              Eff{' '}
              <span className="text-[#F5F5F7]">
                {kpis.sleepEfficiency !== null ? `${kpis.sleepEfficiency}%` : '—'}
              </span>
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={cn('text-3xl font-semibold tabular-nums', scoreAccent(kpis.sleepScore))}>
              {kpis.sleepScore ?? '—'}
            </span>
            <span className="text-xs font-mono text-[#8E8E93]">
              · {formatDurationSeconds(kpis.totalSleepDurationSec)}
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-white/[0.08] flex items-center justify-between text-xs text-[#8E8E93]">
            <span>Nocturnal HRV</span>
            <span className="font-mono tabular-nums text-[#F5F5F7]">
              {kpis.averageHrv !== null ? `${kpis.averageHrv} ms` : '—'}
            </span>
          </div>
        </Link>

        <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#8E8E93] flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-[#FF9F0A]" />
              Activity & Output
            </span>
            <span className="text-[11px] font-mono tabular-nums text-[#8E8E93]">
              {kpis.activeCalories !== null ? `${kpis.activeCalories} kcal` : '—'}
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={cn('text-3xl font-semibold tabular-nums', scoreAccent(kpis.activityScore))}>
              {kpis.activityScore ?? '—'}
            </span>
            <span className="text-xs font-mono text-[#8E8E93]">/ 100</span>
          </div>
          <div className="mt-3 pt-3 border-t border-white/[0.08] flex items-center justify-between text-xs text-[#8E8E93]">
            <span>Steps</span>
            <span className="font-mono tabular-nums text-[#F5F5F7]">
              {kpis.steps !== null ? kpis.steps.toLocaleString('en-GB') : '—'}
            </span>
          </div>
        </div>

        <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#8E8E93] flex items-center gap-1.5">
              <HeartPulse className="w-3.5 h-3.5 text-[#30D158]" />
              Resilience & Stress
            </span>
            <span className="text-[11px] font-mono capitalize text-[#F5F5F7]">
              {kpis.stressDaySummary ?? '—'}
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold capitalize text-[#F5F5F7]">
              {kpis.resilienceLevel ?? '—'}
            </span>
            {stressRatio && (
              <span className="text-xs font-mono tabular-nums text-[#8E8E93]">
                S/R {stressRatio}×
              </span>
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-white/[0.08] flex items-center justify-between text-xs text-[#8E8E93]">
            <span>Stress / Recovery</span>
            <span className="font-mono tabular-nums text-[#F5F5F7]">
              {stressMins !== null ? `${stressMins}m` : '—'} /{' '}
              {recoveryMins !== null ? `${recoveryMins}m` : '—'}
            </span>
          </div>
        </div>
      </section>

      {/* Cross-Domain Secondary Strip */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-[#8E8E93] flex items-center gap-1.5">
              <Battery className="w-3.5 h-3.5 text-[#30D158]" />
              Ring Hardware & Power
            </p>
            <p className="text-lg font-semibold tabular-nums mt-1 text-[#F5F5F7]">
              {kpis.batteryLevel !== null ? `${kpis.batteryLevel}%` : '—'}
              {kpis.batteryCharging ? (
                <span className="ml-2 text-xs font-mono text-[#30D158]">Charging</span>
              ) : null}
            </p>
            <p className="text-[11px] font-mono text-[#8E8E93] mt-0.5">
              {kpis.ringHardware ? kpis.ringHardware.toUpperCase() : 'Oura Ring'} · FW{' '}
              {kpis.ringFirmware ?? '—'}
            </p>
          </div>
          <Activity className="w-5 h-5 text-white/20" />
        </div>

        <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-[#8E8E93] flex items-center gap-1.5">
              <Pill className="w-3.5 h-3.5 text-[#0A84FF]" />
              Pharmacokinetic Serum (Live / Bedtime)
            </p>
            <p className="text-lg font-semibold tabular-nums mt-1 text-[#F5F5F7]">
              {kpis.currentSerumNgMl.toFixed(1)}{' '}
              <span className="text-xs font-mono text-[#8E8E93]">ng/mL live</span>
              <span className="text-white/20 mx-2">·</span>
              <span className="text-[#FF9F0A]">
                {kpis.bedtimeSerumNgMl !== null
                  ? `${kpis.bedtimeSerumNgMl.toFixed(1)} ng/mL`
                  : '—'}
              </span>{' '}
              <span className="text-xs font-mono text-[#8E8E93]">last bed</span>
            </p>
            <p className="text-[11px] font-mono text-[#8E8E93] mt-0.5">
              Last dose: {kpis.lastDoseLabel ?? 'None logged'}
            </p>
          </div>
          <Pill className="w-5 h-5 text-white/20" />
        </div>

        <div className="rounded-xl bg-[#141416] border border-white/[0.08] p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-[#8E8E93] flex items-center gap-1.5">
              <ListChecks className="w-3.5 h-3.5 text-[#FF9F0A]" />
              Daily Task Velocity
            </p>
            <p className="text-lg font-semibold tabular-nums mt-1 text-[#F5F5F7]">
              {kpis.taskCompletionPct !== null
                ? `${kpis.taskCompletionPct.toFixed(1)}%`
                : '—'}{' '}
              <span className="text-xs font-mono text-[#8E8E93]">completion</span>
            </p>
            <p className="text-[11px] font-mono tabular-nums text-[#8E8E93] mt-0.5">
              Completed: {kpis.tasksCompleted ?? '—'} · Remaining: {kpis.tasksRemaining ?? '—'}
            </p>
          </div>
          <ListChecks className="w-5 h-5 text-white/20" />
        </div>
      </section>

      {/* 7-to-14 Day Sparklines */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[#F5F5F7]">
            14-Day Telemetry Sparklines
          </h2>
          <span className="text-xs font-mono text-[#8E8E93]">
            Rolling two-week trajectory
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricSparklineCard
            title="Readiness Score"
            unit="pts"
            latestValue={kpis.readinessScore}
            accentColor="#30D158"
            data={sparklines.map((s) => ({ day: s.day, value: s.readiness }))}
          />
          <MetricSparklineCard
            title="Sleep Score"
            unit="pts"
            latestValue={kpis.sleepScore}
            accentColor="#0A84FF"
            data={sparklines.map((s) => ({ day: s.day, value: s.sleepScore }))}
          />
          <MetricSparklineCard
            title="Nocturnal Average HRV"
            unit="ms"
            latestValue={kpis.averageHrv}
            accentColor="#30D158"
            data={sparklines.map((s) => ({ day: s.day, value: s.hrv }))}
          />
          <MetricSparklineCard
            title="Lowest Nocturnal HR"
            unit="bpm"
            latestValue={kpis.lowestHeartRate}
            accentColor="#FF453A"
            data={sparklines.map((s) => ({ day: s.day, value: s.lowestHr }))}
          />
          <MetricSparklineCard
            title="Daytime High Stress"
            unit="min"
            latestValue={stressMins}
            accentColor="#FF9F0A"
            data={sparklines.map((s) => ({ day: s.day, value: s.stressHighMins }))}
          />
          <MetricSparklineCard
            title="Bedtime Serum Concentration"
            unit="ng/mL"
            latestValue={kpis.bedtimeSerumNgMl}
            accentColor="#0A84FF"
            decimals={1}
            data={sparklines.map((s) => ({ day: s.day, value: s.bedtimeSerum }))}
          />
        </div>
      </section>
    </div>
  );
}
