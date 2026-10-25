import { describe, expect, it } from "vitest";
import { humanDelayMs, sendDelayMs } from "@/lib/whatsapp/pacing";

const now = new Date("2026-10-25T12:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const noJitter = () => 0;

describe("humanDelayMs", () => {
  it("grows with the length of the text, between a floor and a ceiling", () => {
    expect(humanDelayMs(0)).toBe(1500);
    expect(humanDelayMs(100)).toBe(3500);
    expect(humanDelayMs(5000)).toBe(6000);
  });
});

describe("sendDelayMs", () => {
  it("sends a reminder at once on an idle number", () => {
    expect(sendDelayMs({ now, lastSentAt: null, reply: null, random: noJitter })).toBe(0);
  });

  it("keeps a minimum gap, plus jitter, after the number's last message", () => {
    expect(sendDelayMs({ now, lastSentAt: ago(1000), reply: null, random: noJitter })).toBe(2000);
    expect(sendDelayMs({ now, lastSentAt: ago(1000), reply: null, random: () => 0.5 })).toBe(3000);
    expect(sendDelayMs({ now, lastSentAt: ago(60_000), reply: null, random: noJitter })).toBe(0);
  });

  it("lets a reply look typed: the time already spent since it was written counts", () => {
    const reply = { createdAt: ago(1000), textLength: 100 };
    expect(sendDelayMs({ now, lastSentAt: null, reply, random: noJitter })).toBe(2500);
    expect(sendDelayMs({ now, lastSentAt: null, reply: { createdAt: ago(10_000), textLength: 100 }, random: noJitter })).toBe(0);
  });

  it("waits for whichever is later, the gap or the typing time", () => {
    const reply = { createdAt: now, textLength: 0 };
    expect(sendDelayMs({ now, lastSentAt: ago(500), reply, random: noJitter })).toBe(2500);
  });
});
