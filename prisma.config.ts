import path from "node:path";
import { defineConfig } from "prisma/config";

// Load .env for CLI commands (migrate/seed).
import "dotenv/config";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
