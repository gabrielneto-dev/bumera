import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/evolution/[token]/route";
import { createPrismaClient } from "@/lib/prisma";
import { createClinic, createDentist, createPatient, createProcedure } from "../helpers/factories";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const TOKEN = "webhook-token-webhook-token-webhook-01";
const HOUR = 3_600_000;
const PHONE = "+5511987654321";

const payload = (instance: string, text: string) => ({
  event: "messages.upsert",
  instance,
  data: { key: { remoteJid: "5511987654321@s.whatsapp.net", fromMe: false, id: `MSG-${instance}-${text}` }, message: { conversation: text } },
});
const call = (body: unknown) =>
  POST(
    new Request(`http://localhost/api/webhooks/evolution/${TOKEN}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ token: TOKEN }) },
  );

describe("replies are tied to the clinic whose WhatsApp number received them", () => {
  let clinicA: string;
  let clinicB: string;
  let appointmentA: string;
  let appointmentB: string;
  let patientA: string;
  let patientB: string;

  beforeEach(async () => {
    vi.stubEnv("EVOLUTION_WEBHOOK_TOKEN", TOKEN);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinicA = await createClinic(prisma, "a");
    clinicB = await createClinic(prisma, "b");
    await prisma.clinicSettings.create({ data: { organizationId: clinicA, whatsappInstance: "clinica-a" } });
    await prisma.clinicSettings.create({ data: { organizationId: clinicB, whatsappInstance: "clinica-b" } });
    // The same person is a patient of both clinics, with the same phone number.
    const book = async (clinic: string, hoursAhead: number) => {
      const patient = await createPatient(prisma, clinic, { phoneE164: PHONE });
      const startsAt = new Date(Date.now() + hoursAhead * HOUR);
      const appointment = await prisma.appointment.create({
        data: {
          organizationId: clinic,
          patientId: patient.id,
          dentistId: (await createDentist(prisma, clinic)).id,
          procedureId: (await createProcedure(prisma, clinic)).id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 1_800_000),
        },
      });
      return { patient: patient.id, appointment: appointment.id };
    };
    // Clinic B's appointment is the soonest one: it must still not be touched by a message sent to clinic A.
    ({ patient: patientA, appointment: appointmentA } = await book(clinicA, 72));
    ({ patient: patientB, appointment: appointmentB } = await book(clinicB, 24));
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.$disconnect();
  });

  const status = async (id: string) => (await prisma.appointment.findUniqueOrThrow({ where: { id } })).status;

  it("confirms the appointment of the clinic that was written to, not the soonest one overall", async () => {
    const response = await call(payload("clinica-a", "1"));

    expect(await response.json()).toMatchObject({ data: { outcome: "CONFIRMED", appointmentId: appointmentA } });
    expect(await status(appointmentA)).toBe("CONFIRMED");
    expect(await status(appointmentB)).toBe("SCHEDULED");
  });

  it("opts the patient out of that clinic only", async () => {
    await call(payload("clinica-b", "SAIR"));

    expect((await prisma.patient.findUniqueOrThrow({ where: { id: patientB } })).doNotContact).toBe(true);
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: patientA } })).doNotContact).toBe(false);
  });

  it("queues the automatic answer in the clinic that was written to", async () => {
    await call(payload("clinica-a", "1"));

    const reply = await prisma.reminder.findFirstOrThrow({ where: { kind: "REPLY_CONFIRMED" } });
    expect(reply.organizationId).toBe(clinicA);
  });

  it("ignores a message that arrived through an instance no clinic owns", async () => {
    const response = await call(payload("desconhecida", "1"));

    expect(await response.json()).toMatchObject({ success: true, data: { outcome: "UNKNOWN_INSTANCE" } });
    expect(await status(appointmentA)).toBe("SCHEDULED");
    expect(await status(appointmentB)).toBe("SCHEDULED");
  });

  it("ignores a payload that does not say which instance it came from", async () => {
    const body = payload("clinica-a", "1") as Record<string, unknown>;
    delete body.instance;

    expect(await (await call(body)).json()).toMatchObject({ data: { outcome: "IGNORED" } });
    expect(await status(appointmentA)).toBe("SCHEDULED");
  });
});
