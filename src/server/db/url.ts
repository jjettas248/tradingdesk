import path from "node:path";

/**
 * Normalize a `file:` SQLite URL to an absolute path anchored at the project
 * root (process.cwd()).
 *
 * Why this exists: the Prisma CLI resolves a relative `file:` datasource path
 * relative to the *schema directory* (prisma/), while the libSQL driver adapter
 * resolves it relative to the *current working directory* (project root). Left
 * alone, `prisma migrate` writes prisma/prisma/dev.db while the app reads
 * prisma/dev.db. Forcing both to an absolute path removes the ambiguity.
 *
 * Non-file URLs (e.g. libsql:// for hosted Turso in production) pass through
 * unchanged.
 */
export function resolveDatabaseUrl(raw: string | undefined): string {
  const url = raw ?? "file:./prisma/dev.db";
  if (!url.startsWith("file:")) return url;

  let p = url.slice("file:".length);
  if (path.isAbsolute(p)) return `file:${p}`;

  p = p.replace(/^\.\//, "");
  return `file:${path.resolve(process.cwd(), p)}`;
}
