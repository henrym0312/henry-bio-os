import { CardioClient } from '@/components/CardioClient';
import { getCardioTelemetryData } from '@/lib/ui/telemetry-queries';

export const dynamic = 'force-dynamic';

export default async function CardioPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const resolved = await searchParams;
  const data = await getCardioTelemetryData(resolved.day);
  return <CardioClient data={data} />;
}
