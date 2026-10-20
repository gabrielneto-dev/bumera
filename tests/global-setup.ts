import { execFileSync } from "node:child_process";
import { config } from "dotenv";
import { assertTestDatabaseUrl } from "./helpers/test-database";

/** Applies migrations to the test database once per run (never to dev/prod). */
export default function setup(): void {
  config({ path: ".env.local" });
  const testUrl = assertTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "pipe",
  });
}
