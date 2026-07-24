import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Prisma libSQL driver adapter pulls in native-ish deps; keep them external
  // to the server bundle so they load at runtime rather than being bundled.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-libsql", "@libsql/client"],
};

export default nextConfig;
