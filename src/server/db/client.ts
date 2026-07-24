import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton. Talks to PostgreSQL (Railway in production) via the
 * default query engine — DATABASE_URL is a standard `postgresql://…` connection
 * string. Cached on globalThis so Next.js hot-reload and repeated CLI imports
 * don't open a new connection pool every time.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
