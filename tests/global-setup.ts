import { execFileSync } from "node:child_process";
import { config } from "dotenv";
import { assertTestDatabaseUrl } from "./helpers/test-database";

const MAX_ERROR_LINES = 8;

/** Applies migrations to the test database once per run (never to dev/prod). */
export default function setup(): void {
  config({ path: ".env.local" });
  const testUrl = assertTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  try {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: testUrl },
      stdio: "pipe",
      encoding: "utf8",
    });
  } catch (error) {
    const output =
      error instanceof Error && "stderr" in error ? String((error as { stderr: unknown }).stderr) : "";
    const tail = output.trim().split("\n").slice(-MAX_ERROR_LINES).join("\n");
    throw new Error(
      `Could not migrate the test database. Is the SSH tunnel up? Run "npm run db:tunnel".\n${tail}`,
    );
  }
}
