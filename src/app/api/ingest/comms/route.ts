import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { lifeCommsDaily } from '@/db/schema';
import {
  authenticateAndParseJson,
  dedupeBy,
  handleIngestFailure,
  isoDaySchema,
  logIngestSuccess,
} from '@/lib/life/ingest';

export const dynamic = 'force-dynamic';

const countField = z.number().int().min(0).optional();

const commsRowSchema = z.object({
  day: isoDaySchema,
  emailsReceivedGmail: countField,
  emails_received_gmail: countField,
  emailsSentGmail: countField,
  emails_sent_gmail: countField,
  emailsReceivedUni: countField,
  emails_received_uni: countField,
  emailsSentUni: countField,
  emails_sent_uni: countField,
  emailsReceivedOther: countField,
  emails_received_other: countField,
  emailsSentOther: countField,
  emails_sent_other: countField,
  imessagesReceived: countField,
  imessages_received: countField,
  imessagesSent: countField,
  imessages_sent: countField,
  lateCommsCount: countField,
  late_comms_count: countField,
});

const commsPayloadSchema = z.union([
  commsRowSchema,
  z.object({ rows: z.array(commsRowSchema) }),
]);

export async function POST(req: Request) {
  const gate = await authenticateAndParseJson(req);
  if (!gate.ok) return gate.response;

  const parsed = commsPayloadSchema.safeParse(gate.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid comms payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const items = 'rows' in parsed.data ? parsed.data.rows : [parsed.data];
  if (items.length === 0) {
    return NextResponse.json({ ok: true, recordsProcessed: 0, days: [] });
  }

  try {
    const now = new Date();
    const mapped = dedupeBy(
      items.map((item) => ({
        day: item.day,
        emailsReceivedGmail: item.emailsReceivedGmail ?? item.emails_received_gmail ?? 0,
        emailsSentGmail: item.emailsSentGmail ?? item.emails_sent_gmail ?? 0,
        emailsReceivedUni: item.emailsReceivedUni ?? item.emails_received_uni ?? 0,
        emailsSentUni: item.emailsSentUni ?? item.emails_sent_uni ?? 0,
        emailsReceivedOther: item.emailsReceivedOther ?? item.emails_received_other ?? 0,
        emailsSentOther: item.emailsSentOther ?? item.emails_sent_other ?? 0,
        imessagesReceived: item.imessagesReceived ?? item.imessages_received ?? 0,
        imessagesSent: item.imessagesSent ?? item.imessages_sent ?? 0,
        lateCommsCount: item.lateCommsCount ?? item.late_comms_count ?? 0,
        updatedAt: now,
      })),
      (r) => r.day,
    );

    const db = getDb();
    await db
      .insert(lifeCommsDaily)
      .values(mapped)
      .onConflictDoUpdate({
        target: lifeCommsDaily.day,
        set: {
          emailsReceivedGmail: sql`excluded.emails_received_gmail`,
          emailsSentGmail: sql`excluded.emails_sent_gmail`,
          emailsReceivedUni: sql`excluded.emails_received_uni`,
          emailsSentUni: sql`excluded.emails_sent_uni`,
          emailsReceivedOther: sql`excluded.emails_received_other`,
          emailsSentOther: sql`excluded.emails_sent_other`,
          imessagesReceived: sql`excluded.imessages_received`,
          imessagesSent: sql`excluded.imessages_sent`,
          lateCommsCount: sql`excluded.late_comms_count`,
          updatedAt: sql`excluded.updated_at`,
        },
      });

    await logIngestSuccess('ingest_comms', 'life_comms_daily', mapped.length);

    return NextResponse.json({
      ok: true,
      recordsProcessed: mapped.length,
      days: mapped.map((r) => r.day),
    });
  } catch (err) {
    return handleIngestFailure(
      'ingest_comms',
      'life_comms_daily',
      err,
      'Comms ingestion failed',
    );
  }
}
