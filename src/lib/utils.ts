import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDurationSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) {
    return '—';
  }
  const totalMins = Math.round(seconds / 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

export function formatIsoDayOffset(baseDate: Date, offsetDays: number): string {
  const d = new Date(baseDate);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
