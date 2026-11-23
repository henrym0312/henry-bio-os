import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { lifeSpendingTx } from '@/db/schema';
import {
  categoriseUkMerchant,
  isLondonLateHour,
  SPEND_CATEGORIES,
  toLondonDay,
  type SpendCategory,
} from '@/lib/life/helpers';
import {
  authenticateAndParseJson,
  dedupeBy,
  handleIngestFailure,
  logIngestSuccess,
  parseFlexibleTimestamp,
  sha256Short,
} from '@/lib/life/ingest';

export const dynamic = 'force-dynamic';

const spendCategorySet = new Set<string>(SPEND_CATEGORIES);

const singleTxSchema = z
  .object({
    id: z.string().min(1).optional(),
    dedupeKey: z.string().min(1).optional(),
    amount: z.number().finite().optional(),
    amountGbp: z.number().finite().optional(),
    amount_gbp: z.number().finite().optional(),
    merchant: z.string().trim().min(1),
    occurredAt: z.string().min(1).optional(),
    occurred_at: z.string().min(1).optional(),
    category: z.string().trim().optional(),
    source: z.enum(['apple_pay', 'natwest_csv']).optional(),
  })
  .refine(
    (item) => {
      const val = item.amount ?? item.amountGbp ?? item.amount_gbp;
      return typeof val === 'number' && Math.abs(val) > 0;
    },
    { message: 'A non-zero numeric amount is required' },
  );

const spendingPayloadSchema = z.union([
  singleTxSchema,
  z.object({ transactions: z.array(singleTxSchema) }),
]);

export async function POST(req: Request) {
  const gate = await authenticateAndParseJson(req);
  if (!gate.ok) return gate.response;

  const parsed = spendingPayloadSchema.safeParse(gate.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid spending payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const isBatch = 'transactions' in parsed.data;
  const items = 'transactions' in parsed.data ? parsed.data.transactions : [parsed.data];
  if (items.length === 0) {
    return NextResponse.json({ ok: true, recordsProcessed: 0, ids: [] });
  }

  const now = new Date();
  const rows: Array<{
    id: string;
    day: string;
    occurredAt: Date;
    amountGbp: number;
    merchant: string;
    category: SpendCategory;
    source: 'apple_pay' | 'natwest_csv';
    isLateSpend: boolean;
    createdAt: Date;
  }> = [];

  for (const item of items) {
    const rawAmount = (item.amount ?? item.amountGbp ?? item.amount_gbp)!;
    const amountGbp = Math.round(Math.abs(rawAmount) * 100) / 100;
    if (amountGbp <= 0) {
      return NextResponse.json(
        { error: `Invalid transaction amount for merchant "${item.merchant}"` },
        { status: 400 },
      );
    }

    const rawTs = item.occurredAt ?? item.occurred_at;
    const occurredAt = rawTs ? parseFlexibleTimestamp(rawTs) : now;
    if (!occurredAt) {
      return NextResponse.json(
        { error: `Invalid occurredAt timestamp "${rawTs}"` },
        { status: 400 },
      );
    }

    const day = toLondonDay(occurredAt);
    const source = item.source ?? (isBatch ? 'natwest_csv' : 'apple_pay');
    const normMerchant = item.merchant.trim().toLowerCase().replace(/\s+/g, ' ');
    const explicitCat = item.category?.trim().toLowerCase();
    const category: SpendCategory =
      explicitCat && spendCategorySet.has(explicitCat)
        ? (explicitCat as SpendCategory)
        : categoriseUkMerchant(item.merchant);

    let id = item.id;
    if (!id) {
      if (item.dedupeKey) {
        id = `tx_${sha256Short(item.dedupeKey)}`;
      } else if (source === 'apple_pay') {
        const bucket120s = Math.floor(occurredAt.getTime() / 120_000);
        id = `tx_${sha256Short(`${day}|${bucket120s}|${amountGbp.toFixed(2)}|${normMerchant}`)}`;
      } else {
        id = `tx_${sha256Short(`${day}|${occurredAt.toISOString()}|${amountGbp.toFixed(2)}|${normMerchant}`)}`;
      }
    }

    rows.push({
      id,
      day,
      occurredAt,
      amountGbp,
      merchant: item.merchant.trim(),
      category,
      source,
      isLateSpend: isLondonLateHour(occurredAt, 21),
      createdAt: now,
    });
  }

  try {
    const deduped = dedupeBy(rows, (r) => r.id);
    const db = getDb();

    await db
      .insert(lifeSpendingTx)
      .values(deduped)
      .onConflictDoUpdate({
        target: lifeSpendingTx.id,
        set: {
          day: sql`excluded.day`,
          occurredAt: sql`excluded.occurred_at`,
          amountGbp: sql`excluded.amount_gbp`,
          merchant: sql`excluded.merchant`,
          category: sql`excluded.category`,
          source: sql`excluded.source`,
          isLateSpend: sql`excluded.is_late_spend`,
        },
      });

    await logIngestSuccess('ingest_spending', 'life_spending_tx', deduped.length);

    return NextResponse.json({
      ok: true,
      recordsProcessed: deduped.length,
      ids: deduped.map((r) => r.id),
      categories: deduped.map((r) => r.category),
    });
  } catch (err) {
    return handleIngestFailure(
      'ingest_spending',
      'life_spending_tx',
      err,
      'Spending ingestion failed',
    );
  }
}
