import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    // Tests share one Postgres test database, so files run one at a time.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      // Framework glue without testable logic of its own (covered by e2e instead).
      exclude: ["lib/auth.ts", "lib/auth-client.ts", "lib/prisma.ts", "lib/session.ts", "lib/utils.ts"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
