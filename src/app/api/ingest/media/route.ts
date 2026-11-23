import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { lifeMediaDaily } from '@/db/schema';
import {
  authenticateAndParseJson,
  handleIngestFailure,
  isoDaySchema,
  logIngestSuccess,
} from '@/lib/life/ingest';

export const dynamic = 'force-dynamic';

const nonNegInt = z.number().int().min(0).max(1440).optional();

const mediaPayloadSchema = z.object({
  day: isoDaySchema,
  mode: z.enum(['set', 'increment']).default('set'),
  tvActiveMins: nonNegInt,
  tv_active_mins: nonNegInt,
  tvLateMins: nonNegInt,
  tv_late_mins: nonNegInt,
  audioPlaybackMins: nonNegInt,
  audio_playback_mins: nonNegInt,
  musicMins: nonNegInt,
  music_mins: nonNegInt,
  videoMins: nonNegInt,
  video_mins: nonNegInt,
  bedtimeAudioUsed: z.boolean().optional(),
  bedtime_audio_used: z.boolean().optional(),
});

export async function POST(req: Request) {
  const gate = await authenticateAndParseJson(req);
  if (!gate.ok) return gate.response;

  const parsed = mediaPayloadSchema.safeParse(gate.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid media payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const tvActiveMins = d.tvActiveMins ?? d.tv_active_mins;
  const tvLateMins = d.tvLateMins ?? d.tv_late_mins;
  const audioPlaybackMins = d.audioPlaybackMins ?? d.audio_playback_mins;
  const musicMins = d.musicMins ?? d.music_mins;
  const videoMins = d.videoMins ?? d.video_mins;
  const bedtimeAudioUsed = d.bedtimeAudioUsed ?? d.bedtime_audio_used;

  try {
    const db = getDb();
    const now = new Date();
    const values = {
      day: d.day,
      tvActiveMins: tvActiveMins ?? 0,
      tvLateMins: tvLateMins ?? 0,
      audioPlaybackMins: audioPlaybackMins ?? 0,
      musicMins: musicMins ?? 0,
      videoMins: videoMins ?? 0,
      bedtimeAudioUsed: bedtimeAudioUsed ?? false,
      updatedAt: now,
    };

    if (d.mode === 'increment') {
      await db
        .insert(lifeMediaDaily)
        .values(values)
        .onConflictDoUpdate({
          target: lifeMediaDaily.day,
          set: {
            tvActiveMins: sql`${lifeMediaDaily.tvActiveMins} + excluded.tv_active_mins`,
            tvLateMins: sql`${lifeMediaDaily.tvLateMins} + excluded.tv_late_mins`,
            audioPlaybackMins: sql`${lifeMediaDaily.audioPlaybackMins} + excluded.audio_playback_mins`,
            musicMins: sql`${lifeMediaDaily.musicMins} + excluded.music_mins`,
            videoMins: sql`${lifeMediaDaily.videoMins} + excluded.video_mins`,
            bedtimeAudioUsed: sql`${lifeMediaDaily.bedtimeAudioUsed} OR excluded.bedtime_audio_used`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    } else {
      await db
        .insert(lifeMediaDaily)
        .values(values)
        .onConflictDoUpdate({
          target: lifeMediaDaily.day,
          set: {
            tvActiveMins:
              tvActiveMins !== undefined
                ? sql`excluded.tv_active_mins`
                : lifeMediaDaily.tvActiveMins,
            tvLateMins:
              tvLateMins !== undefined
                ? sql`excluded.tv_late_mins`
                : lifeMediaDaily.tvLateMins,
            audioPlaybackMins:
              audioPlaybackMins !== undefined
                ? sql`excluded.audio_playback_mins`
                : lifeMediaDaily.audioPlaybackMins,
            musicMins:
              musicMins !== undefined
                ? sql`excluded.music_mins`
                : lifeMediaDaily.musicMins,
            videoMins:
              videoMins !== undefined
                ? sql`excluded.video_mins`
                : lifeMediaDaily.videoMins,
            bedtimeAudioUsed:
              bedtimeAudioUsed !== undefined
                ? sql`excluded.bedtime_audio_used`
                : lifeMediaDaily.bedtimeAudioUsed,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }

    await logIngestSuccess('ingest_media', 'life_media_daily', 1);

    return NextResponse.json({
      ok: true,
      mode: d.mode,
      recordsProcessed: 1,
      day: d.day,
    });
  } catch (err) {
    return handleIngestFailure(
      'ingest_media',
      'life_media_daily',
      err,
      'Media ingestion failed',
    );
  }
}
