import { timingSafeEqual } from "node:crypto";

import { prisma } from "@/lib/db";

/**
 * Is this deployment actually working?
 *
 * A page that fails to render gives a viewer "a server error occurred" and nothing
 * else, and the real cause is in a hosting dashboard several clicks away. This says it
 * plainly, from inside the deployment, over HTTP.
 *
 * **Public answer**: `{ ok }` and nothing more — whether the app can reach its
 * database. That is what a status check needs and it tells a stranger nothing they
 * could not learn by loading the site.
 *
 * **Detailed answer**: pass `?key=<AUTH_SECRET>`. Adds the names of the configuration
 * this deployment can see, the row counts, and the *reason* a connection failed. Gated
 * because the reason routinely contains a hostname, and compared in constant time so
 * the endpoint cannot be used to guess the secret a character at a time.
 *
 * Values are never returned, only names — the same rule as scripts/migrate.mjs.
 */
export const dynamic = "force-dynamic";

function authorised(key: string | null) {
  const secret = process.env.AUTH_SECRET;
  if (!key || !secret) return false;
  const a = Buffer.from(key);
  const b = Buffer.from(secret);
  // Length is compared first because timingSafeEqual throws on a mismatch; the length
  // of a secret is not the part worth hiding.
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Anything that could carry a credential, reduced to the fact that it is set. */
const configNames = () =>
  Object.keys(process.env)
    .filter((name) =>
      /^(DATABASE|POSTGRES|PG|NEON|DIRECT|AUTH_SECRET|BLOB_)/i.test(name),
    )
    .sort();

export async function GET(request: Request) {
  const detailed = authorised(new URL(request.url).searchParams.get("key"));

  let ok = false;
  let reason: string | null = null;
  let counts: Record<string, number> | null = null;

  try {
    const [users, hubs, courses] = await Promise.all([
      prisma.user.count(),
      prisma.hub.count(),
      prisma.course.count(),
    ]);
    counts = { users, hubs, courses };
    ok = true;
  } catch (error) {
    // The message is the useful part — "password authentication failed", "SASL
    // channel binding", "no pg_hba.conf entry" each point somewhere different.
    reason = error instanceof Error ? error.message : String(error);
  }

  if (!detailed) {
    return Response.json({ ok }, { status: ok ? 200 : 503 });
  }

  return Response.json(
    {
      ok,
      database: ok ? "connected" : "unreachable",
      reason,
      counts,
      // Names only. Never values.
      configured: configNames(),
      needsSetup: counts ? counts.users === 0 : null,
      runtime: process.version,
    },
    { status: ok ? 200 : 503 },
  );
}
