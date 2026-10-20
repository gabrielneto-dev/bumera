interface PrismaLikeError {
  code?: unknown;
  meta?: { driverAdapterError?: { cause?: { originalCode?: unknown } } };
}

function asError(error: unknown): PrismaLikeError | null {
  return typeof error === "object" && error !== null ? (error as PrismaLikeError) : null;
}

function postgresCode(error: unknown): unknown {
  return asError(error)?.meta?.driverAdapterError?.cause?.originalCode;
}

export function isUniqueViolation(error: unknown): boolean {
  return asError(error)?.code === "P2002" || postgresCode(error) === "23505";
}

/** The exclusion constraint that forbids overlapping appointments (Postgres 23P01). */
export function isOverlapViolation(error: unknown): boolean {
  return postgresCode(error) === "23P01";
}

export function isForeignKeyViolation(error: unknown): boolean {
  return asError(error)?.code === "P2003" || postgresCode(error) === "23503";
}

export function isNotFoundError(error: unknown): boolean {
  return asError(error)?.code === "P2025";
}
