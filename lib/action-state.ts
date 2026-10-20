/** Result of a server action, shown by the form that called it. */
export interface ActionState {
  status: "idle" | "success" | "error";
  message?: string;
  code?: string;
  /** Field name -> message, for validation errors. */
  fieldErrors?: Record<string, string>;
  /** Values the user submitted, returned on error so the form can keep them. */
  values?: Record<string, string | string[]>;
}

export const idleState: ActionState = { status: "idle" };
