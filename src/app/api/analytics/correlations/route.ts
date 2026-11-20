import { NextRequest, NextResponse } from 'next/server';
import {
  getCorrelationsData,
  type CorrelationLag,
  type CorrelationWindow,
} from '@/lib/analytics/stats';

export const dynamic = 'force-dynamic';

const VALID_WINDOWS = new Set<CorrelationWindow>(['30d', '90d', '365d', 'all']);

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const x = url.searchParams.get('x') ?? 'bedtime_serum_ng_ml';
    const y = url.searchParams.get('y') ?? 'sleep.deep_sleep_duration';
    const rawWindow = (url.searchParams.get('window') ?? '90d') as CorrelationWindow;
    const window: CorrelationWindow = VALID_WINDOWS.has(rawWindow) ? rawWindow : '90d';

    const rawLag = Number(url.searchParams.get('lag') ?? '0');
    const lag: CorrelationLag = rawLag === 1 || rawLag === 2 ? rawLag : 0;
    const includePresets = url.searchParams.get('presets') === 'true';

    const result = await getCorrelationsData({
      x,
      y,
      window,
      lag,
      includePresets,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to compute correlations';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
