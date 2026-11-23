import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from './schema';

neonConfig.webSocketConstructor = ws;

declare global {
  var __henryBioOsPool: Pool | undefined;
  var __henryBioOsDb: NeonDatabase<typeof schema> | undefined;
}

function createDb(): NeonDatabase<typeof schema> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not defined');
  }

  const pool =
    globalThis.__henryBioOsPool ??
    new Pool({
      connectionString,
    });

  if (process.env.NODE_ENV !== 'production') {
    globalThis.__henryBioOsPool = pool;
  }

  return drizzle(pool, { schema });
}

export function getDb(): NeonDatabase<typeof schema> {
  if (!globalThis.__henryBioOsDb) {
    globalThis.__henryBioOsDb = createDb();
  }
  return globalThis.__henryBioOsDb;
}

export { schema };
