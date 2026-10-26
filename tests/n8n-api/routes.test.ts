import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postAnswer } from "@/app/api/v1/clinics/[clinicId]/answers/route";
import { POST as postBooking } from "@/app/api/v1/clinics/[clinicId]/booking-requests/route";
import { GET as getContact } from "@/app/api/v1/clinics/[clinicId]/contact/route";
import { GET as getProcedures } from "@/app/api/v1/clinics/[clinicId]/procedures/route";
import { GET as getSlots } from "@/app/api/v1/clinics/[clinicId]/slots/route";
import { GET as getByInstance } from "@/app/api/v1/clinics/by-instance/[instance]/route";
import { createPrismaClient } from "@/lib/prisma";
import { connectWhatsapp, createClinic, createDentist, createPatient, createProcedure } from "../helpers/factories";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const KEY = "service-key-service-key-service-key-0001";
const auth = { authorization: `Bearer ${KEY}` };

const get = (path: string, headers: Record<string, string> = auth) => new Request(`http://localhost${path}`, { headers });
const post = (path: string, body: unknown, headers: Record<string, string> = auth) =>
  new Request(`http://localhost${path}`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

describe("API for the n8n WhatsApp workflows (routes)", () => {
  let clinic: string;
  let procedureId: string;

  beforeEach(async () => {
    vi.stubEnv("SERVICE_API_KEY", KEY);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinic = await createClinic(prisma, "a");
    await connectWhatsapp(prisma, clinic);
    await createDentist(prisma, clinic, "Dra. Ana");
    procedureId = (await createProcedure(prisma, clinic, "Clareamento")).id;
    await createPatient(prisma, clinic, { name: "Maria Souza", phoneE164: "+5511987654321" });
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.$disconnect();
  });

  it("requires the service key on every endpoint", async () => {
    expect((await getByInstance(get("/x", {}), params({ instance: "bumera-teste" }))).status).toBe(401);
    expect((await postAnswer(post("/x", {}, { authorization: "Bearer wrong" }), params({ clinicId: clinic }))).status).toBe(401);
    vi.stubEnv("SERVICE_API_KEY", "");
    expect((await getProcedures(get("/x"), params({ clinicId: clinic }))).status).toBe(503);
  });

  it("finds the clinic of an instance, and 404s an unknown one", async () => {
    expect(await (await getByInstance(get("/x"), params({ instance: "bumera-teste" }))).json()).toMatchObject({ success: true, data: { id: clinic, bookingEnabled: true } });
    expect((await getByInstance(get("/x"), params({ instance: "nope" }))).status).toBe(404);
  });

  it("describes a contact by phone as WhatsApp sends it (digits only)", async () => {
    const body = await (await getContact(get("/x?phone=5511987654321"), params({ clinicId: clinic }))).json();
    expect(body.data).toMatchObject({ known: true, patients: [{ firstName: "Maria" }] });
    expect((await getContact(get("/x"), params({ clinicId: clinic }))).status).toBe(400);
    expect((await getContact(get("/x?phone=5511987654321"), params({ clinicId: "org_missing" }))).status).toBe(404);
  });

  it("applies an opt-out and returns the reply to send", async () => {
    const response = await postAnswer(post("/x", { phone: "5511987654321", answer: "OPT_OUT" }), params({ clinicId: clinic }));
    expect(await response.json()).toMatchObject({ data: { outcome: "OPTED_OUT", reply: expect.stringContaining("não vai mais receber") } });
    expect((await postAnswer(post("/x", { phone: "5511987654321", answer: "MAYBE" }), params({ clinicId: clinic }))).status).toBe(400);
    expect((await postAnswer(post("/x", "not json"), params({ clinicId: clinic }))).status).toBe(400);
  });

  it("lists procedures and slots, and files a booking request; a taken slot is a 409", async () => {
    expect((await (await getProcedures(get("/x"), params({ clinicId: clinic }))).json()).data).toEqual([{ id: procedureId, name: "Clareamento", durationMin: 30 }]);

    const slots = (await (await getSlots(get(`/x?procedureId=${procedureId}&limit=2&period=morning&weekdays=1,2,3,4,5`), params({ clinicId: clinic }))).json()).data;
    expect(slots.slots).toHaveLength(2);
    expect((await getSlots(get(`/x?procedureId=${procedureId}&weekdays=9`), params({ clinicId: clinic }))).status).toBe(400);

    const [slot] = slots.slots;
    const request = { phone: "5511911112222", procedureId, dentistId: slot.dentistId, startsAt: slot.startsAt, forSelf: true, name: "Ana Souza" };
    expect(await (await postBooking(post("/x", request), params({ clinicId: clinic }))).json()).toMatchObject({ data: { status: "PENDING" } });
    expect((await postBooking(post("/x", { ...request, phone: "5511933334444" }), params({ clinicId: clinic }))).status).toBe(409);
    expect((await postBooking(post("/x", { ...request, startsAt: "amanhã" }), params({ clinicId: clinic }))).status).toBe(400);
  });
});
