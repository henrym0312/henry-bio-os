import { NextResponse } from 'next/server';
import {
  createExperimentRecord,
  createExperimentSchema,
  listExperiments,
  updateExperimentRecord,
  updateExperimentSchema,
} from '@/lib/analytics/insights';
import { verifyBearerSecret } from '@/lib/env';
import { authenticateAndParseJson } from '@/lib/life/ingest';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const experiments = await listExperiments();
    return NextResponse.json({ ok: true, experiments });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to load experiments';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const gate = await authenticateAndParseJson(req);
  if (!gate.ok) return gate.response;

  const parsed = createExperimentSchema.safeParse(gate.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid experiment payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const experiment = await createExperimentRecord(parsed.data);
    return NextResponse.json({ ok: true, experiment }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to create experiment';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const auth = verifyBearerSecret(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parsed = updateExperimentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid experiment update payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const updated = await updateExperimentRecord(parsed.data);
    if (!updated) {
      return NextResponse.json({ error: 'Experiment not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, experiment: updated });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to update experiment';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
