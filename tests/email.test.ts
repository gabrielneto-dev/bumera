import { describe, expect, it } from "vitest";
import { captureEmails, onScreenTransport } from "@/lib/email";

describe("on-screen e-mail transport", () => {
  it("captures messages sent while a capture is active, even from nested async code", async () => {
    const { result, messages } = await captureEmails(async () => {
      await Promise.resolve();
      await onScreenTransport.send({ to: "a@example.com", kind: "verification-code", code: "123456" });
      await new Promise((resolve) => setTimeout(resolve, 5));
      await onScreenTransport.send({ to: "b@example.com", kind: "invitation", link: "https://x/convite/1" });
      return "done";
    });
    expect(result).toBe("done");
    expect(messages).toEqual([
      { to: "a@example.com", kind: "verification-code", code: "123456" },
      { to: "b@example.com", kind: "invitation", link: "https://x/convite/1" },
    ]);
  });

  it("keeps parallel captures isolated from each other", async () => {
    const run = (code: string, delay: number) =>
      captureEmails(async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        await onScreenTransport.send({ to: `${code}@example.com`, kind: "verification-code", code });
      });
    const [first, second] = await Promise.all([run("111111", 15), run("222222", 1)]);
    expect(first.messages.map((m) => m.code)).toEqual(["111111"]);
    expect(second.messages.map((m) => m.code)).toEqual(["222222"]);
  });

  it("refuses to send outside a capture, so nobody can read codes through public endpoints", async () => {
    await expect(
      onScreenTransport.send({ to: "a@example.com", kind: "verification-code", code: "123456" }),
    ).rejects.toThrow(/not configured/);
  });

  it("propagates errors and does not leak the capture to later code", async () => {
    await expect(captureEmails(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    await expect(onScreenTransport.send({ to: "a@example.com", kind: "invitation", link: "x" })).rejects.toThrow();
  });
});
