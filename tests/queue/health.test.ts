import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { startHealthServer } from "@/lib/queue/health";

let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

async function get(path: string): Promise<number> {
  const { port } = server!.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  return response.status;
}

describe("startHealthServer", () => {
  it("answers 200 on /health while healthy and 503 otherwise", async () => {
    let healthy = true;
    server = await startHealthServer({ port: 0, isHealthy: () => healthy });

    expect(await get("/health")).toBe(200);
    healthy = false;
    expect(await get("/health")).toBe(503);
  });

  it("answers 404 on any other path", async () => {
    server = await startHealthServer({ port: 0, isHealthy: () => true });

    expect(await get("/")).toBe(404);
  });
});
