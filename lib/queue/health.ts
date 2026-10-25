import { createServer, type Server } from "node:http";

export interface HealthServerOptions {
  /** 0 picks a free port (tests). */
  port: number;
  host?: string;
  isHealthy: () => boolean;
}

/** Minimal `/health` endpoint for the container healthcheck: 200 while running, 503 otherwise. */
export function startHealthServer({ port, host = "127.0.0.1", isHealthy }: HealthServerOptions): Promise<Server> {
  const server = createServer((request, response) => {
    if (request.url !== "/health") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(isHealthy() ? 200 : 503, { "content-type": "text/plain" }).end(isHealthy() ? "ok" : "stopping");
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });
}
