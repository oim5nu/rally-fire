import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });
config({ quiet: true });

export default defineConfig({
  schema: './server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.POSTGRES_URL_NON_POOLING ?? '',
  },
  strict: true,
  verbose: true,
});
