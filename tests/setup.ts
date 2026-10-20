import { config } from "dotenv";
import { assertTestDatabaseUrl } from "./helpers/test-database";

config({ path: ".env.local" });

// Point every import of lib/prisma at the test database.
process.env.DATABASE_URL = assertTestDatabaseUrl(process.env.TEST_DATABASE_URL);
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-123456";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
