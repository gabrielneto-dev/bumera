import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/prisma";
import { clearConversation } from "@/lib/services/conversations";
import { createClinic, createPatient } from "../helpers/factories";
import { ctxFor, NOW } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const PHONE = "+5511988887777";

describe("clearConversation", () => {
  let clinic: string;
  let other: string;
  let patientId: string;

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinic = await createClinic(prisma, "a");
    other = await createClinic(prisma, "b");
    patientId = (await createPatient(prisma, clinic, { name: "Maria", phoneE164: PHONE })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const open = (organizationId: string, phone = PHONE) =>
    prisma.conversation.create({ data: { organizationId, phoneE164: phone, name: "Maria Souza", slotOptions: { items: [], hasMore: false }, expiresAt: new Date(NOW.getTime() + 3_600_000) } });
  const message = (organizationId: string, id: string, extra: { patientId?: string; phoneE164?: string } = {}) =>
    prisma.inboundMessage.create({ data: { organizationId, messageId: id, text: "oi", reason: "UNRECOGNIZED", ...extra } });

  it("ends the dialog, cancels its unsent replies and clears the number's unread messages", async () => {
    const conversation = await open(clinic);
    const reply = await prisma.reminder.create({ data: { organizationId: clinic, conversationId: conversation.id, replyToMessageId: "m1", kind: "REPLY_FLOW", dueAt: NOW, text: "Qual horário?" } });
    await message(clinic, "u1", { patientId });
    await message(clinic, "u2", { phoneE164: PHONE });
    await message(clinic, "elsewhere", { phoneE164: "+5511900000009" });

    const result = await clearConversation(ctxFor(prisma, clinic, "admin"), { patientId });

    expect(result).toEqual({ conversations: 1, messages: 2 });
    expect(await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).toMatchObject({ status: "EXPIRED", name: null, slotOptions: null });
    expect((await prisma.reminder.findUniqueOrThrow({ where: { id: reply.id } })).status).toBe("CANCELLED");
    expect(await prisma.inboundMessage.findMany({ where: { status: "OPEN" } })).toHaveLength(1);
    expect((await prisma.inboundMessage.findFirstOrThrow({ where: { messageId: "u1" } })).text).toBeNull();
    expect(await prisma.patient.count({ where: { id: patientId } })).toBe(1);
    expect(await prisma.auditLog.findFirstOrThrow({ where: { action: "CONVERSATION_CLEARED" } })).toMatchObject({ patientId, details: { conversations: 1, messages: 2 } });
  });

  it("works from an unread message of a first contact, and leaves other clinics alone", async () => {
    const stranger = "+5511911110000";
    await open(clinic, stranger);
    const row = await message(clinic, "s1", { phoneE164: stranger });
    const foreign = await open(other, stranger);

    expect(await clearConversation(ctxFor(prisma, clinic, "secretary"), { inboundMessageId: row.id })).toEqual({ conversations: 1, messages: 1 });
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: foreign.id } })).status).toBe("OPEN");
  });

  it("is harmless when there is nothing to clear, and refuses unknown targets", async () => {
    expect(await clearConversation(ctxFor(prisma, clinic, "admin"), { patientId })).toEqual({ conversations: 0, messages: 0 });
    await expect(clearConversation(ctxFor(prisma, clinic, "admin"), { patientId: "nope" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(clearConversation(ctxFor(prisma, clinic, "admin"), { inboundMessageId: "nope" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
