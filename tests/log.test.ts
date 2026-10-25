import { describe, expect, it } from "vitest";
import { createLogger } from "@/lib/log";

describe("createLogger", () => {
  it("writes one JSON line per entry with level, message and fields", () => {
    const lines: string[] = [];
    const log = createLogger({ write: (line) => lines.push(line), now: () => new Date("2026-10-25T12:00:00Z") });

    log.info("job.done", { queue: "turn", ms: 12 });
    log.error("job.failed", { queue: "turn" });

    expect(lines.map((line) => JSON.parse(line))).toEqual([
      { at: "2026-10-25T12:00:00.000Z", level: "info", msg: "job.done", queue: "turn", ms: 12 },
      { at: "2026-10-25T12:00:00.000Z", level: "error", msg: "job.failed", queue: "turn" },
    ]);
    expect(lines.every((line) => line.endsWith("\n"))).toBe(true);
  });

  it("serializes errors as name and message only", () => {
    const lines: string[] = [];
    const log = createLogger({ write: (line) => lines.push(line) });

    log.warn("oops", { error: new TypeError("bad thing") });

    expect(JSON.parse(lines[0]).error).toEqual({ name: "TypeError", message: "bad thing" });
  });

  it("binds fields into a child logger", () => {
    const lines: string[] = [];
    const log = createLogger({ write: (line) => lines.push(line) }).child({ worker: "w1" });

    log.info("hi");

    expect(JSON.parse(lines[0])).toMatchObject({ worker: "w1", msg: "hi" });
  });
});
