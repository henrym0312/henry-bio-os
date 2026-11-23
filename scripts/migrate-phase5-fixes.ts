import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

/**
 * Idempotent additive SQL fixes for Phase 5:
 * makes life_subjective_daily.physical_soreness nullable so 3-slider iOS
 * check-ins work without supplying soreness.
 * Never touches shared st_* tables.
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not defined');
  }

  const sql = neon(connectionString);

  await sql`
    ALTER TABLE "life_subjective_daily"
    ALTER COLUMN "physical_soreness" DROP NOT NULL
  `;

  const [col] = await sql`
    SELECT column_name, is_nullable, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'life_subjective_daily'
      AND column_name = 'physical_soreness'
  `;

  console.log('life_subjective_daily.physical_soreness:', JSON.stringify(col));
}

main().catch((err) => {
  console.error('Phase 5 migration failed:', err);
  process.exit(1);
});
