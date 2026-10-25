/**
 * Burst buffer: people send several short messages in a row, so a turn waits for the burst to end.
 * Each new message pushes the turn back; the wait grows with the burst but is bounded, and a patient
 * who keeps typing still gets an answer within MAX_WAIT_MS of their first unanswered message.
 */
const BASE_WAIT_MS = 6000;
const EXTRA_WAIT_PER_MESSAGE_MS = 2000;
const WINDOW_CAP_MS = 20_000;
const MAX_WAIT_MS = 45_000;

export interface DebounceInput {
  now: Date;
  /** Inbound messages not read by any turn yet, including the one just received. */
  unseenCount: number;
  firstUnseenAt: Date;
}

export function turnStartAfter({ now, unseenCount, firstUnseenAt }: DebounceInput): Date {
  const window = Math.min(BASE_WAIT_MS + EXTRA_WAIT_PER_MESSAGE_MS * Math.max(unseenCount - 1, 0), WINDOW_CAP_MS);
  const deadline = firstUnseenAt.getTime() + MAX_WAIT_MS;
  return new Date(Math.max(now.getTime(), Math.min(now.getTime() + window, deadline)));
}
