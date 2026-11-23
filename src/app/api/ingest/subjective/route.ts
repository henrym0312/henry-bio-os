import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { lifeSubjectiveDaily } from '@/db/schema';
import { toLondonDay } from '@/lib/life/helpers';
import {
  authenticateAndParseJson,
  handleIngestFailure,
  isoDaySchema,
  logIngestSuccess,
} from '@/lib/life/ingest';

export const dynamic = 'force-dynamic';

const slider1To10 = z.number().int().min(1).max(10);

const subjectivePayloadSchema = z
  .object({
    day: isoDaySchema.optional(),
    energy: slider1To10,
    mentalFocus: slider1To10.optional(),
    mental_focus: slider1To10.optional(),
    moodCalm: slider1To10.optional(),
    mood_calm: slider1To10.optional(),
    physicalSoreness: slider1To10.optional(),
    physical_soreness: slider1To10.optional(),
    socialBandwidth: z.number().int().min(0).max(3).optional(),
    social_bandwidth: z.number().int().min(0).max(3).optional(),
    eventTags: z.array(z.string().trim().min(1)).optional(),
    event_tags: z.array(z.string().trim().min(1)).optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((v) => (v.mentalFocus ?? v.mental_focus) !== undefined, {
    message: 'mentalFocus (1-10) is required',
  })
  .refine((v) => (v.moodCalm ?? v.mood_calm) !== undefined, {
    message: 'moodCalm (1-10) is required',
  })
  .refine((v) => (v.physicalSoreness ?? v.physical_soreness) !== undefined, {
    message: 'physicalSoreness (1-10) is required',
  })
  .refine((v) => (v.socialBandwidth ?? v.social_bandwidth) !== undefined, {
    message: 'socialBandwidth (0-3) is required',
  });

export async function POST(req: Request) {
  const gate = await authenticateAndParseJson(req);
  if (!gate.ok) return gate.response;

  const parsed = subjectivePayloadSchema.safeParse(gate.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid subjective check-in payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const now = new Date();
  const day = d.day ?? toLondonDay(now);

  try {
    const db = getDb();
    await db
      .insert(lifeSubjectiveDaily)
      .values({
        day,
        energy: d.energy,
        mentalFocus: (d.mentalFocus ?? d.mental_focus)!,
        moodCalm: (d.moodCalm ?? d.mood_calm)!,
        physicalSoreness: (d.physicalSoreness ?? d.physical_soreness)!,
        socialBandwidth: (d.socialBandwidth ?? d.social_bandwidth)!,
        eventTags: d.eventTags ?? d.event_tags ?? [],
        notes: d.notes?.trim() || null,
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
          eventTags: sql`excluded.event_tags`,
          notes: sql`excluded.notes`,
          loggedAt: sql`excluded.logged_at`,
          updatedAt: sql`excluded.updated_at`,
        },
      });

    await logIngestSuccess('ingest_subjective', 'life_subjective_daily', 1);

    return NextResponse.json({
      ok: true,
      recordsProcessed: 1,
      day,
    });
  } catch (err) {
    return handleIngestFailure(
      'ingest_subjective',
      'life_subjective_daily',
      err,
      'Subjective check-in ingestion failed',
    );
  }
}
