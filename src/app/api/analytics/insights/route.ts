import { NextResponse } from 'next/server';
import { getInsightsData } from '@/lib/analytics/insights';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getInsightsData();
    return NextResponse.json(data);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to load life analytics insights';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
