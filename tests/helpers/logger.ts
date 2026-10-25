import { createLogger, type Logger } from "@/lib/log";

/** A logger that discards everything, for tests that do not assert on logs. */
export function silentLogger(): Logger {
  return createLogger({ write: () => undefined });
}
