import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { getEnv } from "@/server/config/env";
import { resolveDatabaseUrl } from "@/server/db/url";

/**
 * Prisma client singleton backed by the libSQL driver adapter. The same adapter
 * serves a local SQLite file (`file:./prisma/dev.db`) in dev and a hosted Turso
 * database in production — the only difference is DATABASE_URL / auth token.
 *
 * Cached on globalThis so Next.js hot-reload and repeated CLI imports don't open
 * a new connection pool every time.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const env = getEnv();
  const adapter = new PrismaLibSQL({
    url: resolveDatabaseUrl(env.DATABASE_URL),
    authToken: env.DATABASE_AUTH_TOKEN,
  });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
