import "dotenv/config";
import { defineConfig } from "prisma/config";

// Plain ESM, shared with the build scripts so the app, the CLI and `npm run build`
// all resolve the connection string from the same list.
import { migrationUrl } from "./scripts/database-url.mjs";

/**
 * Configuration for the Prisma CLI — migrate, introspect, studio.
 *
 * Migrations deliberately do not use the same connection string the app does: they
 * take advisory locks and issue statements a transaction-mode pooler cannot carry, so
 * running them through PgBouncer can hang or fail part way. `migrationUrl` prefers a
 * direct connection and falls back to the pooled one for providers that only publish
 * a single URL. See scripts/database-url.mjs for the whole list and why it is long.
 *
 * No error is thrown for a missing URL, deliberately — `prisma generate` loads this
 * file and does not need a database. The build fails with something readable at
 * `scripts/migrate.mjs` instead.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: migrationUrl(),
  },
});
