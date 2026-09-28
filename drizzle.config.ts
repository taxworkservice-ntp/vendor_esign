import type { Config } from 'drizzle-kit'
export default {
  schema: './src/server/schema.ts',
  out: './db/drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.NETLIFY_DATABASE_URL ?? process.env.DATABASE_URL ?? '' },
} satisfies Config
