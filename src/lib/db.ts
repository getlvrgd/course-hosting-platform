import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

// Plain ESM, shared with prisma.config.ts and the build scripts so every part of this
// app resolves the connection string from the same list.
import { RUNTIME_URL_VARS, runtimeUrl } from "../../scripts/database-url.mjs";

/**
 * A single PrismaClient is reused across hot reloads in development; Next.js would
 * otherwise open a new database connection on every code change until Postgres refuses.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  // The pooled URL by preference — this app opens and closes connections constantly,
  // which is what a pooler is for. Migrations take the direct one; see
  // scripts/database-url.mjs.
  const connectionString = runtimeUrl();
  if (!connectionString) {
    // Failing here, by name, beats a driver error three stack frames deep that does
    // not say which of half a dozen variable names it went looking for.
    throw new Error(
      `No database connection string. Set one of: ${RUNTIME_URL_VARS.join(", ")}. Locally, copy .env.example to .env.`,
    );
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
