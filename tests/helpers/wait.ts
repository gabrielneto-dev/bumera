const POLL_MS = 50;
const DEFAULT_TIMEOUT_MS = 8000;

/** Polls a condition until it holds; fails with a clear message instead of hanging the test. */
export async function waitFor(condition: () => boolean, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`condition not met within ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}
