import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { handleInboundMessage } from "@/lib/inbound/handle";
import { createPrismaClient } from "@/lib/prisma";
import { claimDueReminders } from "@/lib/reminders/dispatch";
import { listFailedReminders, listInterestedPatients } from "@/lib/services/reminders";
import { connectWhatsapp, createClinic, createPatient } from "../helpers/factories";
import { ctxFor, NOW } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const DAY = 86_400_000;
const PHONE = "+5511987654321";

describe("quote follow-ups end to end", () => {
  let clinic: string;
  let patientId: string;
  let quoteId: string;

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinic = await createClinic(prisma, "a");
    await connectWhatsapp(prisma, clinic);
    patientId = (await createPatient(prisma, clinic, { name: "Maria Souza", phoneE164: PHONE })).id;
    quoteId = (await prisma.quote.create({ data: { organizationId: clinic, patientId, description: "Implante dente 36", createdAt: new Date(NOW.getTime() - 2 * DAY) } })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const followUp = (kind: "QUOTE_FOLLOWUP_1" | "QUOTE_FOLLOWUP_2" = "QUOTE_FOLLOWUP_1", extra: Record<string, unknown> = {}) =>
    prisma.reminder.create({ data: { organizationId: clinic, quoteId, kind, dueAt: new Date(NOW.getTime() - 60_000), ...extra } });
  const receive = (text: string) => handleInboundMessage(prisma, { instance: "bumera-teste", organizationId: clinic, phoneE164: PHONE, text, messageId: "m1" }, NOW);

  it("hands a due follow-up to n8n with the quote in the message", async () => {
    await followUp();

    const [due] = await claimDueReminders(prisma, { now: NOW });

    expect(due).toMatchObject({ kind: "QUOTE_FOLLOWUP_1", attempt: 1, patient: { phone: PHONE }, appointment: null });
    expect(due?.message).toContain("*Implante dente 36*");
  });

  it("cancels the follow-up when the quote was closed meanwhile and skips opted-out patients", async () => {
    const closed = await followUp("QUOTE_FOLLOWUP_1");
    await prisma.quote.update({ where: { id: quoteId }, data: { status: "ACCEPTED" } });
    expect(await claimDueReminders(prisma, { now: NOW })).toEqual([]);
    expect((await prisma.reminder.findUniqueOrThrow({ where: { id: closed.id } })).status).toBe("CANCELLED");

    await prisma.quote.update({ where: { id: quoteId }, data: { status: "OPEN" } });
    const skipped = await followUp("QUOTE_FOLLOWUP_2");
    await prisma.patient.update({ where: { id: patientId }, data: { doNotContact: true } });
    expect(await claimDueReminders(prisma, { now: NOW })).toEqual([]);
    expect((await prisma.reminder.findUniqueOrThrow({ where: { id: skipped.id } })).status).toBe("SKIPPED");
  });

  describe("after the follow-up was delivered", () => {
    beforeEach(async () => {
      await followUp("QUOTE_FOLLOWUP_1", { status: "SENT", attempts: 1, sentAt: new Date(NOW.getTime() - 3_600_000) });
      await followUp("QUOTE_FOLLOWUP_2");
    });

    it("reply 1 records interest, answers the patient and lists them for the secretary", async () => {
      expect(await receive("1")).toMatchObject({ outcome: "INTERESTED", quoteId });

      const reply = await prisma.reminder.findFirstOrThrow({ where: { quoteId, kind: "REPLY_INTERESTED" } });
      expect(reply.status).toBe("PENDING");
      const list = await listInterestedPatients(ctxFor(prisma, clinic));
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ quoteDescription: "Implante dente 36", procedureName: null, patient: { name: "Maria Souza" } });
    });

    it("reply 2 declines the quote and stops the next follow-up", async () => {
      expect(await receive("2")).toMatchObject({ outcome: "DECLINED", quoteId });

      const quote = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
      expect(quote).toMatchObject({ status: "DECLINED", closedAt: NOW });
      expect((await prisma.reminder.findFirstOrThrow({ where: { quoteId, kind: "QUOTE_FOLLOWUP_2" } })).status).toBe("CANCELLED");
      expect(await prisma.reminder.count({ where: { quoteId, kind: "REPLY_DECLINED", status: "PENDING" } })).toBe(1);
    });

    it("SAIR skips the pending follow-ups and acknowledges the opt-out", async () => {
      expect(await receive("SAIR")).toMatchObject({ outcome: "OPTED_OUT" });

      expect((await prisma.reminder.findFirstOrThrow({ where: { quoteId, kind: "QUOTE_FOLLOWUP_2" } })).status).toBe("SKIPPED");
      expect(await prisma.reminder.count({ where: { quoteId, kind: "REPLY_OPTED_OUT" } })).toBe(1);
    });
  });

  it("lists a failed quote follow-up for the secretary", async () => {
    await followUp("QUOTE_FOLLOWUP_1", { status: "FAILED", note: "evolution_send_failed" });

    const failed = await listFailedReminders(ctxFor(prisma, clinic));

    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ kind: "QUOTE_FOLLOWUP_1", appointment: null, quote: { id: quoteId, description: "Implante dente 36" } });
  });
});
