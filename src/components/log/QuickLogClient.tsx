'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Coffee, Loader2, PlusCircle } from 'lucide-react';
import {
  submitDailyCheckIn,
  submitQuickCaffeine,
} from '@/app/log/actions';
import type { QuickLogInitialState } from '@/lib/life/quick-log';
import { cn } from '@/lib/utils';

const SCALE_1_TO_10 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

const SOCIAL_BANDWIDTH_OPTIONS = [
  { value: 0, label: '0 Solo', detail: 'Quiet / alone' },
  { value: 1, label: '1 Routine', detail: 'Normal contact' },
  { value: 2, label: '2 Energising', detail: 'Good company' },
  { value: 3, label: '3 Heavy', detail: 'Draining social load' },
] as const;

function formatLondonTime(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(dt);
}

function ScoreButtonRow({
  label,
  lowHint,
  highHint,
  value,
  onChange,
}: {
  label: string;
  lowHint: string;
  highHint: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-[#F5F5F7]">{label}</span>
        <span className="text-xs font-mono tabular-nums text-[#0A84FF] font-semibold">
          {value} / 10
        </span>
      </div>

      <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
        {SCALE_1_TO_10.map((num) => {
          const selected = value === num;
          return (
            <button
              key={num}
              type="button"
              onClick={() => onChange(num)}
              className={cn(
                'min-h-[46px] rounded-lg border text-sm font-mono tabular-nums font-semibold transition-colors cursor-pointer',
                selected
                  ? 'bg-[#0A84FF] text-white border-[#0A84FF]'
                  : 'bg-[#1C1C1E] text-[#D1D1D6] border-white/[0.1] hover:border-white/[0.25]',
              )}
            >
              {num}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[11px] text-[#8E8E93]">
        <span>1 {lowHint}</span>
        <span>10 {highHint}</span>
      </div>
    </div>
  );
}

export function QuickLogClient({
  initialState,
}: {
  initialState: QuickLogInitialState;
}) {
  const router = useRouter();

  const [caffeinePending, startCaffeineTransition] = useTransition();
  const [todayTotalMg, setTodayTotalMg] = useState(
    initialState.caffeine.todayTotalMg,
  );
  const [bedtimeMg, setBedtimeMg] = useState(
    initialState.caffeine.bedtimeEstimatedMg,
  );
  const [recentEntries, setRecentEntries] = useState(
    initialState.caffeine.recentEntries,
  );
  const [caffeineMsg, setCaffeineMsg] = useState<string | null>(null);
  const [caffeineErr, setCaffeineErr] = useState<string | null>(null);

  const [checkInPending, startCheckInTransition] = useTransition();
  const [loggedToday, setLoggedToday] = useState(
    initialState.checkIn.loggedToday,
  );
  const [energy, setEnergy] = useState(initialState.checkIn.energy);
  const [mentalFocus, setMentalFocus] = useState(
    initialState.checkIn.mentalFocus,
  );
  const [moodCalm, setMoodCalm] = useState(initialState.checkIn.moodCalm);
  const [socialBandwidth, setSocialBandwidth] = useState(
    initialState.checkIn.socialBandwidth,
  );
  const [notes, setNotes] = useState(initialState.checkIn.notes);
  const [checkInSavedMsg, setCheckInSavedMsg] = useState<string | null>(null);
  const [checkInErr, setCheckInErr] = useState<string | null>(null);

  const handleQuickCaffeine = (mg: number, source: string, label: string) => {
    setCaffeineMsg(null);
    setCaffeineErr(null);

    startCaffeineTransition(async () => {
      const res = await submitQuickCaffeine(mg, source);
      if (!res.ok) {
        setCaffeineErr(res.error);
        return;
      }
      setTodayTotalMg(res.todayTotalMg);
      setBedtimeMg(res.bedtimeEstimatedMg);
      setRecentEntries(res.recentEntries);
      setCaffeineMsg(`Logged ${label} (${mg} mg)`);
      router.refresh();
    });
  };

  const handleSaveCheckIn = (e: React.FormEvent) => {
    e.preventDefault();
    setCheckInSavedMsg(null);
    setCheckInErr(null);

    startCheckInTransition(async () => {
      const res = await submitDailyCheckIn({
        energy,
        mentalFocus,
        moodCalm,
        socialBandwidth,
        notes,
      });
      if (!res.ok) {
        setCheckInErr(res.error);
        return;
      }
      setLoggedToday(true);
      setCheckInSavedMsg(`Saved check-in for ${res.day}`);
      router.refresh();
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-[#0A84FF]" />
            <h1 className="text-xl font-semibold tracking-tight text-[#F5F5F7]">
              Quick Log
            </h1>
          </div>
          <p className="text-xs text-[#8E8E93] mt-0.5">
            Fast mobile entry for daily caffeine and subjective state.
          </p>
        </div>

        <span className="px-2.5 py-1 rounded-md bg-[#141416] border border-white/[0.08] text-xs font-mono tabular-nums text-[#D1D1D6]">
          {initialState.todayDay}
        </span>
      </div>

      {/* Card 1: Quick Caffeine */}
      <section className="rounded-xl bg-[#141416] border border-white/[0.08] p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Coffee className="w-4 h-4 text-[#FF9F0A]" />
            <h2 className="text-sm font-semibold text-[#F5F5F7]">
              Quick Caffeine
            </h2>
          </div>
          {caffeinePending && (
            <Loader2 className="w-4 h-4 animate-spin text-[#0A84FF]" />
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            disabled={caffeinePending}
            onClick={() =>
              handleQuickCaffeine(150, 'americano', 'Black Americano')
            }
            className="min-h-[56px] px-4 py-3 rounded-xl bg-[#1C1C1E] border border-white/[0.12] hover:border-[#0A84FF]/60 active:bg-[#0A84FF]/15 text-left transition-colors disabled:opacity-60 cursor-pointer flex items-center justify-between gap-3"
          >
            <span className="text-sm font-semibold text-[#F5F5F7]">
              Black Americano · 150 mg
            </span>
            <span className="text-xs font-mono text-[#0A84FF]">+ Log</span>
          </button>

          <button
            type="button"
            disabled={caffeinePending}
            onClick={() =>
              handleQuickCaffeine(75, 'espresso', 'Single Espresso')
            }
            className="min-h-[56px] px-4 py-3 rounded-xl bg-[#1C1C1E] border border-white/[0.12] hover:border-[#0A84FF]/60 active:bg-[#0A84FF]/15 text-left transition-colors disabled:opacity-60 cursor-pointer flex items-center justify-between gap-3"
          >
            <span className="text-sm font-semibold text-[#F5F5F7]">
              Single Espresso · 75 mg
            </span>
            <span className="text-xs font-mono text-[#0A84FF]">+ Log</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="rounded-lg bg-[#1C1C1E]/60 border border-white/[0.06] px-3.5 py-2.5">
            <div className="text-[11px] text-[#8E8E93]">Logged Today</div>
            <div className="text-base font-mono tabular-nums font-semibold text-[#F5F5F7] mt-0.5">
              {todayTotalMg} mg
            </div>
          </div>

          <div className="rounded-lg bg-[#1C1C1E]/60 border border-white/[0.06] px-3.5 py-2.5">
            <div className="text-[11px] text-[#8E8E93]">
              Estimated at Bedtime (23:00)
            </div>
            <div
              className={cn(
                'text-base font-mono tabular-nums font-semibold mt-0.5',
                bedtimeMg > 50 ? 'text-[#FF9F0A]' : 'text-[#30D158]',
              )}
            >
              {bedtimeMg} mg
            </div>
          </div>
        </div>

        {caffeineMsg && (
          <div className="rounded-lg bg-[#30D158]/10 border border-[#30D158]/30 px-3 py-2 text-xs text-[#30D158] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{caffeineMsg}</span>
          </div>
        )}
        {caffeineErr && (
          <div className="rounded-lg bg-[#FF453A]/10 border border-[#FF453A]/35 px-3 py-2 text-xs text-[#FF453A]">
            {caffeineErr}
          </div>
        )}

        {recentEntries.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {recentEntries.map((entry) => (
              <span
                key={entry.id}
                className="text-[11px] font-mono tabular-nums px-2 py-0.5 rounded bg-[#1C1C1E] border border-white/[0.08] text-[#8E8E93]"
              >
                {formatLondonTime(entry.takenAtIso)} · {entry.mg} mg ({entry.source})
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Card 2: Daily Check-In */}
      <form
        onSubmit={handleSaveCheckIn}
        className="rounded-xl bg-[#141416] border border-white/[0.08] p-5 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#F5F5F7]">
            Daily Check-In
          </h2>
          {loggedToday && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-[#30D158]/15 text-[#30D158] border border-[#30D158]/30">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Logged for today
            </span>
          )}
        </div>

        <ScoreButtonRow
          label="Physical Energy"
          lowHint="Exhausted"
          highHint="High energy"
          value={energy}
          onChange={setEnergy}
        />

        <ScoreButtonRow
          label="Mental Focus"
          lowHint="Foggy"
          highHint="Locked in"
          value={mentalFocus}
          onChange={setMentalFocus}
        />

        <ScoreButtonRow
          label="Mood & Calm"
          lowHint="Tense"
          highHint="Calm & steady"
          value={moodCalm}
          onChange={setMoodCalm}
        />

        <div className="space-y-2">
          <div className="text-sm font-medium text-[#F5F5F7]">
            Social Bandwidth
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SOCIAL_BANDWIDTH_OPTIONS.map((opt) => {
              const selected = socialBandwidth === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSocialBandwidth(opt.value)}
                  className={cn(
                    'min-h-[52px] px-3 py-2 rounded-lg border text-left transition-colors cursor-pointer',
                    selected
                      ? 'bg-[#0A84FF]/20 border-[#0A84FF] text-[#F5F5F7]'
                      : 'bg-[#1C1C1E] border-white/[0.1] text-[#D1D1D6] hover:border-white/[0.25]',
                  )}
                >
                  <div className="text-xs font-semibold">{opt.label}</div>
                  <div className="text-[11px] text-[#8E8E93] mt-0.5">
                    {opt.detail}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#8E8E93] mb-1.5">
            Optional Note
          </label>
          <input
            type="text"
            maxLength={280}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Late coffee, stressful deadline, gym PR..."
            className="w-full min-h-[44px] rounded-lg bg-[#1C1C1E] border border-white/[0.12] px-3 py-2 text-sm text-[#F5F5F7] placeholder:text-[#8E8E93]/60 focus:outline-none focus:border-[#0A84FF]"
          />
        </div>

        {checkInSavedMsg && (
          <div className="rounded-lg bg-[#30D158]/10 border border-[#30D158]/35 px-3 py-2.5 text-xs text-[#30D158] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{checkInSavedMsg}</span>
          </div>
        )}
        {checkInErr && (
          <div className="rounded-lg bg-[#FF453A]/10 border border-[#FF453A]/35 px-3 py-2.5 text-xs text-[#FF453A]">
            {checkInErr}
          </div>
        )}

        <button
          type="submit"
          disabled={checkInPending}
          className="w-full min-h-[52px] rounded-xl bg-[#0A84FF] text-white text-sm font-semibold hover:bg-[#0A84FF]/90 disabled:opacity-60 transition-colors cursor-pointer flex items-center justify-center gap-2"
        >
          {checkInPending && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>{loggedToday ? 'Update Check-In' : 'Save Check-In'}</span>
        </button>
      </form>
    </div>
  );
}
