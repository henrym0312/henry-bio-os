import { ArchiveClient } from '@/components/ArchiveClient';
import {
  getArchiveHeatmapMatrix,
  queryRawOuraTable,
} from '@/lib/ui/telemetry-queries';

export const dynamic = 'force-dynamic';

export default async function ArchivePage() {
  const [heatmapMatrix, initialRepo] = await Promise.all([
    getArchiveHeatmapMatrix(),
    queryRawOuraTable('sleep', '', 1, 25).catch(() => ({ rows: [], total: 0 })),
  ]);

  return (
    <ArchiveClient
      heatmapMatrix={heatmapMatrix}
      initialTable="sleep"
      initialRecords={initialRepo.rows}
      initialTotal={initialRepo.total}
    />
  );
}
