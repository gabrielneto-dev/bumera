import { AsyncLocalStorage } from "node:async_hooks";

/**
 * E-mail delivery is postponed (decision CTX-DEC-20261020-email-on-screen): every message
 * the system would e-mail is shown on screen to the person who requested it. Flows talk to
 * `emailTransport`, so a real provider can replace the on-screen one without touching them.
 */
export type EmailKind = "verification-code" | "invitation";

export interface EmailMessage {
  to: string;
  kind: EmailKind;
  /** One-time code (verification). */
  code?: string;
  /** Link to open (invitation). */
  link?: string;
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

const captureStore = new AsyncLocalStorage<EmailMessage[]>();

/**
 * Runs `run` and returns the messages sent during it. Only server actions call this, so a
 * code can only be read by the signed-in person who triggered it.
 */
export async function captureEmails<T>(
  run: () => Promise<T>,
): Promise<{ result: T; messages: EmailMessage[] }> {
  const messages: EmailMessage[] = [];
  const result = await captureStore.run(messages, run);
  return { result, messages };
}

export const onScreenTransport: EmailTransport = {
  async send(message) {
    const sink = captureStore.getStore();
    if (!sink) {
      // Public endpoints (e.g. Better Auth's own routes) must not be able to read codes.
      throw new Error("E-mail delivery is not configured: messages are only shown on screen");
    }
    sink.push(message);
  },
};

/** Swap for a real provider when one is chosen (CTX-QUE-20261018-email-provider). */
export const emailTransport: EmailTransport = onScreenTransport;
