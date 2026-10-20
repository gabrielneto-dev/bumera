import { execFileSync } from "node:child_process";
import { config } from "dotenv";
import { Client } from "pg";
import { assertTestDatabaseUrl } from "../tests/helpers/test-database";

/** Migrates and empties the TEST database before the browser run. Refuses any other database. */
export default async function globalSetup(): Promise<void> {
  config({ path: ".env.local" });
  const url = assertTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('TRUNCATE TABLE "organization", "user", "verification" CASCADE');
  } finally {
    await client.end();
  }
}
