/**
 * Where the database URL comes from, in one place.
 *
 * Hosts disagree about what to call it. A plain Postgres and most setups use
 * `DATABASE_URL`; Vercel's Postgres and Neon integrations publish a family of
 * `POSTGRES_*` names and may not set `DATABASE_URL` at all, which is exactly how a
 * deploy ends up telling you the connection url is empty while a database is sitting
 * right there attached to the project.
 *
 * Two different answers are wanted, which is why there are two lists:
 *
 *   * **Migrations** want a *direct* connection. They take advisory locks and issue
 *     statements a transaction-mode pooler cannot carry, so running them through
 *     PgBouncer can hang or fail half way.
 *   * **The running app** wants the *pooled* one. It opens and closes connections
 *     constantly, which is what the pooler is for.
 *
 * Each list ends at the other's preference, so a provider that only publishes one URL
 * still works.
 *
 * Plain ESM with no imports so the build scripts, the Prisma CLI config and the app
 * can all read the same list — see src/lib/db.ts and prisma.config.ts.
 */

const first = (names) => {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value;
  }
  return undefined;
};

/** Direct connection preferred. Used by `prisma migrate` and `prisma db`. */
export const MIGRATION_URL_VARS = [
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
  "DIRECT_URL",
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
];

/** Pooled connection preferred. Used by the app at runtime. */
export const RUNTIME_URL_VARS = [
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
];

export const migrationUrl = () => first(MIGRATION_URL_VARS);
export const runtimeUrl = () => first(RUNTIME_URL_VARS);
