import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { isUrgent } from "@/lib/inbound/urgent";
import { handleInboundMessage } from "@/lib/inbound/handle";
import { createPrismaClient } from "@/lib/prisma";
import { claimDueReminders } from "@/lib/reminders/dispatch";
import { renderReminderMessage } from "@/lib/reminders/messages";
import { listInbox, markInboxHandled } from "@/lib/services/inbox";
import { exportPatientData } from "@/lib/services/patient-privacy";
import { anonymizePatient } from "@/lib/services/patients";
import { connectWhatsapp, createClinic, createPatient } from "../helpers/factories";
import { ctxFor, NOW } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const PHONE = "+5511987654321";

describe("urgent messages", () => {
  it.each(["Estou com muita dor", "dor de dente forte!", "meu rosto está inchado", "está sangrando muito", "tenho febre", "é uma urgência", "EMERGÊNCIA", "caí e quebrei o dente"])(
    "recognizes %j",
    (text) => expect(isUrgent(text)).toBe(true),
  );

  it.each(["oi, tudo bem?", "qual o endereço?", "quero remarcar para sexta", "obrigado pelo lembrete", "vocês aceitam cartão"])("does not flag %j", (text) =>
    expect(isUrgent(text)).toBe(false),
  );
});

describe("messages the keywords do not explain", () => {
  let clinicA: string;
  let clinicB: string;
  let patientId: string;
  const admin = (clinic: string) => ctxFor(prisma, clinic, "admin");
  const secretary = (clinic: string) => ctxFor(prisma, clinic, "secretary");

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinicA = await createClinic(prisma, "a");
    clinicB = await createClinic(prisma, "b");
    await connectWhatsapp(prisma, clinicA);
    await connectWhatsapp(prisma, clinicB);
    patientId = (await createPatient(prisma, clinicA, { name: "Maria Souza", phoneE164: PHONE })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const receive = (text: string, id = "m1", org = clinicA) =>
    handleInboundMessage(prisma, { instance: "x", organizationId: org, phoneE164: PHONE, text, messageId: id }, NOW);

  it("keeps the text for the secretary and acknowledges it to the patient", async () => {
    expect(await receive("Boa tarde, queria saber sobre clareamento")).toMatchObject({ outcome: "HANDOFF" });

    const message = await prisma.inboundMessage.findFirstOrThrow();
    expect(message).toMatchObject({ organizationId: clinicA, patientId, status: "OPEN", reason: "UNRECOGNIZED", text: "Boa tarde, queria saber sobre clareamento" });
    const reply = await prisma.reminder.findFirstOrThrow({ where: { inboundMessageId: message.id } });
    expect(reply).toMatchObject({ kind: "REPLY_HANDOFF", status: "PENDING", organizationId: clinicA, appointmentId: null, quoteId: null });
  });

  it("flags an urgent message", async () => {
    await receive("Estou com muita dor, pode me atender hoje?");
    expect((await prisma.inboundMessage.findFirstOrThrow()).reason).toBe("URGENT");
  });

  it("recognizes the same delivery repeated and does not answer twice", async () => {
    await receive("Oi", "dup");
    expect(await receive("Oi", "dup")).toEqual({ outcome: "IGNORED" });

    expect(await prisma.inboundMessage.count()).toBe(1);
    expect(await prisma.reminder.count({ where: { kind: "REPLY_HANDOFF" } })).toBe(1);
  });

  it("ignores a stranger's message: nothing is stored about people who are not patients", async () => {
    const result = await handleInboundMessage(prisma, { instance: "x", organizationId: clinicA, phoneE164: "+5511900000000", text: "Oi", messageId: "s1" }, NOW);

    expect(result).toEqual({ outcome: "UNKNOWN_PATIENT" });
    expect(await prisma.inboundMessage.count()).toBe(0);
  });

  it("does not answer a patient who opted out", async () => {
    await prisma.patient.update({ where: { id: patientId }, data: { doNotContact: true } });

    expect(await receive("Oi")).toEqual({ outcome: "IGNORED" });
    expect(await prisma.inboundMessage.count()).toBe(0);
  });

  it("hands the acknowledgement to n8n with a fixed, polite text", async () => {
    await receive("Oi, tudo bem?");

    const [due] = await claimDueReminders(prisma, { now: NOW });

    expect(due).toMatchObject({ kind: "REPLY_HANDOFF", appointment: null, quote: null, patient: { phone: PHONE } });
    expect(due?.message).toContain("*Clinic a*");
    expect(due?.message.split("\n\n")[0]).toBe("Olá, Maria!");
  });

  describe("the secretary's list", () => {
    it("shows open messages of this clinic, oldest first, with the patient", async () => {
      await receive("Primeira", "m1");
      await receive("Segunda", "m2");
      const other = await createPatient(prisma, clinicB, { phoneE164: PHONE });
      await receive("De outra clínica", "m3", clinicB);

      const list = await listInbox(secretary(clinicA));

      expect(list.map((item) => item.text)).toEqual(["Primeira", "Segunda"]);
      expect(list[0]).toMatchObject({ reason: "UNRECOGNIZED", patient: { id: patientId, name: "Maria Souza", phoneE164: PHONE } });
      expect((await listInbox(secretary(clinicB))).map((item) => item.patient.id)).toEqual([other.id]);
    });

    it("marks a message as answered and clears its text, leaving a trace in the activity log", async () => {
      await receive("Quero informações");
      const [item] = await listInbox(secretary(clinicA));

      await markInboxHandled(secretary(clinicA), (item as { id: string }).id);

      expect(await listInbox(secretary(clinicA))).toEqual([]);
      expect(await prisma.inboundMessage.findFirstOrThrow()).toMatchObject({ status: "HANDLED", text: null });
      expect(await prisma.auditLog.count({ where: { action: "INBOUND_MESSAGE_HANDLED", patientId } })).toBe(1);
    });

    it("refuses another clinic's message and a dentist", async () => {
      await receive("Quero informações");
      const [item] = await listInbox(secretary(clinicA));
      const id = (item as { id: string }).id;

      await expect(markInboxHandled(secretary(clinicB), id)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(markInboxHandled(ctxFor(prisma, clinicA, "dentist"), id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("privacy", () => {
    it("is part of the patient's export", async () => {
      await receive("Quero informações", "m1");
      const data = await exportPatientData(secretary(clinicA), patientId);
      expect(data.messagesReceived).toEqual([expect.objectContaining({ text: "Quero informações", status: "OPEN" })]);
    });

    it("is wiped when the patient's data is erased, and its answer stops", async () => {
      await receive("Quero informações", "m1");

      await anonymizePatient(admin(clinicA), patientId);

      expect(await prisma.inboundMessage.findFirstOrThrow()).toMatchObject({ text: null, status: "HANDLED" });
      expect(await prisma.reminder.count({ where: { kind: "REPLY_HANDOFF", status: { in: ["PENDING", "CLAIMED"] } } })).toBe(0);
    });
  });
});

describe("reply wording for free-text messages", () => {
  const base = { clinicName: "Odonto Company", patientName: "Maria Souza", startsAt: "2026-10-20T13:00:00.000Z", dentistName: "", procedureName: "" };

  it("acknowledges and says the team will answer", () => {
    const text = renderReminderMessage({ ...base, kind: "REPLY_HANDOFF" });
    expect(text).toContain("*Odonto Company*");
    expect(text).toMatch(/equipe/);
    expect(text).not.toContain("*1*");
  });

  it("sends the AI's text as written but cleaned of links and formatting", () => {
    const text = renderReminderMessage({ ...base, kind: "REPLY_AI", freeText: "Abrimos às 8h.\n\nVeja https://evil.example e *tudo* mais" });
    expect(text).toContain("Abrimos às 8h.");
    expect(text).not.toMatch(/evil|https?:/);
    expect(text).not.toMatch(/\*tudo\*/);
    expect(text.split("\n\n")[0]).toBe("Olá, Maria!");
  });

  it("falls back to the acknowledgement when an AI answer has no text", () => {
    expect(renderReminderMessage({ ...base, kind: "REPLY_AI", freeText: "  " })).toMatch(/equipe/);
  });
});
