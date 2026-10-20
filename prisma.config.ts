import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Local secrets live in .env.local (never committed); .env is the fallback.
config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
