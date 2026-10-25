import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { handleInboundMessage } from "@/lib/inbound/handle";
import { createPrismaClient } from "@/lib/prisma";
import { claimDueReminders } from "@/lib/reminders/dispatch";
import { connectWhatsapp, createClinic, createPatient, createProcedure } from "../helpers/factories";
import { NOW } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const PHONE = "+5511987654321";
const UNKNOWN = "+5511912345678";

describe("audio and media without text", () => {
  let clinic: string;

  const media = (messageId: string, phoneE164 = PHONE, mediaKind: "audio" | "image" = "audio") =>
    handleInboundMessage(prisma, { organizationId: clinic, instance: "bumera-teste", phoneE164, messageId, text: "", mediaKind }, NOW, { ai: null });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinic = await createClinic(prisma, "a");
    await connectWhatsapp(prisma, clinic);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("asks a patient who sent an audio to write, and leaves it for the secretary", async () => {
    const patient = await createPatient(prisma, clinic, { name: "Maria Souza", phoneE164: PHONE });

    expect(await media("A1")).toEqual({ outcome: "MEDIA_RECEIVED" });

    const inbox = await prisma.inboundMessage.findMany({ where: { organizationId: clinic } });
    expect(inbox).toEqual([expect.objectContaining({ patientId: patient.id, reason: "UNRECOGNIZED", status: "OPEN", text: "[Áudio]" })]);
    const due = await claimDueReminders(prisma, { now: NOW });
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ kind: "REPLY_MEDIA", patient: { phone: PHONE } });
    expect(due[0].message).toMatch(/escrever/);
  });

  it("answers a first contact too, sending the reply to the number that wrote", async () => {
    expect(await media("A2", UNKNOWN, "image")).toEqual({ outcome: "MEDIA_RECEIVED" });

    const inbox = await prisma.inboundMessage.findFirstOrThrow({ where: { organizationId: clinic } });
    expect(inbox).toMatchObject({ patientId: null, phoneE164: UNKNOWN, text: "[Imagem]" });
    const due = await claimDueReminders(prisma, { now: NOW });
    expect(due[0]).toMatchObject({ kind: "REPLY_MEDIA", patient: { phone: UNKNOWN } });
  });

  it("answers the same delivery only once", async () => {
    await createPatient(prisma, clinic, { phoneE164: PHONE });
    await media("A3");
    expect(await media("A3")).toEqual({ outcome: "IGNORED" });

    expect(await prisma.reminder.count({ where: { kind: "REPLY_MEDIA" } })).toBe(1);
  });

  it("stays silent for a patient who opted out", async () => {
    await createPatient(prisma, clinic, { phoneE164: PHONE, doNotContact: true });

    expect(await media("A4")).toEqual({ outcome: "IGNORED" });
    expect(await prisma.reminder.count()).toBe(0);
  });

  it("does not move an open booking conversation", async () => {
    await createProcedure(prisma, clinic, "Limpeza");
    await createProcedure(prisma, clinic, "Clareamento");
    await handleInboundMessage(prisma, { organizationId: clinic, instance: "bumera-teste", phoneE164: UNKNOWN, messageId: "T1", text: "quero marcar uma consulta" }, NOW, { ai: null });
    const before = await prisma.conversation.findFirstOrThrow({ where: { organizationId: clinic } });

    await media("A5", UNKNOWN);

    const after = await prisma.conversation.findFirstOrThrow({ where: { id: before.id } });
    expect(after).toMatchObject({ status: "OPEN", step: before.step, misses: 0 });
  });
});
