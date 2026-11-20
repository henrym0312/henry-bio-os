import dotenv from 'dotenv';
import { runBackfill } from '../src/lib/oura/sync';
import { ALL_OURA_ENDPOINTS, type OuraEndpointKey } from '../src/lib/oura/types';

dotenv.config({ path: '.env.local' });

function getArg(flag: string): string | undefined {
  const prefix = `--${flag}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

async function main() {
  const startDate = getArg('start');
  const endDate = getArg('end');
  const endpointsArg = getArg('endpoints');

  let endpoints: OuraEndpointKey[] | undefined;
  if (endpointsArg) {
    const requested = endpointsArg.split(',').map((s) => s.trim());
    endpoints = requested.filter((e): e is OuraEndpointKey =>
      (ALL_OURA_ENDPOINTS as readonly string[]).includes(e),
    );
  }

  console.log('Starting HenryBioOS historical Oura Cloud API v2 backfill...');
  const result = await runBackfill({
    startDate,
    endDate,
    endpoints,
    source: 'cli_backfill',
    onProgress: (msg) => console.log(msg),
  });

  console.log(
    `\nBackfill complete (${result.startDate} to ${result.endDate}). Total records upserted: ${result.totalRecords}`,
  );
  console.log(JSON.stringify(result.summary, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
