import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '.env.local' });

export default defineConfig({
  schema: './src/lib/db/schema/index.ts',
  out: './src/lib/db/migrations',
  dialect: 'postgresql',
  // biome-ignore lint/style/noNonNullAssertion: validated at import time above
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});
