/**
 * Structured JSON-lines logger for long-running processes (the worker). One line per entry so the
 * container log driver can parse it. Callers pass ids and counts only: never message text, phone
 * numbers or other patient data.
 */

export type LogLevel = "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

export interface Logger {
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

export interface LoggerOptions {
  write?: (line: string) => void;
  now?: () => Date;
}

function serialize(value: unknown): unknown {
  return value instanceof Error ? { name: value.name, message: value.message } : value;
}

function withSerializedErrors(fields: LogFields): LogFields {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, serialize(value)]));
}

export function createLogger(options: LoggerOptions = {}, bound: LogFields = {}): Logger {
  const write = options.write ?? ((line: string) => process.stdout.write(line));
  const now = options.now ?? (() => new Date());

  const emit = (level: LogLevel, msg: string, fields: LogFields = {}) => {
    const entry = { at: now().toISOString(), level, msg, ...withSerializedErrors({ ...bound, ...fields }) };
    write(`${JSON.stringify(entry)}\n`);
  };

  return {
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
    child: (fields) => createLogger(options, { ...bound, ...fields }),
  };
}
