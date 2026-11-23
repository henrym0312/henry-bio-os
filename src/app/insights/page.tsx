import { InsightsDashboard } from '@/components/insights/InsightsDashboard';
import { getInsightsData } from '@/lib/analytics/insights';

export const dynamic = 'force-dynamic';

export default async function InsightsPage() {
  const initialData = await getInsightsData();
  return <InsightsDashboard initialData={initialData} />;
}
