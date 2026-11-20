import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { dailyTaskMetrics } from '@/db/schema';
import { verifyBearerSecret } from '@/lib/env';
import { recordSyncLog } from '@/lib/oura/sync';

export const dynamic = 'force-dynamic';

const singleTaskMetricSchema = z
  .object({
    dateKey: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    day: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    start: z.number().int().min(0).optional(),
    startCount: z.number().int().min(0).optional(),
    added: z.number().int().min(0).optional(),
    addedCount: z.number().int().min(0).optional(),
    completed: z.number().int().min(0).optional(),
    completedCount: z.number().int().min(0).optional(),
    moved: z.number().int().min(0).optional(),
    movedCount: z.number().int().min(0).optional(),
    remaining: z.number().int().min(0).optional(),
    remainingCount: z.number().int().min(0).optional(),
  })
  .refine((val) => Boolean(val.dateKey ?? val.day), {
    message: 'Either dateKey or day (YYYY-MM-DD) is required',
  });

const taskPayloadSchema = z.union([
  singleTaskMetricSchema,
  z.array(singleTaskMetricSchema),
  z.object({ metrics: z.array(singleTaskMetricSchema) }),
]);

export async function POST(req: Request) {
  const auth = verifyBearerSecret(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const parsed = taskPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid task metrics payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const items = Array.isArray(parsed.data)
      ? parsed.data
      : 'metrics' in parsed.data
        ? parsed.data.metrics
        : [parsed.data];

    if (items.length === 0) {
      return NextResponse.json({ ok: true, recordsProcessed: 0 });
    }

    const now = new Date();
    const rows = items.map((item) => {
      const day = (item.dateKey ?? item.day)!;
      const startCount = item.start ?? item.startCount ?? 0;
      const addedCount = item.added ?? item.addedCount ?? 0;
      const completedCount = item.completed ?? item.completedCount ?? 0;
      const movedCount = item.moved ?? item.movedCount ?? 0;
      const remainingCount = item.remaining ?? item.remainingCount ?? 0;
      const denominator = startCount + addedCount;
      const completionPct =
        denominator > 0
          ? Math.round((completedCount / denominator) * 10000) / 100
          : 0;

      return {
        day,
        startCount,
        addedCount,
        completedCount,
        movedCount,
        remainingCount,
        completionPct,
        rawPayload: item as unknown as Record<string, unknown>,
        updatedAt: now,
      };
    });

    const deduped = Array.from(new Map(rows.map((r) => [r.day, r])).values());

    const db = getDb();
    await db
      .insert(dailyTaskMetrics)
      .values(deduped)
      .onConflictDoUpdate({
        target: dailyTaskMetrics.day,
        set: {
          startCount: sql`excluded.start_count`,
          addedCount: sql`excluded.added_count`,
          completedCount: sql`excluded.completed_count`,
          movedCount: sql`excluded.moved_count`,
          remainingCount: sql`excluded.remaining_count`,
          completionPct: sql`excluded.completion_pct`,
          rawPayload: sql`excluded.raw_payload`,
          updatedAt: sql`excluded.updated_at`,
        },
      });

    await recordSyncLog({
      source: 'ingest_tasks',
      dataType: 'daily_task_metrics',
      statusCode: 200,
      recordsProcessed: deduped.length,
    });

    return NextResponse.json({
      ok: true,
      recordsProcessed: deduped.length,
      days: deduped.map((r) => r.day),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Task metrics ingestion failed';
    await recordSyncLog({
      source: 'ingest_tasks',
      dataType: 'daily_task_metrics',
      statusCode: 500,
      recordsProcessed: 0,
      errorMessage: message,
    }).catch(() => undefined);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
