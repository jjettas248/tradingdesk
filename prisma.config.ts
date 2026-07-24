import path from "node:path";
import { defineConfig } from "prisma/config";
import { resolveDatabaseUrl } from "./src/server/db/url.ts";

// Load .env for CLI commands (migrate/seed) — prisma.config.ts does not read it
// automatically the way the old package.json#prisma block did.
import "dotenv/config";

// Anchor a relative file: DATABASE_URL to an absolute path (project root) so the
// migrate CLI and the runtime libSQL adapter operate on the same database file.
process.env.DATABASE_URL = resolveDatabaseUrl(process.env.DATABASE_URL);

/**
 * Presence of this file makes the Prisma CLI resolve relative datasource paths
 * from the project root (where this file lives) — the same base the libSQL
 * adapter uses at runtime. Without it, `prisma migrate` writes to
 * prisma/prisma/dev.db while the app reads prisma/dev.db.
 */
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
