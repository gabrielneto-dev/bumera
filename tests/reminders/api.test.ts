import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getDue } from "@/app/api/v1/reminders/due/route";
import { POST as postResult } from "@/app/api/v1/reminders/[id]/result/route";
import { createPrismaClient } from "@/lib/prisma";
import { createClinic, createDentist, createPatient, createProcedure } from "../helpers/factories";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const KEY = "service-key-service-key-service-key-0001";
const HOUR = 3_600_000;

const auth = { authorization: `Bearer ${KEY}` };
const dueRequest = (query = "", headers: Record<string, string> = auth) =>
  new Request(`http://localhost/api/v1/reminders/due${query}`, { headers });
const resultRequest = (id: string, body: unknown, headers: Record<string, string> = auth) =>
  new Request(`http://localhost/api/v1/reminders/${id}/result`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const ctxFor = (id: string) => ({ params: Promise.resolve({ id }) });

describe("reminders API (service key)", () => {
  let reminderId: string;

  beforeEach(async () => {
    vi.stubEnv("SERVICE_API_KEY", KEY);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    const clinic = await createClinic(prisma, "a");
    const dentist = await createDentist(prisma, clinic, "Dra. Ana");
    const procedure = await createProcedure(prisma, clinic);
    const patient = await createPatient(prisma, clinic, { name: "Maria Souza" });
    const startsAt = new Date(Date.now() + 48 * HOUR);
    const appointment = await prisma.appointment.create({
      data: { organizationId: clinic, patientId: patient.id, dentistId: dentist.id, procedureId: procedure.id, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000) },
    });
    const reminder = await prisma.reminder.create({
      data: { organizationId: clinic, appointmentId: appointment.id, kind: "CONFIRMATION", dueAt: new Date(Date.now() - 60_000) },
    });
    reminderId = reminder.id;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.$disconnect();
  });

  describe("GET /api/v1/reminders/due", () => {
    it("requires the service key", async () => {
      const response = await getDue(dueRequest("", {}));
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ success: false, data: null, error: { code: "UNAUTHORIZED" } });
      expect(await prisma.reminder.count({ where: { status: "CLAIMED" } })).toBe(0);
    });

    it("rejects a wrong key", async () => {
      const response = await getDue(dueRequest("", { authorization: "Bearer nope" }));
      expect(response.status).toBe(401);
    });

    it("answers 503 when the service key is not configured", async () => {
      vi.stubEnv("SERVICE_API_KEY", "");
      const response = await getDue(dueRequest());
      expect(response.status).toBe(503);
    });

    it("returns due reminders in the standard envelope and claims them", async () => {
      const response = await getDue(dueRequest());
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({ success: true, error: null, meta: { count: 1 } });
      expect(body.data[0]).toMatchObject({ id: reminderId, kind: "CONFIRMATION", attempt: 1, patient: { firstName: "Maria" } });
      expect(typeof body.data[0].message).toBe("string");
      expect((await (await getDue(dueRequest())).json()).data).toEqual([]);
    });

    it("validates the limit", async () => {
      expect((await getDue(dueRequest("?limit=abc"))).status).toBe(400);
      expect((await getDue(dueRequest("?limit=0"))).status).toBe(400);
      expect((await getDue(dueRequest("?limit=500"))).status).toBe(400);
      expect((await getDue(dueRequest("?limit=5"))).status).toBe(200);
    });
  });

  describe("POST /api/v1/reminders/{id}/result", () => {
    const claim = async () => (await (await getDue(dueRequest())).json()).data[0].id as string;

    it("requires the service key", async () => {
      const response = await postResult(resultRequest(reminderId, { outcome: "sent", attempt: 1 }, {}), ctxFor(reminderId));
      expect(response.status).toBe(401);
    });

    it("records a delivery and is safe to repeat", async () => {
      const id = await claim();
      const first = await postResult(resultRequest(id, { outcome: "sent", attempt: 1 }), ctxFor(id));
      expect(first.status).toBe(200);
      expect((await first.json()).data).toEqual({ id, status: "SENT" });
      const again = await postResult(resultRequest(id, { outcome: "sent", attempt: 1 }), ctxFor(id));
      expect((await again.json()).data.status).toBe("SENT");
    });

    it("records a failure and schedules the retry", async () => {
      const id = await claim();
      const response = await postResult(resultRequest(id, { outcome: "failed", error: "offline", attempt: 1 }), ctxFor(id));
      expect((await response.json()).data.status).toBe("PENDING");
    });

    it("rejects invalid bodies", async () => {
      const id = await claim();
      expect((await postResult(resultRequest(id, { outcome: "maybe" }), ctxFor(id))).status).toBe(400);
      expect((await postResult(resultRequest(id, {}), ctxFor(id))).status).toBe(400);
      expect((await postResult(resultRequest(id, { outcome: "sent" }), ctxFor(id))).status).toBe(400); // attempt is required
      expect((await postResult(resultRequest(id, "not json"), ctxFor(id))).status).toBe(400);
    });

    it("refuses an oversized body", async () => {
      const id = await claim();
      const response = await postResult(resultRequest(id, { outcome: "failed", attempt: 1, error: "x".repeat(10_000) }), ctxFor(id));
      expect(response.status).toBe(413);
    });

    it("answers 404 for an unknown reminder without leaking details", async () => {
      const response = await postResult(resultRequest("nope", { outcome: "sent", attempt: 1 }), ctxFor("nope"));
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error.code).toBe("NOT_FOUND");
      expect(JSON.stringify(body)).not.toMatch(/prisma|select|reminder\b.*from/i);
    });
  });
});
