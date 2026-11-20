import { SleepLabClient } from '@/components/SleepLabClient';
import { getSleepLabData } from '@/lib/ui/telemetry-queries';

export const dynamic = 'force-dynamic';

export default async function SleepLabPage({
  searchParams,
}: {
  searchParams: Promise<{ night?: string }>;
}) {
  const resolved = await searchParams;
  const data = await getSleepLabData(resolved.night);
  return <SleepLabClient data={data} />;
}
