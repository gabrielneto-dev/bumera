import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/prisma";
import { createBookingRequest, listProcedures, listSlots } from "@/lib/n8n-api/booking";
import { connectWhatsapp, createClinic, createDentist, createPatient, createProcedure } from "../helpers/factories";
import { NOW } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const PHONE = "+5511987654321";
const STRANGER = "+5511911112222";

describe("API for the n8n WhatsApp workflows: booking", () => {
  let clinic: string;
  let procedureId: string;

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinic = await createClinic(prisma, "a");
    await connectWhatsapp(prisma, clinic);
    await createDentist(prisma, clinic, "Dra. Ana");
    procedureId = (await createProcedure(prisma, clinic, "Clareamento")).id;
    await prisma.procedure.create({ data: { organizationId: clinic, name: "Antigo", active: false } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("lists the clinic's active procedures", async () => {
    expect(await listProcedures(prisma, clinic)).toEqual([{ id: procedureId, name: "Clareamento", durationMin: 30 }]);
  });

  it("offers only real free slots, with a label ready to show, and honours a preference", async () => {
    const page = await listSlots(prisma, clinic, { procedureId, offset: 0, limit: 3 }, NOW);
    expect(page.slots).toHaveLength(3);
    expect(page.slots[0]).toMatchObject({ dentistName: "Dra. Ana", label: expect.stringContaining(" às ") });
    expect(page.hasMore).toBe(true);

    const afternoon = await listSlots(prisma, clinic, { procedureId, offset: 0, limit: 3, preference: { period: "afternoon" } }, NOW);
    expect(afternoon.slots.every((slot) => Number(slot.label.split(" às ")[1]?.slice(0, 2)) >= 13)).toBe(true);
  });

  it("files a pending appointment for a first contact, registering them as a pending patient", async () => {
    const [slot] = (await listSlots(prisma, clinic, { procedureId, offset: 0, limit: 1 }, NOW)).slots;

    const result = await createBookingRequest(prisma, clinic, { phone: STRANGER, procedureId, dentistId: slot!.dentistId, startsAt: slot!.startsAt, forSelf: true, name: "Ana Souza" }, NOW);

    expect(result).toMatchObject({ status: "PENDING", startsAt: slot!.startsAt });
    const patient = await prisma.patient.findUniqueOrThrow({ where: { id: result.patientId } });
    expect(patient).toMatchObject({ name: "Ana Souza", phoneE164: STRANGER, status: "PENDING", source: "WHATSAPP" });
    expect(patient.consentAt).not.toBeNull();
  });

  it("books a known patient without asking a name, and a dependent under the patient as guardian", async () => {
    const adult = await createPatient(prisma, clinic, { name: "Maria Souza", phoneE164: PHONE });
    const slots = (await listSlots(prisma, clinic, { procedureId, offset: 0, limit: 2 }, NOW)).slots;

    const own = await createBookingRequest(prisma, clinic, { phone: PHONE, procedureId, dentistId: slots[0]!.dentistId, startsAt: slots[0]!.startsAt, forSelf: true }, NOW);
    const child = await createBookingRequest(prisma, clinic, { phone: PHONE, procedureId, dentistId: slots[1]!.dentistId, startsAt: slots[1]!.startsAt, forSelf: false, personName: "Pedro Souza" }, NOW);

    expect(own.patientId).toBe(adult.id);
    expect(await prisma.patient.findUniqueOrThrow({ where: { id: child.patientId } })).toMatchObject({ name: "Pedro Souza", guardianName: "Maria Souza", phoneE164: PHONE });
  });

  it("refuses a taken slot and an incomplete request", async () => {
    const [slot] = (await listSlots(prisma, clinic, { procedureId, offset: 0, limit: 1 }, NOW)).slots;
    const request = { phone: STRANGER, procedureId, dentistId: slot!.dentistId, startsAt: slot!.startsAt, forSelf: true, name: "Ana Souza" };
    await createBookingRequest(prisma, clinic, request, NOW);

    await expect(createBookingRequest(prisma, clinic, { ...request, phone: "+5511933334444" }, NOW)).rejects.toMatchObject({ code: "SLOT_TAKEN" });
    await expect(createBookingRequest(prisma, clinic, { ...request, phone: "+5511955556666", name: undefined }, NOW)).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
