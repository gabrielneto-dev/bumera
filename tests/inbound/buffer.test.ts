import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { bufferMessage, bufferQuietMs, flushBuffered, joinBurst } from "@/lib/inbound/buffer";
import type { ClinicMessage, InboundOutcome } from "@/lib/inbound/handle";
import { createPrismaClient } from "@/lib/prisma";
import { createClinic } from "../helpers/factories";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const QUIET = 8_000;
const T0 = new Date("2026-10-25T20:00:00.000Z");
const at = (seconds: number): Date => new Date(T0.getTime() + seconds * 1000);
const PHONE = "+5511911112222";

describe("inbound buffer", () => {
  let clinic: string;
  const message = (text: string, id: string, phone = PHONE): ClinicMessage => ({ instance: "x", organizationId: clinic, phoneE164: phone, text, messageId: id });
  const answered: ClinicMessage[] = [];
  const handler = vi.fn(async (_prisma: unknown, received: ClinicMessage): Promise<InboundOutcome> => {
    answered.push(received);
    return { outcome: "CONVERSATION" };
  });

  beforeEach(async () => {
    answered.length = 0;
    handler.mockClear();
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinic = await createClinic(prisma, "a");
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.$disconnect();
  });

  it("answers once, with the messages joined, after the number has been quiet", async () => {
    await bufferMessage(prisma, message("Oi", "m1"), at(0));
    await bufferMessage(prisma, message("queria marcar", "m2"), at(3));
    await bufferMessage(prisma, message("uma limpeza", "m3"), at(5));

    expect(await flushBuffered(prisma, at(10), QUIET, handler)).toBe(0);
    expect(await flushBuffered(prisma, at(14), QUIET, handler)).toBe(1);

    expect(answered).toEqual([message("Oi\nqueria marcar\numa limpeza", "m3")]);
    expect(await prisma.inboundBuffer.count()).toBe(0);
  });

  it("waits while the person is still writing, even if the first messages are old", async () => {
    await bufferMessage(prisma, message("Oi", "m1"), at(0));
    await bufferMessage(prisma, message("e aí", "m2"), at(9));

    expect(await flushBuffered(prisma, at(10), QUIET, handler)).toBe(0);
    expect(handler).not.toHaveBeenCalled();
    expect(await prisma.inboundBuffer.count()).toBe(2);
  });

  it("keeps each number apart", async () => {
    await bufferMessage(prisma, message("um", "a1", "+5511900000001"), at(0));
    await bufferMessage(prisma, message("dois", "b1", "+5511900000002"), at(1));

    expect(await flushBuffered(prisma, at(20), QUIET, handler)).toBe(2);
    expect(answered.map((item) => item.text).sort()).toEqual(["dois", "um"]);
  });

  it("keeps a repeated delivery once", async () => {
    await bufferMessage(prisma, message("1", "dup"), at(0));
    await bufferMessage(prisma, message("1", "dup"), at(1));

    expect(await prisma.inboundBuffer.count()).toBe(1);
    await flushBuffered(prisma, at(20), QUIET, handler);
    expect(answered).toEqual([message("1", "dup")]);
  });

  it("lets only one of two simultaneous flushes answer", async () => {
    await bufferMessage(prisma, message("oi", "m1"), at(0));

    const results = await Promise.all([flushBuffered(prisma, at(20), QUIET, handler), flushBuffered(prisma, at(20), QUIET, handler)]);

    expect(results.reduce((sum, count) => sum + count, 0)).toBe(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("puts the messages back when answering fails, and gives up when they are old", async () => {
    const failing = vi.fn(async () => {
      throw new Error("boom");
    });
    await bufferMessage(prisma, message("oi", "m1"), at(0));

    await expect(flushBuffered(prisma, at(20), QUIET, failing)).rejects.toThrow("boom");
    expect(await prisma.inboundBuffer.count()).toBe(1);

    await expect(flushBuffered(prisma, at(20 * 60), QUIET, failing)).rejects.toThrow("boom");
    expect(await prisma.inboundBuffer.count()).toBe(0);
  });

  describe("bufferQuietMs", () => {
    it("is off by default and bounded", () => {
      vi.stubEnv("INBOUND_BUFFER_MS", "");
      expect(bufferQuietMs()).toBe(0);
      vi.stubEnv("INBOUND_BUFFER_MS", "8000");
      expect(bufferQuietMs()).toBe(8000);
      vi.stubEnv("INBOUND_BUFFER_MS", "999999");
      expect(bufferQuietMs()).toBe(60_000);
      vi.stubEnv("INBOUND_BUFFER_MS", "-5");
      expect(bufferQuietMs()).toBe(0);
      vi.stubEnv("INBOUND_BUFFER_MS", "abc");
      expect(bufferQuietMs()).toBe(0);
    });
  });
});

describe("joinBurst", () => {
  const row = (messageId: string, text: string, mediaKind: string | null = null) => ({ instance: "bumera-teste", messageId, text, mediaKind });

  it("joins the written texts and keeps the last message id", () => {
    expect(joinBurst("org", "+5511987654321", [row("1", "oi"), row("2", "", "audio"), row("3", "quero marcar")])).toEqual({
      organizationId: "org",
      phoneE164: "+5511987654321",
      instance: "bumera-teste",
      messageId: "3",
      text: "oi\nquero marcar",
    });
  });

  it("answers a burst of media only as media", () => {
    expect(joinBurst("org", "+5511987654321", [row("1", "", "image"), row("2", "", "audio")])).toMatchObject({ text: "", mediaKind: "audio", messageId: "2" });
  });

  it("refuses an empty burst", () => {
    expect(() => joinBurst("org", "+5511987654321", [])).toThrow();
  });
});
