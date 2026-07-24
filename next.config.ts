import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Prisma's engine external to the server bundle so it loads at runtime.
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
