'use client';

import { useState, useTransition } from 'react';
import {
  CheckCircle2,
  Database,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Webhook,
} from 'lucide-react';
import {
  renewWebhooksAction,
  setupWebhooksAction,
  triggerBackfillAction,
} from '@/app/actions';
import { ALL_OURA_ENDPOINTS, type OuraEndpointKey } from '@/lib/oura/types';
import { cn } from '@/lib/utils';

export interface SettingsInitialData {
  dbReady: boolean;
  oauth: {
    connected: boolean;
    expiresAt: string | null;
    scopes: string | null;
    updatedAt: string | null;
  };
  subscriptions: Array<{
    id: string;
    dataType: string;
    eventType: string;
    expirationTime: string;
    callbackUrl: string;
  }>;
  syncLogs: Array<{
    id: number;
    source: string;
    dataType: string;
    eventType: string | null;
    objectId: string | null;
    statusCode: number;
    recordsProcessed: number;
    errorMessage: string | null;
    createdAt: string;
  }>;
  tableCounts: Array<{ name: string; count: number }>;
}

export function SettingsClient({
  data,
  oauthStatusParam,
  oauthReasonParam,
}: {
  data: SettingsInitialData;
  oauthStatusParam?: string;
  oauthReasonParam?: string;
}) {
  const now = new Date();
  const defaultEnd = now.toISOString().slice(0, 10);
  const twoYearsAgo = new Date(now);
  twoYearsAgo.setUTCFullYear(twoYearsAgo.getUTCFullYear() - 2);
  const defaultStart = twoYearsAgo.toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>('ALL');

  const [isBackfilling, startBackfill] = useTransition();
  const [isSettingUpWebhooks, startSetupWebhooks] = useTransition();
  const [isRenewingWebhooks, startRenewWebhooks] = useTransition();

  const [actionBanner, setActionBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleBackfill = () => {
    setActionBanner(null);
    startBackfill(async () => {
      const endpoints =
        selectedEndpoint === 'ALL'
          ? undefined
          : [selectedEndpoint as OuraEndpointKey];
      const res = await triggerBackfillAction({
        startDate,
        endDate,
        endpoints,
      });
      if (res.ok) {
        setActionBanner({
          type: 'success',
          message: `Historical backfill finished (${res.result.startDate} to ${res.result.endDate}). Total records upserted: ${res.result.totalRecords}.`,
        });
      } else {
        setActionBanner({ type: 'error', message: res.error });
      }
    });
  };

  const handleSetupWebhooks = () => {
    setActionBanner(null);
    startSetupWebhooks(async () => {
      const res = await setupWebhooksAction();
      if (res.ok) {
        setActionBanner({
          type: 'success',
          message: `Webhook setup complete: ${res.result.created} created, ${res.result.updated} updated, ${res.result.unchanged} unchanged (${res.result.totalSubscriptions} total active).`,
        });
      } else {
        setActionBanner({ type: 'error', message: res.error });
      }
    });
  };

  const handleRenewWebhooks = () => {
    setActionBanner(null);
    startRenewWebhooks(async () => {
      const res = await renewWebhooksAction();
      if (res.ok) {
        setActionBanner({
          type: 'success',
          message: `Renewed ${res.result.renewed} webhook subscriptions (${res.result.failed} failed).`,
        });
      } else {
        setActionBanner({ type: 'error', message: res.error });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[#F5F5F7]">
          Pipeline Control & Ingestion Settings
        </h1>
        <p className="text-xs text-[#8E8E93] mt-0.5">
          Manage Oura Cloud API v2 OAuth2 tokens, historical backfills, 16×3 webhook subscriptions, and synchronisation audit logs.
        </p>
      </div>

      {/* OAuth callback status alerts */}
      {oauthStatusParam === 'connected' && (
        <div className="rounded-xl bg-[#30D158]/10 border border-[#30D158]/40 p-4 flex items-center gap-2.5 text-xs text-[#30D158]">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Oura Cloud API v2 OAuth2 tokens authorised and stored securely.</span>
        </div>
      )}
      {oauthStatusParam === 'error' && (
        <div className="rounded-xl bg-[#FF453A]/10 border border-[#FF453A]/40 p-4 flex items-center gap-2.5 text-xs text-[#FF453A]">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>
            Oura OAuth2 authorisation failed: {oauthReasonParam ?? 'Unknown error'}
          </span>
        </div>
      )}

      {actionBanner && (
        <div
          className={cn(
            'rounded-xl border p-4 text-xs',
            actionBanner.type === 'success'
              ? 'bg-[#30D158]/10 border-[#30D158]/40 text-[#30D158]'
              : 'bg-[#FF453A]/10 border-[#FF453A]/40 text-[#FF453A]',
          )}
        >
          {actionBanner.message}
        </div>
      )}

      {/* OAuth2 + Backfill Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* OAuth2 Connection Card */}
        <section className="rounded-xl bg-[#141416] border border-white/[0.08] p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#F5F5F7]">
                Oura Cloud OAuth2 Connection
              </h2>
              <span
                className={cn(
                  'text-[11px] font-mono px-2 py-0.5 rounded-full',
                  data.oauth.connected
                    ? 'bg-[#30D158]/15 text-[#30D158]'
                    : 'bg-[#FF9F0A]/15 text-[#FF9F0A]',
                )}
              >
                {data.oauth.connected ? 'Authorised' : 'Not Connected'}
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#8E8E93]">Token Expires At</span>
                <span className="font-mono tabular-nums text-[#F5F5F7]">
                  {data.oauth.expiresAt
                    ? data.oauth.expiresAt.slice(0, 19).replace('T', ' ') + ' UTC'
                    : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8E8E93]">Last Refreshed</span>
                <span className="font-mono tabular-nums text-[#F5F5F7]">
                  {data.oauth.updatedAt
                    ? data.oauth.updatedAt.slice(0, 19).replace('T', ' ') + ' UTC'
                    : '—'}
                </span>
              </div>
              <div className="pt-1">
                <span className="text-[#8E8E93] block mb-1">Granted Scopes</span>
                <p className="font-mono text-[11px] text-[#F5F5F7] bg-[#0A0A0A] border border-white/[0.08] rounded-lg p-2 break-words">
                  {data.oauth.scopes ??
                    'email personal daily heartrate tag workout session spo2 ring_configuration stress heart_health'}
                </p>
              </div>
            </div>
          </div>

          <a
            href="/api/oura/login"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#0A84FF] text-white text-xs font-medium hover:bg-[#0A84FF]/90 transition-colors"
          >
            {data.oauth.connected ? 'Re-Authorise Oura Ring' : 'Connect Oura Ring'}
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </section>

        {/* Manual Historical Backfill Trigger */}
        <section className="rounded-xl bg-[#141416] border border-white/[0.08] p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-[#F5F5F7]">
              Manual Historical Backfill
            </h2>
            <p className="text-xs text-[#8E8E93]">
              Idempotently pulls Oura v2 collections in 90-day chunks and `heartrate` / `ring_battery_level` in 30-day chunks.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[#8E8E93] mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-lg bg-[#1C1C1E] border border-white/[0.12] px-3 py-1.5 text-xs font-mono text-[#F5F5F7]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#8E8E93] mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-lg bg-[#1C1C1E] border border-white/[0.12] px-3 py-1.5 text-xs font-mono text-[#F5F5F7]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-[#8E8E93] mb-1">
                Endpoint Scope
              </label>
              <select
                value={selectedEndpoint}
                onChange={(e) => setSelectedEndpoint(e.target.value)}
                className="w-full rounded-lg bg-[#1C1C1E] border border-white/[0.12] px-3 py-1.5 text-xs font-mono text-[#F5F5F7]"
              >
                <option value="ALL">All 19 Oura V2 Production Endpoints</option>
                {ALL_OURA_ENDPOINTS.map((ep) => (
                  <option key={ep} value={ep}>
                    {ep}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={handleBackfill}
            disabled={isBackfilling || !data.oauth.connected}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#1C1C1E] border border-white/[0.12] text-[#F5F5F7] text-xs font-medium hover:border-[#0A84FF] disabled:opacity-50 transition-colors cursor-pointer"
          >
            {isBackfilling ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Backfilling Oura Telemetry…
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                Run Historical Backfill
              </>
            )}
          </button>
        </section>
      </div>

      {/* Warehouse Table Coverage */}
      <section className="rounded-xl bg-[#141416] border border-white/[0.08] p-4">
        <h2 className="text-sm font-semibold text-[#F5F5F7] flex items-center gap-2 mb-3">
          <Database className="w-4 h-4 text-[#0A84FF]" />
          Warehouse Table Record Counts
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-2.5">
          {data.tableCounts.map((t) => (
            <div
              key={t.name}
              className="rounded-lg bg-[#0A0A0A] border border-white/[0.08] px-3 py-2"
            >
              <p className="text-[10px] font-mono text-[#8E8E93] truncate">{t.name}</p>
              <p className="text-sm font-semibold font-mono tabular-nums text-[#F5F5F7] mt-0.5">
                {t.count.toLocaleString('en-GB')}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Webhook Subscriptions Control */}
      <section className="rounded-xl bg-[#141416] border border-white/[0.08] overflow-hidden">
        <div className="p-4 border-b border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#F5F5F7] flex items-center gap-2">
              <Webhook className="w-4 h-4 text-[#30D158]" />
              Oura Real-Time Webhook Subscriptions ({data.subscriptions.length} / 48)
            </h2>
            <p className="text-xs text-[#8E8E93] mt-0.5">
              Covers create, update, and delete events across all 16 supported `ExtApiV2DataType` schemas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSetupWebhooks}
              disabled={isSettingUpWebhooks}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A84FF] text-white text-xs font-medium hover:bg-[#0A84FF]/90 disabled:opacity-50 cursor-pointer"
            >
              {isSettingUpWebhooks && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Register All 16×3 Webhooks
            </button>
            <button
              type="button"
              onClick={handleRenewWebhooks}
              disabled={isRenewingWebhooks}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1C1C1E] border border-white/[0.12] text-[#F5F5F7] text-xs font-medium hover:border-[#30D158] disabled:opacity-50 cursor-pointer"
            >
              {isRenewingWebhooks && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Renew All Subscriptions
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/[0.08] text-[#8E8E93] text-[11px] uppercase tracking-wider">
                <th className="py-2 px-4 font-medium">Data Type</th>
                <th className="py-2 px-4 font-medium">Event</th>
                <th className="py-2 px-4 font-medium">Expires At</th>
                <th className="py-2 px-4 font-medium">Callback URL</th>
                <th className="py-2 px-4 font-medium">Subscription ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] font-mono tabular-nums">
              {data.subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 px-4 text-center text-[#8E8E93]">
                    No active webhook subscriptions registered in local repository.
                  </td>
                </tr>
              ) : (
                data.subscriptions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-[#1C1C1E]/40">
                    <td className="py-2 px-4 text-[#F5F5F7]">{sub.dataType}</td>
                    <td className="py-2 px-4 text-[#0A84FF]">{sub.eventType}</td>
                    <td className="py-2 px-4 text-[#8E8E93]">
                      {sub.expirationTime.slice(0, 19).replace('T', ' ')}
                    </td>
                    <td className="py-2 px-4 text-[#8E8E93] truncate max-w-xs">
                      {sub.callbackUrl}
                    </td>
                    <td className="py-2 px-4 text-[#8E8E93]">{sub.id}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Sync Logs Audit Trail */}
      <section className="rounded-xl bg-[#141416] border border-white/[0.08] overflow-hidden">
        <div className="p-4 border-b border-white/[0.08]">
          <h2 className="text-sm font-semibold text-[#F5F5F7]">
            Recent Synchronisation Audit Logs (`sync_logs`)
          </h2>
        </div>
        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/[0.08] text-[#8E8E93] text-[11px] uppercase tracking-wider">
                <th className="py-2 px-4 font-medium">Timestamp (UTC)</th>
                <th className="py-2 px-4 font-medium">Source</th>
                <th className="py-2 px-4 font-medium">Data Type</th>
                <th className="py-2 px-4 font-medium">Event</th>
                <th className="py-2 px-4 font-medium">HTTP</th>
                <th className="py-2 px-4 font-medium">Records</th>
                <th className="py-2 px-4 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] font-mono tabular-nums">
              {data.syncLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 px-4 text-center text-[#8E8E93]">
                    No synchronisation events logged yet.
                  </td>
                </tr>
              ) : (
                data.syncLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#1C1C1E]/40">
                    <td className="py-2 px-4 text-[#8E8E93]">
                      {log.createdAt.slice(0, 19).replace('T', ' ')}
                    </td>
                    <td className="py-2 px-4 text-[#F5F5F7]">{log.source}</td>
                    <td className="py-2 px-4 text-[#0A84FF]">{log.dataType}</td>
                    <td className="py-2 px-4 text-[#8E8E93]">{log.eventType ?? '—'}</td>
                    <td className="py-2 px-4">
                      <span
                        className={cn(
                          'px-1.5 py-0.5 rounded text-[11px]',
                          log.statusCode >= 200 && log.statusCode < 300
                            ? 'bg-[#30D158]/15 text-[#30D158]'
                            : 'bg-[#FF453A]/15 text-[#FF453A]',
                        )}
                      >
                        {log.statusCode}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-[#F5F5F7]">{log.recordsProcessed}</td>
                    <td className="py-2 px-4 text-[#8E8E93] truncate max-w-xs">
                      {log.errorMessage ?? log.objectId ?? 'OK'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
