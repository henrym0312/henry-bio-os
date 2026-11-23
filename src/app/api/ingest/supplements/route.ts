import { inArray, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { lifeSupplementAdherence } from '@/db/schema';
import { computeSupplementNutrients } from '@/lib/life/helpers';
import {
  authenticateAndParseJson,
  handleIngestFailure,
  isoDaySchema,
  logIngestSuccess,
  parseFlexibleTimestamp,
} from '@/lib/life/ingest';

export const dynamic = 'force-dynamic';

const supplementRowSchema = z.object({
  day: isoDaySchema,
  amTaken: z.boolean().optional(),
  am_taken: z.boolean().optional(),
  amCompletedAt: z.string().nullable().optional(),
  am_completed_at: z.string().nullable().optional(),
  pmTaken: z.boolean().optional(),
  pm_taken: z.boolean().optional(),
  pmCompletedAt: z.string().nullable().optional(),
  pm_completed_at: z.string().nullable().optional(),
});

const supplementPayloadSchema = z.union([
  supplementRowSchema,
  z.object({ rows: z.array(supplementRowSchema) }),
]);

interface NormalizedSupplementInput {
  day: string;
  amTaken?: boolean;
  amCompletedAt?: Date | null;
  pmTaken?: boolean;
  pmCompletedAt?: Date | null;
}

export async function POST(req: Request) {
  const gate = await authenticateAndParseJson(req);
  if (!gate.ok) return gate.response;

  const parsed = supplementPayloadSchema.safeParse(gate.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid supplements payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const items = 'rows' in parsed.data ? parsed.data.rows : [parsed.data];
  if (items.length === 0) {
    return NextResponse.json({ ok: true, recordsProcessed: 0, days: [] });
  }

  const normalizedInputs: NormalizedSupplementInput[] = [];
  for (const item of items) {
    const rawAmAt =
      item.amCompletedAt !== undefined ? item.amCompletedAt : item.am_completed_at;
    const rawPmAt =
      item.pmCompletedAt !== undefined ? item.pmCompletedAt : item.pm_completed_at;

    let parsedAmAt: Date | null | undefined;
    if (rawAmAt !== undefined) {
      if (rawAmAt === null) {
        parsedAmAt = null;
      } else {
        const dt = parseFlexibleTimestamp(rawAmAt);
        if (!dt) {
          return NextResponse.json(
            { error: `Invalid amCompletedAt timestamp "${rawAmAt}"` },
            { status: 400 },
          );
        }
        parsedAmAt = dt;
      }
    }

    let parsedPmAt: Date | null | undefined;
    if (rawPmAt !== undefined) {
      if (rawPmAt === null) {
        parsedPmAt = null;
      } else {
        const dt = parseFlexibleTimestamp(rawPmAt);
        if (!dt) {
          return NextResponse.json(
            { error: `Invalid pmCompletedAt timestamp "${rawPmAt}"` },
            { status: 400 },
          );
        }
        parsedPmAt = dt;
      }
    }

    normalizedInputs.push({
      day: item.day,
      amTaken: item.amTaken ?? item.am_taken,
      amCompletedAt: parsedAmAt,
      pmTaken: item.pmTaken ?? item.pm_taken,
      pmCompletedAt: parsedPmAt,
    });
  }

  try {
    const db = getDb();
    const days = Array.from(new Set(normalizedInputs.map((r) => r.day)));
    const existingRows = await db
      .select()
      .from(lifeSupplementAdherence)
      .where(inArray(lifeSupplementAdherence.day, days));

    const stateByDay = new Map<
      string,
      {
        amTaken: boolean;
        amCompletedAt: Date | null;
        pmTaken: boolean;
        pmCompletedAt: Date | null;
      }
    >();

    for (const existing of existingRows) {
      stateByDay.set(existing.day, {
        amTaken: existing.amTaken,
        amCompletedAt: existing.amCompletedAt,
        pmTaken: existing.pmTaken,
        pmCompletedAt: existing.pmCompletedAt,
      });
    }

    for (const incoming of normalizedInputs) {
      const prev = stateByDay.get(incoming.day);
      const amTaken = incoming.amTaken ?? prev?.amTaken ?? false;
      const pmTaken = incoming.pmTaken ?? prev?.pmTaken ?? false;
      const amCompletedAt =
        incoming.amCompletedAt !== undefined
          ? incoming.amCompletedAt
          : (prev?.amCompletedAt ?? null);
      const pmCompletedAt =
        incoming.pmCompletedAt !== undefined
          ? incoming.pmCompletedAt
          : (prev?.pmCompletedAt ?? null);

      stateByDay.set(incoming.day, {
        amTaken,
        amCompletedAt,
        pmTaken,
        pmCompletedAt,
      });
    }

    const now = new Date();
    const rowsToUpsert = days.map((day) => {
      const merged = stateByDay.get(day)!;
      const nutrients = computeSupplementNutrients(merged.amTaken, merged.pmTaken);
      return {
        day,
        amTaken: merged.amTaken,
        amCompletedAt: merged.amCompletedAt,
        pmTaken: merged.pmTaken,
        pmCompletedAt: merged.pmCompletedAt,
        ...nutrients,
        updatedAt: now,
      };
    });

    await db
      .insert(lifeSupplementAdherence)
      .values(rowsToUpsert)
      .onConflictDoUpdate({
        target: lifeSupplementAdherence.day,
        set: {
          amTaken: sql`excluded.am_taken`,
          amCompletedAt: sql`excluded.am_completed_at`,
          pmTaken: sql`excluded.pm_taken`,
          pmCompletedAt: sql`excluded.pm_completed_at`,
          creatineMg: sql`excluded.creatine_mg`,
          ginkgoMg: sql`excluded.ginkgo_mg`,
          ashwagandhaMg: sql`excluded.ashwagandha_mg`,
          vitaminDUg: sql`excluded.vitamin_d_ug`,
          multivitaminTaken: sql`excluded.multivitamin_taken`,
          vitaminCMg: sql`excluded.vitamin_c_mg`,
          zincMg: sql`excluded.zinc_mg`,
          magnesiumCitrateMg: sql`excluded.magnesium_citrate_mg`,
          updatedAt: sql`excluded.updated_at`,
        },
      });

    await logIngestSuccess(
      'ingest_supplements',
      'life_supplement_adherence',
      rowsToUpsert.length,
    );

    return NextResponse.json({
      ok: true,
      recordsProcessed: rowsToUpsert.length,
      days,
    });
  } catch (err) {
    return handleIngestFailure(
      'ingest_supplements',
      'life_supplement_adherence',
      err,
      'Supplement adherence ingestion failed',
    );
  }
}
