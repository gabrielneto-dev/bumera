export type AppErrorCode =
  | "FORBIDDEN"
  | "VALIDATION"
  | "NOT_FOUND"
  | "DUPLICATE_PATIENT"
  | "SLOT_TAKEN"
  | "OUTSIDE_WORKING_HOURS"
  | "PAST_APPOINTMENT"
  | "INACTIVE_RESOURCE"
  | "INVALID_TRANSITION"
  | "NOT_OPTED_OUT";

/** Expected, user-facing failures. Anything else is a bug and must not leak details. */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: AppErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}
