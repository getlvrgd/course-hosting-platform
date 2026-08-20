/**
 * `prisma migrate deploy`, with an error worth reading.
 *
 * Prisma's own answer when no connection string is configured is "Connection url is
 * empty", which on a host that is building your project for the first time is not
 * enough to act on. This says which variables were looked for and what to do, then
 * hands over to Prisma unchanged.
 *
 * Run from `npm run build`, so a deploy migrates itself.
 */
// Reads .env the same way prisma.config.ts does, so `npm run build` works locally
// exactly as it does on a host that sets real environment variables.
import "dotenv/config";

import { spawnSync } from "node:child_process";

import { MIGRATION_URL_VARS, migrationUrl } from "./database-url.mjs";

const url = migrationUrl();

if (!url) {
  console.error(
    [
      "",
      "  No database connection string, so there is nothing to migrate.",
      "",
      "  Set one of these as an environment variable and deploy again:",
      ...MIGRATION_URL_VARS.map((name) => `    · ${name}`),
      "",
      "  On Vercel: Project → Settings → Environment Variables, or attach a",
      "  Postgres from the Storage tab and it will set them for you. Make sure it",
      "  is available to the Production environment, and to Preview if you deploy",
      "  branches.",
      "",
      "  Locally: copy .env.example to .env and fill in DATABASE_URL.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

// Passed explicitly rather than left to the config, so the child is migrating the same
// database this script just checked — no chance of the two disagreeing.
const result = spawnSync(
  "prisma",
  ["migrate", "deploy"],
  { stdio: "inherit", env: { ...process.env, DATABASE_URL: url }, shell: true },
);

process.exit(result.status ?? 1);
