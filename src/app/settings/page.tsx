import { SettingsClient } from '@/components/SettingsClient';
import { getSettingsPageData } from '@/lib/ui/telemetry-queries';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ oauth?: string; reason?: string }>;
}) {
  const [data, resolved] = await Promise.all([
    getSettingsPageData(),
    searchParams,
  ]);

  return (
    <SettingsClient
      data={data}
      oauthStatusParam={resolved.oauth}
      oauthReasonParam={resolved.reason}
    />
  );
}
