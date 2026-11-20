import { CorrelationsClient } from '@/components/CorrelationsClient';
import { getCorrelationsData } from '@/lib/analytics/stats';

export const dynamic = 'force-dynamic';

export default async function CorrelationsPage() {
  const initialData = await getCorrelationsData({
    x: 'bedtime_serum_ng_ml',
    y: 'sleep.deep_sleep_duration',
    window: '90d',
    lag: 0,
    includePresets: true,
  });

  return <CorrelationsClient initialData={initialData} />;
}
