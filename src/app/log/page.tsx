import { QuickLogClient } from '@/components/log/QuickLogClient';
import { getQuickLogInitialState } from '@/lib/life/quick-log';

export const dynamic = 'force-dynamic';

export default async function QuickLogPage() {
  const initialState = await getQuickLogInitialState();
  return <QuickLogClient initialState={initialState} />;
}
