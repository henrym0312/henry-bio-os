export const maxDuration = 120;

'use server';

import { revalidatePath } from 'next/cache';
import { generateAndSaveDiagnosticBriefing } from '@/lib/analytics/briefing';
import { runBackfill } from '@/lib/oura/sync';
import { type OuraEndpointKey } from '@/lib/oura/types';
import { renewAllOuraWebhooks, setupAllOuraWebhooks } from '@/lib/oura/webhooks';

export async function triggerDiagnosticBriefingAction() {
  try {
    const briefing = await generateAndSaveDiagnosticBriefing();
    revalidatePath('/briefings');
    revalidatePath('/');
    return { ok: true as const, id: briefing.id };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Failed to generate diagnostic briefing',
    };
  }
}

export async function triggerBackfillAction(input: {
  startDate?: string;
  endDate?: string;
  endpoints?: OuraEndpointKey[];
}) {
  try {
    const result = await runBackfill({
      startDate: input.startDate || undefined,
      endDate: input.endDate || undefined,
      endpoints: input.endpoints,
      source: 'settings_ui',
    });
    revalidatePath('/');
    revalidatePath('/sleep');
    revalidatePath('/cardio');
    revalidatePath('/correlations');
    revalidatePath('/archive');
    revalidatePath('/settings');
    return { ok: true as const, result };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Historical backfill failed',
    };
  }
}

export async function setupWebhooksAction() {
  try {
    const result = await setupAllOuraWebhooks();
    revalidatePath('/settings');
    return { ok: true as const, result };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Webhook setup failed',
    };
  }
}

export async function renewWebhooksAction() {
  try {
    const result = await renewAllOuraWebhooks();
    revalidatePath('/settings');
    return { ok: true as const, result };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Webhook renewal failed',
    };
  }
}
