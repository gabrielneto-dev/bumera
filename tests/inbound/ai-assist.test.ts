import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiClient, AiDecision, AiInput } from "@/lib/ai/types";
import { handleInboundMessage } from "@/lib/inbound/handle";
import { createPrismaClient } from "@/lib/prisma";
import { claimDueReminders } from "@/lib/reminders/dispatch";
import { connectWhatsapp, createClinic, createDentist, createPatient, createProcedure } from "../helpers/factories";
import { NOW } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const HOUR = 3_600_000;
const PHONE = "+5511987654321";
const INFO = "Rua das Flores, 100. Abrimos de segunda a sexta, das 8h às 18h. Aceitamos cartão e Pix.";

function fakeAi(decision: AiDecision | Error): AiClient & { calls: AiInput[] } {
  const calls: AiInput[] = [];
  return {
    calls,
    interpret: vi.fn(async (input: AiInput) => {
      calls.push(input);
      if (decision instanceof Error) throw decision;
      return decision;
    }),
  };
}

describe("AI assistant on free-text messages", () => {
  let clinic: string;
  let patientId: string;
  let appointmentId: string;

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinic = await createClinic(prisma, "a");
    await connectWhatsapp(prisma, clinic);
    await prisma.clinicSettings.update({ where: { organizationId: clinic }, data: { aiEnabled: true, aiEnabledAt: NOW, clinicInfo: INFO } });
    patientId = (await createPatient(prisma, clinic, { name: "Maria da Silva", phoneE164: PHONE })).id;
    const startsAt = new Date(NOW.getTime() + 24 * HOUR);
    appointmentId = (
      await prisma.appointment.create({
        data: {
          organizationId: clinic,
          patientId,
          dentistId: (await createDentist(prisma, clinic)).id,
          procedureId: (await createProcedure(prisma, clinic)).id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 1_800_000),
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const receive = (text: string, ai: AiClient | null, id = "m1") =>
    handleInboundMessage(prisma, { instance: "x", organizationId: clinic, phoneE164: PHONE, text, messageId: id }, NOW, { ai });
  const inbound = () => prisma.inboundMessage.findFirstOrThrow();
  const appointment = () => prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });

  it("does not look at anything unless the clinic opted in", async () => {
    await prisma.clinicSettings.update({ where: { organizationId: clinic }, data: { aiEnabled: false } });
    const ai = fakeAi({ intent: "YES", confidence: 0.99, answer: null });

    expect(await receive("pode ser, confirmo", ai)).toMatchObject({ outcome: "HANDOFF" });

    expect(ai.calls).toHaveLength(0);
    expect(await inbound()).toMatchObject({ status: "OPEN", reason: "UNRECOGNIZED" });
  });

  it("does not look at anything when the server has no AI configured", async () => {
    expect(await receive("pode ser, confirmo", null)).toMatchObject({ outcome: "HANDOFF" });
    expect((await inbound()).reason).toBe("UNRECOGNIZED");
  });

  describe("a patient answers in their own words", () => {
    it("treats a clear yes like reply 1 and keeps no text", async () => {
      const ai = fakeAi({ intent: "YES", confidence: 0.95, answer: null });

      expect(await receive("pode ser, confirmo sim!", ai)).toMatchObject({ outcome: "CONFIRMED", appointmentId });

      expect((await appointment()).status).toBe("CONFIRMED");
      expect(await inbound()).toMatchObject({ status: "HANDLED", reason: "AI_ANSWERED", aiIntent: "YES", text: null });
      expect(await prisma.reminder.count({ where: { kind: "REPLY_CONFIRMED" } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { action: "PATIENT_MESSAGE_ANSWERED_BY_AI", patientId } })).toBe(1);
    });

    it("treats a clear no like reply 2", async () => {
      const ai = fakeAi({ intent: "NO", confidence: 0.9, answer: null });
      expect(await receive("não vou poder ir, preciso remarcar", ai)).toMatchObject({ outcome: "RESCHEDULE_REQUESTED", appointmentId });
      expect((await appointment()).rescheduleRequestedAt).not.toBeNull();
    });

    it("opts out only when very sure", async () => {
      expect(await receive("não quero mais receber mensagens", fakeAi({ intent: "STOP", confidence: 0.95, answer: null }))).toMatchObject({ outcome: "OPTED_OUT" });
      expect((await prisma.patient.findUniqueOrThrow({ where: { id: patientId } })).doNotContact).toBe(true);
    });

    it("hands over a stop request that is not certain enough, instead of silencing the patient by mistake", async () => {
      expect(await receive("acho que não preciso mais", fakeAi({ intent: "STOP", confidence: 0.85, answer: null }), "m2")).toMatchObject({ outcome: "HANDOFF" });
      expect((await prisma.patient.findUniqueOrThrow({ where: { id: patientId } })).doNotContact).toBe(false);
      expect((await inbound()).reason).toBe("AI_UNSURE");
    });

    it("does not act on a hesitant understanding", async () => {
      expect(await receive("hmm talvez", fakeAi({ intent: "YES", confidence: 0.5, answer: null }))).toMatchObject({ outcome: "HANDOFF" });
      expect((await appointment()).status).toBe("SCHEDULED");
      expect(await inbound()).toMatchObject({ status: "OPEN", reason: "AI_UNSURE", text: "hmm talvez" });
    });

    it("hands over a yes when there is nothing to confirm", async () => {
      await prisma.appointment.update({ where: { id: appointmentId }, data: { status: "CANCELLED" } });
      expect(await receive("sim, confirmo", fakeAi({ intent: "YES", confidence: 0.99, answer: null }))).toMatchObject({ outcome: "HANDOFF" });
      expect(await inbound()).toMatchObject({ status: "OPEN", reason: "AI_UNSURE" });
    });
  });

  describe("a patient asks something", () => {
    const question = { intent: "QUESTION", confidence: 0.92, answer: "Abrimos de segunda a sexta, das 8h às 18h." } as const;

    it("answers from the clinic's information and hands the text to n8n", async () => {
      expect(await receive("que horas vocês abrem?", fakeAi(question))).toMatchObject({ outcome: "ANSWERED_BY_AI" });

      expect(await inbound()).toMatchObject({ status: "HANDLED", reason: "AI_ANSWERED", aiIntent: "QUESTION", text: null });
      const [due] = await claimDueReminders(prisma, { now: NOW });
      expect(due).toMatchObject({ kind: "REPLY_AI", patient: { phone: PHONE } });
      expect(due?.message).toContain("Abrimos de segunda a sexta, das 8h às 18h.");
      expect(due?.message.split("\n\n")[0]).toBe("Olá, Maria!");
      expect(await prisma.auditLog.count({ where: { action: "PATIENT_MESSAGE_ANSWERED_BY_AI" } })).toBe(1);
    });

    it("sends the AI only the masked message and the clinic's information", async () => {
      const ai = fakeAi(question);
      await receive("Oi, sou a Maria da Silva, meu CPF é 529.982.247-25 e ligo de (11) 98765-4321. Que horas abrem?", ai);

      const sent = JSON.stringify(ai.calls[0]);
      expect(sent).toContain("Que horas abrem?");
      expect(sent).toContain(INFO);
      for (const secret of ["Maria", "Silva", "529.982", "98765", "4321"]) expect(sent).not.toContain(secret);
      expect(ai.calls[0]).toMatchObject({ clinicName: "Clinic a", context: "appointment" });
    });

    it("cleans links out of the answer before storing it", async () => {
      await receive("onde fica?", fakeAi({ intent: "QUESTION", confidence: 0.9, answer: "Fica na Rua das Flores, 100. Mapa: https://evil.example/x" }));
      const reply = await prisma.reminder.findFirstOrThrow({ where: { kind: "REPLY_AI" } });
      expect(reply.text).toBe("Fica na Rua das Flores, 100. Mapa:");
    });

    it.each([
      ["unsure", { intent: "QUESTION", confidence: 0.6, answer: "Talvez às 8h." }],
      ["without an answer", { intent: "QUESTION", confidence: 0.95, answer: null }],
      ["with an empty answer", { intent: "QUESTION", confidence: 0.95, answer: "   " }],
    ] as const)("hands the question over when the AI is %s", async (_name, decision) => {
      expect(await receive("qual o preço do clareamento?", fakeAi({ ...decision }))).toMatchObject({ outcome: "HANDOFF" });
      expect(await inbound()).toMatchObject({ status: "OPEN", reason: "AI_UNSURE" });
      expect(await prisma.reminder.count({ where: { kind: "REPLY_AI" } })).toBe(0);
    });

    it("hands over anything else", async () => {
      expect(await receive("minha mãe também quer uma avaliação", fakeAi({ intent: "OTHER", confidence: 0.99, answer: "Claro!" }))).toMatchObject({ outcome: "HANDOFF" });
      expect(await prisma.reminder.count({ where: { kind: "REPLY_AI" } })).toBe(0);
    });
  });

  describe("safety", () => {
    it("never lets the AI near an urgent message", async () => {
      const ai = fakeAi({ intent: "QUESTION", confidence: 0.99, answer: "Tome um analgésico." });

      expect(await receive("estou com muita dor, o rosto inchou", ai)).toMatchObject({ outcome: "HANDOFF" });

      expect(ai.calls).toHaveLength(0);
      expect((await inbound()).reason).toBe("URGENT");
    });

    it("keeps the message for the secretary when the AI fails", async () => {
      expect(await receive("bom dia", fakeAi(new Error("provider down")))).toMatchObject({ outcome: "HANDOFF" });
      expect(await inbound()).toMatchObject({ status: "OPEN", reason: "AI_UNAVAILABLE", text: "bom dia" });
      expect(await prisma.reminder.count({ where: { kind: "REPLY_HANDOFF" } })).toBe(1);
    });

    it("stops calling the AI once the clinic reached its daily limit", async () => {
      const other = await createPatient(prisma, clinic, { name: "Outro", phoneE164: "+5511900000009" });
      await prisma.inboundMessage.createMany({
        data: Array.from({ length: 100 }, (_, index) => ({ organizationId: clinic, patientId: other.id, messageId: `old-${index}`, text: null, reason: "AI_ANSWERED" as const, aiIntent: "OTHER", status: "HANDLED" as const, createdAt: new Date(NOW.getTime() - HOUR) })),
      });
      const ai = fakeAi({ intent: "YES", confidence: 0.99, answer: null });

      expect(await receive("confirmo", ai, "new")).toMatchObject({ outcome: "HANDOFF" });
      expect(ai.calls).toHaveLength(0);
    });

    it("asks the AI once for a message delivered twice", async () => {
      const ai = fakeAi({ intent: "OTHER", confidence: 0.9, answer: null });
      await receive("bom dia", ai, "dup");
      expect(await receive("bom dia", ai, "dup")).toEqual({ outcome: "IGNORED" });
      expect(ai.calls).toHaveLength(1);
    });

    it("tells the AI what the patient was just asked", async () => {
      await prisma.appointment.update({ where: { id: appointmentId }, data: { status: "COMPLETED", startsAt: new Date(NOW.getTime() - 100 * 24 * HOUR), endsAt: new Date(NOW.getTime() - 100 * 24 * HOUR + 1_800_000) } });
      await prisma.reminder.create({ data: { organizationId: clinic, appointmentId, kind: "REACTIVATION", status: "SENT", attempts: 1, dueAt: NOW, sentAt: new Date(NOW.getTime() - HOUR) } });
      const ai = fakeAi({ intent: "OTHER", confidence: 0.9, answer: null });

      await receive("vou pensar", ai);

      expect(ai.calls[0]?.context).toBe("campaign");
    });
  });
});
