import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PgBoss } from "pg-boss";
import type { ClinicMessage, InboundOutcome } from "@/lib/inbound/handle";
import { createPrismaClient } from "@/lib/prisma";
import { createBoss, QUEUE_SCHEMA } from "@/lib/queue/boss";
import { DISPATCH_JOB, TURN_JOB } from "@/lib/whatsapp/jobs";
import { runTurn, scheduleTurn } from "@/lib/whatsapp/turn";
import { createClinic } from "../helpers/factories";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const PHONE = "+5511987654321";
const OTHER = "+5511912345678";
const NOW = new Date("2026-10-25T12:00:00.000Z");

interface JobRow {
  singleton_key: string | null;
  start_after: Date;
  data: unknown;
  group_id: string | null;
}

async function jobs(name: string): Promise<JobRow[]> {
  return prisma.$queryRawUnsafe(`select singleton_key, start_after, data, group_id from ${QUEUE_SCHEMA}.job where name = $1 and state = 'created'`, name);
}

describe("WhatsApp turns on the worker", () => {
  let boss: PgBoss;
  let clinic: string;

  const message = (messageId: string, text: string, phoneE164 = PHONE): ClinicMessage => ({ organizationId: clinic, instance: "bumera-teste", phoneE164, messageId, text });

  beforeAll(async () => {
    boss = createBoss(process.env.DATABASE_URL as string);
    await boss.start();
  });

  afterAll(async () => {
    await boss.stop({ graceful: false });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    await prisma.$executeRawUnsafe(`delete from ${QUEUE_SCHEMA}.job where name like 'whatsapp.%'`).catch(() => 0);
    clinic = await createClinic(prisma, "a");
  });

  describe("scheduleTurn", () => {
    it("keeps the message and schedules one turn for the number, after the quiet window", async () => {
      await scheduleTurn(prisma, boss, message("m1", "oi"), NOW);

      expect(await prisma.inboundBuffer.count()).toBe(1);
      const [job] = await jobs(TURN_JOB.name);
      expect(job).toMatchObject({ singleton_key: `turn:${clinic}:${PHONE}`, group_id: `turn:${clinic}:${PHONE}`, data: { organizationId: clinic, phoneE164: PHONE } });
      expect(job.start_after.getTime() - Date.now()).toBeGreaterThan(4000);
    });

    it("pushes the same turn later while the person keeps writing", async () => {
      await scheduleTurn(prisma, boss, message("m1", "oi"), NOW);
      const first = (await jobs(TURN_JOB.name))[0].start_after.getTime();
      await scheduleTurn(prisma, boss, message("m2", "quero marcar"), NOW);

      const pending = await jobs(TURN_JOB.name);
      expect(pending).toHaveLength(1);
      expect(pending[0].start_after.getTime()).toBeGreaterThan(first);
    });

    it("keeps different numbers in different turns", async () => {
      await scheduleTurn(prisma, boss, message("m1", "oi"), NOW);
      await scheduleTurn(prisma, boss, message("m2", "oi", OTHER), NOW);

      expect(await jobs(TURN_JOB.name)).toHaveLength(2);
    });

    it("keeps a repeated delivery once", async () => {
      await scheduleTurn(prisma, boss, message("m1", "oi"), NOW);
      await scheduleTurn(prisma, boss, message("m1", "oi"), NOW);

      expect(await prisma.inboundBuffer.count()).toBe(1);
    });
  });

  describe("runTurn", () => {
    it("answers everything the number wrote at once, and asks for the replies to be sent", async () => {
      await scheduleTurn(prisma, boss, message("m1", "oi"), NOW);
      await scheduleTurn(prisma, boss, message("m2", "quero marcar"), new Date(NOW.getTime() + 1000));
      await scheduleTurn(prisma, boss, message("x1", "outro", OTHER), NOW);
      const handled: ClinicMessage[] = [];
      const handler = async (_prisma: unknown, received: ClinicMessage): Promise<InboundOutcome> => {
        handled.push(received);
        return { outcome: "CONVERSATION" };
      };

      await runTurn({ prisma, boss, handler }, { organizationId: clinic, phoneE164: PHONE }, new Date(NOW.getTime() + 9000));

      expect(handled).toEqual([expect.objectContaining({ text: "oi\nquero marcar", messageId: "m2" })]);
      expect(await prisma.inboundBuffer.findMany({ select: { phoneE164: true } })).toEqual([{ phoneE164: OTHER }]);
      expect(await jobs(DISPATCH_JOB.name)).toHaveLength(1);
    });

    it("does nothing when another turn already answered the number", async () => {
      const handler = vi.fn();

      await runTurn({ prisma, boss, handler }, { organizationId: clinic, phoneE164: PHONE }, NOW);

      expect(handler).not.toHaveBeenCalled();
    });

    it("puts the messages back when handling fails, so the retry answers them", async () => {
      await scheduleTurn(prisma, boss, message("m1", "oi"), NOW);
      const failing = async (): Promise<InboundOutcome> => {
        throw new Error("provider down");
      };

      await expect(runTurn({ prisma, boss, handler: failing }, { organizationId: clinic, phoneE164: PHONE }, NOW)).rejects.toThrow("provider down");
      expect(await prisma.inboundBuffer.count()).toBe(1);
    });
  });
});
