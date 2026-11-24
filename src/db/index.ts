import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __pgPool?: Pool; __db?: Db };

function createDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  const pool =
    globalForDb.__pgPool ??
    new Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30_000,
      ssl: /sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined,
    });
  globalForDb.__pgPool = pool;
  return drizzle(pool, { schema });
}

/** Lazily created so `next build` can import route modules without a database. */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    globalForDb.__db ??= createDb();
    return Reflect.get(globalForDb.__db, prop, receiver);
  },
});

export { schema };
