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
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MIGRATION_URL_VARS, migrationUrl } from "./database-url.mjs";

const url = migrationUrl();

if (!url) {
  /*
   * What the host *did* inject, by name only.
   *
   * "No connection string" has two very different causes and no way to tell them
   * apart from the outside: nothing was set at all, or something was set under a name
   * this app does not look for — a custom prefix on a database integration, most
   * often. Listing what is actually visible turns that into a diagnosis.
   *
   * Names only, never values. These are credentials and this output goes into a build
   * log that is kept.
   */
  // Anything named after a database, plus anything that is *some* kind of URL —
  // because the usual cause is a custom prefix, and the prefix could be anything.
  // Vercel's own URLs are excluded; they are never a connection string and would only
  // bury the one line that matters.
  const NOISE = /^(NEXT_PUBLIC_)?VERCEL_/i;
  const looksDatabaseish = Object.keys(process.env)
    .filter(
      (name) =>
        !NOISE.test(name) &&
        (/^(DATABASE|POSTGRES|PG|NEON|DIRECT|SUPABASE|PRISMA)/i.test(name) ||
          /_URL(_UNPOOLED|_NON_POOLING)?$/i.test(name)),
    )
    .sort();

  console.error(
    [
      "",
      "  No database connection string, so there is nothing to migrate.",
      "",
      looksDatabaseish.length
        ? [
            "  This build CAN see these database-looking variables:",
            ...looksDatabaseish.map((name) => `    · ${name}`),
            "",
            "  None of them is a name this app reads. If one of those is your",
            "  connection string, the integration was connected with a custom",
            "  variable prefix — reconnect it with the prefix left empty, or copy",
            "  the value into DATABASE_URL yourself.",
          ].join("\n")
        : "  This build can see NO database variables at all, under any name.",
      "",
      "  Set one of these and deploy again:",
      ...MIGRATION_URL_VARS.map((name) => `    · ${name}`),
      "",
      "  On Vercel: Project → Settings → Environment Variables, or attach a",
      "  Postgres from the Storage tab and it will set them for you. Two things",
      "  catch people out:",
      "",
      "    · A variable must be ticked for the environment being built — Production",
      "      for a main-branch deploy, Preview for a branch.",
      "    · Variables are read when a build STARTS. Adding one does not affect a",
      "      build already running, or one that started before you added it. Deploy",
      "      again after setting them.",
      "",
      "  Locally: copy .env.example to .env and fill in DATABASE_URL.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

/*
 * `node_modules/.bin` is put on PATH by npm when it runs a script, and by nothing else.
 * Adding it here means this works when invoked directly — `node scripts/migrate.mjs` —
 * as well as through `npm run build`, rather than failing with "prisma: command not
 * found" the first time somebody runs it the other way.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const binDir = path.join(here, "..", "node_modules", ".bin");

// The URL is passed explicitly rather than left to the config, so the child migrates
// the same database this script just checked — no chance of the two disagreeing.
const result = spawnSync("prisma", ["migrate", "deploy"], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: url,
    PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
  },
  shell: true,
});

process.exit(result.status ?? 1);
