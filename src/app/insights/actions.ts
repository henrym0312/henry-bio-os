'use server';

import { revalidatePath } from 'next/cache';
import {
  createExperimentRecord,
  createExperimentSchema,
  updateExperimentRecord,
  updateExperimentSchema,
} from '@/lib/analytics/insights';

export async function createExperimentAction(input: {
  name: string;
  hypothesis: string;
  featureKey: string;
  targetOutcomes: string[];
  startDay: string;
  endDay: string;
  baselineDays?: number;
}) {
  const parsed = createExperimentSchema.safeParse({
    ...input,
    baselineDays: input.baselineDays ?? 21,
  });

  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? 'Invalid experiment fields',
    };
  }

  try {
    const experiment = await createExperimentRecord(parsed.data);
    revalidatePath('/insights');
    revalidatePath('/briefings');
    return { ok: true as const, experiment };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Failed to create experiment',
    };
  }
}

export async function updateExperimentStatusAction(input: {
  id: number;
  status: 'active' | 'completed' | 'cancelled';
  verdict?: string | null;
}) {
  const parsed = updateExperimentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? 'Invalid experiment update',
    };
  }

  try {
    const updated = await updateExperimentRecord(parsed.data);
    if (!updated) {
      return { ok: false as const, error: 'Experiment not found' };
    }
    revalidatePath('/insights');
    revalidatePath('/briefings');
    return { ok: true as const, experiment: updated };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Failed to update experiment',
    };
  }
}
