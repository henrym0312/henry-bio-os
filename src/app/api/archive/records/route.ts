import { NextRequest, NextResponse } from 'next/server';
import { ALL_OURA_ENDPOINTS, type OuraEndpointKey } from '@/lib/oura/types';
import { queryRawOuraTable } from '@/lib/ui/telemetry-queries';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const tableParam = url.searchParams.get('table') ?? 'sleep';
    const search = url.searchParams.get('q') ?? '';
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);

    const tableKey: OuraEndpointKey = (
      ALL_OURA_ENDPOINTS as readonly string[]
    ).includes(tableParam)
      ? (tableParam as OuraEndpointKey)
      : 'sleep';

    const result = await queryRawOuraTable(tableKey, search, page, 25);
    return NextResponse.json({
      table: tableKey,
      page,
      pageSize: 25,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Archive query failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
