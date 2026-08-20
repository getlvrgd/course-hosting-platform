import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Configuration for the Prisma CLI — migrate, introspect, studio.
 *
 * Migrations deliberately do not use the same connection string the app does.
 *
 * Vercel's Neon integration hands out two URLs: `DATABASE_URL` goes through PgBouncer,
 * which is what you want for a serverless app opening and closing connections
 * constantly, and `DATABASE_URL_UNPOOLED` is a direct connection. Schema migrations
 * take advisory locks and issue statements a transaction-mode pooler cannot carry, so
 * running them through the pooled URL can hang or fail partway.
 *
 * So: the CLI takes the direct connection when one is published, and falls back to
 * `DATABASE_URL` for providers that only give you one (or for a plain local Postgres).
 * The runtime client in src/lib/db.ts always uses the pooled `DATABASE_URL`.
 */
const migrationUrl =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: migrationUrl,
  },
});
