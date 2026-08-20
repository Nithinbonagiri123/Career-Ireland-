import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env';
import * as schema from './schema';

const client = postgres(env.DATABASE_URL, {
  max: env.NODE_ENV === 'production' ? 10 : 3,
  prepare: false,
});

export const db = drizzle(client, { schema, logger: env.NODE_ENV === 'development' });
export type Db = typeof db;
