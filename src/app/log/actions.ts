'use server';

import { sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getDb } from '@/db';
import { lifeCaffeineLogs, lifeSubjectiveDaily } from '@/db/schema';
import { toLondonDay } from '@/lib/life/helpers';
import {
  buildCaffeineEntryId,
  getCaffeineSummaryForToday,
} from '@/lib/life/quick-log';

const quickCaffeineSchema = z.object({
  mg: z.number().int().min(1).max(2000),
  source: z.string().trim().min(1).max(80),
});

const dailyCheckInSchema = z.object({
  energy: z.number().int().min(1).max(10),
  mentalFocus: z.number().int().min(1).max(10),
  moodCalm: z.number().int().min(1).max(10),
  socialBandwidth: z.number().int().min(0).max(3),
  notes: z.string().max(400).optional(),
});

export async function submitQuickCaffeine(mg: number, source: string) {
  const parsed = quickCaffeineSchema.safeParse({ mg, source });
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? 'Invalid caffeine input',
    };
  }

  try {
    const db = getDb();
    const now = new Date();
    const day = toLondonDay(now);
    const id = buildCaffeineEntryId(now, parsed.data.mg, parsed.data.source);

    await db.insert(lifeCaffeineLogs).values({
      id,
      day,
      takenAt: now,
      mg: parsed.data.mg,
      source: parsed.data.source,
      notes: 'Quick Log UI',
    });

    const summary = await getCaffeineSummaryForToday(now);
    revalidatePath('/log');
    revalidatePath('/insights');

    return {
      ok: true as const,
      day,
      todayTotalMg: summary.todayTotalMg,
      bedtimeEstimatedMg: summary.bedtimeEstimatedMg,
      recentEntries: summary.recentEntries,
    };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Failed to save caffeine entry',
    };
  }
}

export async function submitDailyCheckIn(input: {
  energy: number;
  mentalFocus: number;
  moodCalm: number;
  socialBandwidth: number;
  notes?: string;
}) {
  const parsed = dailyCheckInSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? 'Invalid check-in input',
    };
  }

  try {
    const db = getDb();
    const now = new Date();
    const day = toLondonDay(now);
    const cleanNotes = parsed.data.notes?.trim() || null;

    await db
      .insert(lifeSubjectiveDaily)
      .values({
        day,
        energy: parsed.data.energy,
        mentalFocus: parsed.data.mentalFocus,
        moodCalm: parsed.data.moodCalm,
        physicalSoreness: null,
        socialBandwidth: parsed.data.socialBandwidth,
        eventTags: [],
        notes: cleanNotes,
        loggedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: lifeSubjectiveDaily.day,
        set: {
          energy: sql`excluded.energy`,
          mentalFocus: sql`excluded.mental_focus`,
          moodCalm: sql`excluded.mood_calm`,
          physicalSoreness: sql`excluded.physical_soreness`,
          socialBandwidth: sql`excluded.social_bandwidth`,
          notes: sql`excluded.notes`,
          updatedAt: sql`excluded.updated_at`,
        },
      });

    revalidatePath('/log');
    revalidatePath('/insights');
    revalidatePath('/');

    return {
      ok: true as const,
      day,
      updatedAtIso: now.toISOString(),
    };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Failed to save daily check-in',
    };
  }
}
