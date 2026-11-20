import { BriefingsClient } from '@/components/BriefingsClient';
import { getBriefingsPageData } from '@/lib/ui/telemetry-queries';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export default async function BriefingsPage() {
  const data = await getBriefingsPageData();
  return <BriefingsClient initialBriefings={data.briefings} />;
}
