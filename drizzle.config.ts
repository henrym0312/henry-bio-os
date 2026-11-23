// WARNING: neondb is shared with henry-screen-os (st_daily_summary, st_daily_apps, st_hourly_activity).
// Never run drizzle-kit push against this database; apply schema changes via additive SQL scripts instead.
import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  tablesFilter: ['!st_*'],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
