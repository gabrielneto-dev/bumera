const TEST_DATABASE_SUFFIX = "_test";

/**
 * Tests truncate tables, so they must never run against dev or production data.
 * Returns the URL when its database name ends with "_test", otherwise throws.
 */
export function assertTestDatabaseUrl(url: string | undefined): string {
  if (!url) {
    throw new Error("TEST_DATABASE_URL is not set");
  }
  let databaseName: string;
  try {
    databaseName = new URL(url).pathname.replace(/^\//, "");
  } catch {
    throw new Error("TEST_DATABASE_URL is not a valid URL");
  }
  if (!databaseName.endsWith(TEST_DATABASE_SUFFIX)) {
    throw new Error(
      `Refusing to run tests: database "${databaseName}" does not end with "${TEST_DATABASE_SUFFIX}"`,
    );
  }
  return url;
}
