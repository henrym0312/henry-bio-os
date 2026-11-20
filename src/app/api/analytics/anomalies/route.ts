import { NextResponse } from 'next/server';
import { getAnomalyReport } from '@/lib/analytics/stats';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const report = await getAnomalyReport();
    return NextResponse.json(report);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to compute anomaly detection report';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
