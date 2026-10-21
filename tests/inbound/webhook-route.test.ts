import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/evolution/[token]/route";
import { createPrismaClient } from "@/lib/prisma";
import { createClinic, createDentist, createPatient, createProcedure } from "../helpers/factories";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const TOKEN = "webhook-token-webhook-token-webhook-01";
const HOUR = 3_600_000;

const payload = (text: string, extra: Record<string, unknown> = {}) => ({
  event: "messages.upsert",
  instance: "bumera-teste",
  data: { key: { remoteJid: "5511987654321@s.whatsapp.net", fromMe: false, id: "MSG1" }, message: { conversation: text }, ...extra },
});
const call = (body: unknown, token = TOKEN) =>
  POST(
    new Request(`http://localhost/api/webhooks/evolution/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ token }) },
  );

describe("POST /api/webhooks/evolution/[token]", () => {
  let appointmentId: string;

  beforeEach(async () => {
    vi.stubEnv("EVOLUTION_WEBHOOK_TOKEN", TOKEN);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    const clinic = await createClinic(prisma, "a");
    const dentist = await createDentist(prisma, clinic);
    const procedure = await createProcedure(prisma, clinic);
    const patient = await createPatient(prisma, clinic, { phoneE164: "+5511987654321" });
    const startsAt = new Date(Date.now() + 48 * HOUR);
    appointmentId = (
      await prisma.appointment.create({
        data: { organizationId: clinic, patientId: patient.id, dentistId: dentist.id, procedureId: procedure.id, startsAt, endsAt: new Date(startsAt.getTime() + 1_800_000) },
      })
    ).id;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.$disconnect();
  });

  it("rejects a wrong token without touching anything", async () => {
    const response = await call(payload("1"), "x".repeat(40));
    expect(response.status).toBe(401);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } })).status).toBe("SCHEDULED");
  });

  it("answers 503 when the token is not configured", async () => {
    vi.stubEnv("EVOLUTION_WEBHOOK_TOKEN", "");
    expect((await call(payload("1"))).status).toBe(503);
  });

  it("confirms the appointment on reply 1", async () => {
    const response = await call(payload("1"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { outcome: "CONFIRMED", appointmentId } });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } })).status).toBe("CONFIRMED");
  });

  it("acknowledges events it ignores so Evolution does not retry them", async () => {
    const response = await call({ event: "connection.update", data: {} });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { outcome: "IGNORED" } });
  });

  it("rejects a body that is not JSON and one that is too large", async () => {
    expect((await call("not json")).status).toBe(400);
    expect((await call(JSON.stringify({ pad: "a".repeat(70_000) }))).status).toBe(413);
  });
});
