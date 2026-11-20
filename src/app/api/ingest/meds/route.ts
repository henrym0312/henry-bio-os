import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { medLogs } from '@/db/schema';
import { resolvePkParams } from '@/lib/analytics/pk';
import { verifyBearerSecret } from '@/lib/env';
import { recordSyncLog } from '@/lib/oura/sync';

export const dynamic = 'force-dynamic';

const scriptablePayloadSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  taken: z.record(z.string(), z.array(z.string())),
});

const doseRecordSchema = z.object({
  doseId: z.string().min(1),
  takenAt: z.string().min(1),
  drugType: z.enum(['LDX', 'IR']).optional(),
  mg: z.number().positive().optional(),
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const directArrayPayloadSchema = z.union([
  z.array(doseRecordSchema),
  z.object({
    doses: z.array(doseRecordSchema),
  }),
]);

function extractDay(isoStr: string, explicitDay?: string): string {
  if (explicitDay) return explicitDay;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(isoStr);
  if (match) return match[1];
  return new Date(isoStr).toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  const auth = verifyBearerSecret(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const rowsToUpsert: Array<{
      id: string;
      doseId: string;
      drugType: string;
      mg: number;
      takenAt: Date;
      day: string;
      rawPayload: Record<string, unknown>;
      updatedAt: Date;
    }> = [];
    const now = new Date();

    const scriptableParsed = scriptablePayloadSchema.safeParse(body);
    if (scriptableParsed.success) {
      const { date, taken } = scriptableParsed.data;
      for (const [doseId, timestamps] of Object.entries(taken)) {
        const params = resolvePkParams(doseId);
        for (const iso of timestamps) {
          const parsedDate = new Date(iso);
          if (Number.isNaN(parsedDate.getTime())) {
            return NextResponse.json(
              { error: `Invalid timestamp "${iso}" for doseId "${doseId}"` },
              { status: 400 },
            );
          }
          const canonicalIso = parsedDate.toISOString();
          rowsToUpsert.push({
            id: `${doseId}_${canonicalIso}`,
            doseId,
            drugType: params.drugType,
            mg: params.mg,
            takenAt: parsedDate,
            day: extractDay(iso, date),
            rawPayload: { source: 'scriptable_medtracker', date, doseId, takenAt: iso },
            updatedAt: now,
          });
        }
      }
    } else {
      const directParsed = directArrayPayloadSchema.safeParse(body);
      if (!directParsed.success) {
        return NextResponse.json(
          {
            error: 'Invalid medication payload',
            details: directParsed.error.flatten(),
          },
          { status: 400 },
        );
      }

      const list = Array.isArray(directParsed.data)
        ? directParsed.data
        : directParsed.data.doses;

      for (const item of list) {
        const parsedDate = new Date(item.takenAt);
        if (Number.isNaN(parsedDate.getTime())) {
          return NextResponse.json(
            { error: `Invalid takenAt timestamp "${item.takenAt}"` },
            { status: 400 },
          );
        }
        const params = resolvePkParams(item.doseId, item.drugType, item.mg);
        const canonicalIso = parsedDate.toISOString();
        rowsToUpsert.push({
          id: `${item.doseId}_${canonicalIso}`,
          doseId: item.doseId,
          drugType: params.drugType,
          mg: params.mg,
          takenAt: parsedDate,
          day: extractDay(item.takenAt, item.day),
          rawPayload: item as unknown as Record<string, unknown>,
          updatedAt: now,
        });
      }
    }

    if (rowsToUpsert.length === 0) {
      return NextResponse.json({ ok: true, recordsProcessed: 0 });
    }

    const deduped = Array.from(
      new Map(rowsToUpsert.map((row) => [row.id, row])).values(),
    );

    const db = getDb();
    await db
      .insert(medLogs)
      .values(deduped)
      .onConflictDoUpdate({
        target: medLogs.id,
        set: {
          doseId: sql`excluded.dose_id`,
          drugType: sql`excluded.drug_type`,
          mg: sql`excluded.mg`,
          takenAt: sql`excluded.taken_at`,
          day: sql`excluded.day`,
          rawPayload: sql`excluded.raw_payload`,
          updatedAt: sql`excluded.updated_at`,
        },
      });

    await recordSyncLog({
      source: 'ingest_meds',
      dataType: 'med_logs',
      statusCode: 200,
      recordsProcessed: deduped.length,
    });

    return NextResponse.json({
      ok: true,
      recordsProcessed: deduped.length,
      ids: deduped.map((r) => r.id),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Medication ingestion failed';
    await recordSyncLog({
      source: 'ingest_meds',
      dataType: 'med_logs',
      statusCode: 500,
      recordsProcessed: 0,
      errorMessage: message,
    }).catch(() => undefined);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
