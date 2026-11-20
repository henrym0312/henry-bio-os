'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Battery,
  BatteryCharging,
  Database,
  HeartPulse,
  Moon,
  Radio,
  ScatterChart,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ShellStatusProps {
  oauthConnected: boolean;
  latestBatteryLevel: number | null;
  latestBatteryCharging: boolean | null;
  lastSyncAt: string | null;
  lastSyncDataType: string | null;
  dbReady: boolean;
}

const NAV_ITEMS = [
  { href: '/', label: 'Command Overview', shortLabel: 'Overview', icon: Activity },
  { href: '/sleep', label: 'Sleep Lab', shortLabel: 'Sleep', icon: Moon },
  { href: '/cardio', label: 'Cardio & Autonomic', shortLabel: 'Cardio', icon: HeartPulse },
  {
    href: '/correlations',
    label: 'Cross-Domain Lab',
    shortLabel: 'Correlations',
    icon: ScatterChart,
  },
  { href: '/archive', label: 'Archive & Raw Repo', shortLabel: 'Archive', icon: Database },
  { href: '/briefings', label: 'AI Briefings', shortLabel: 'Briefings', icon: Sparkles },
  {
    href: '/settings',
    label: 'Pipeline Control',
    shortLabel: 'Settings',
    icon: SlidersHorizontal,
  },
];

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '—';
  const diffSec = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 48) return `${diffHr}h ago`;
  return iso.slice(0, 10);
}

export function AppShell({
  status,
  children,
}: {
  status: ShellStatusProps;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F7] flex flex-col lg:flex-row">
      {/* Desktop Navigation Rail */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-white/[0.08] bg-[#0D0D0F]">
        <div className="px-5 py-5 border-b border-white/[0.08] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#0A84FF] shadow-[0_0_10px_#0A84FF]" />
              <span className="text-sm font-semibold tracking-tight text-white">
                HenryBioOS
              </span>
            </div>
            <p className="text-[11px] font-mono text-[#8E8E93] mt-0.5">
              bio.henrymilner.uk
            </p>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#1C1C1E] text-[#8E8E93] border border-white/[0.08]">
            v1.0
          </span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors',
                  active
                    ? 'bg-[#0A84FF]/15 text-[#0A84FF] border border-[#0A84FF]/30'
                    : 'text-[#8E8E93] hover:text-[#F5F5F7] hover:bg-[#1C1C1E]/60 border border-transparent',
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/[0.08] space-y-2.5 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-[#8E8E93] flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5" />
              Oura OAuth2
            </span>
            <span
              className={cn(
                'font-mono font-medium px-2 py-0.5 rounded-full',
                status.oauthConnected
                  ? 'bg-[#30D158]/15 text-[#30D158]'
                  : 'bg-[#FF9F0A]/15 text-[#FF9F0A]',
              )}
            >
              {status.oauthConnected ? 'Connected' : 'Unlinked'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[#8E8E93] flex items-center gap-1.5">
              {status.latestBatteryCharging ? (
                <BatteryCharging className="w-3.5 h-3.5 text-[#30D158]" />
              ) : (
                <Battery className="w-3.5 h-3.5" />
              )}
              Ring Battery
            </span>
            <span className="font-mono tabular-nums text-[#F5F5F7]">
              {status.latestBatteryLevel !== null ? `${status.latestBatteryLevel}%` : '—'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[#8E8E93]">Last Sync</span>
            <span className="font-mono tabular-nums text-[#F5F5F7]">
              {formatRelativeTime(status.lastSyncAt)}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen">
        {/* Top Mobile & Telemetry Header */}
        <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#0A0A0A]/90 backdrop-blur-md">
          <div className="px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 lg:hidden">
              <span className="h-2 w-2 rounded-full bg-[#0A84FF]" />
              <span className="text-sm font-semibold tracking-tight">HenryBioOS</span>
            </div>

            <div className="hidden lg:flex items-center gap-3 text-xs text-[#8E8E93]">
              <span className="font-mono uppercase tracking-wider text-[11px]">
                Telemetry Warehouse
              </span>
              <span className="text-white/20">•</span>
              <span className="font-mono tabular-nums">
                {status.dbReady ? 'Neon PostgreSQL Online' : 'Schema Push Required'}
              </span>
              {status.lastSyncDataType && (
                <>
                  <span className="text-white/20">•</span>
                  <span className="font-mono text-[11px]">
                    Latest ingest: <span className="text-[#F5F5F7]">{status.lastSyncDataType}</span> (
                    {formatRelativeTime(status.lastSyncAt)})
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              {!status.oauthConnected && (
                <Link
                  href="/settings"
                  className="px-2.5 py-1 rounded-md text-xs font-medium bg-[#0A84FF]/15 text-[#0A84FF] border border-[#0A84FF]/30 hover:bg-[#0A84FF]/25 transition-colors"
                >
                  Authorise Oura
                </Link>
              )}
              <div className="px-2.5 py-1 rounded-md bg-[#141416] border border-white/[0.08] text-xs font-mono tabular-nums text-[#8E8E93]">
                UTC {new Date().toISOString().slice(11, 16)}
              </div>
            </div>
          </div>

          {/* Mobile Horizontal Nav */}
          <div className="flex lg:hidden overflow-x-auto px-3 pb-2.5 gap-1.5 no-scrollbar">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === '/'
                  ? pathname === '/'
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors',
                    active
                      ? 'bg-[#0A84FF]/15 text-[#0A84FF] border border-[#0A84FF]/30'
                      : 'bg-[#141416] text-[#8E8E93] border border-white/[0.08]',
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.shortLabel}</span>
                </Link>
              );
            })}
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
