import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/prisma";
import { allowMessagesAgain } from "@/lib/services/patients";
import { createClinic, createPatient } from "../helpers/factories";
import { ctxFor, NOW } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);

describe("allowMessagesAgain", () => {
  let clinicA: string;
  let clinicB: string;
  let optedOutId: string;

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinicA = await createClinic(prisma, "a");
    clinicB = await createClinic(prisma, "b");
    optedOutId = (await createPatient(prisma, clinicA, { doNotContact: true, consentAt: null })).id;
    await prisma.patient.update({ where: { id: optedOutId }, data: { optedOutAt: new Date("2026-10-01T00:00:00.000Z") } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("lifts the opt-out and records the new consent with its source and time", async () => {
    const dto = await allowMessagesAgain(ctxFor(prisma, clinicA), optedOutId, { consent: true });

    const row = await prisma.patient.findUniqueOrThrow({ where: { id: optedOutId } });
    expect(dto.doNotContact).toBe(false);
    expect(row).toMatchObject({ doNotContact: false, optedOutAt: null, consentSource: "secretary_reactivation" });
    expect(row.consentAt).toEqual(NOW);
  });

  it.each([{}, { consent: false }, { consent: "true" }, null])("requires the explicit consent confirmation (%j)", async (input) => {
    await expect(allowMessagesAgain(ctxFor(prisma, clinicA), optedOutId, input)).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: optedOutId } })).doNotContact).toBe(true);
  });

  it("refuses a patient who has not opted out", async () => {
    const active = await createPatient(prisma, clinicA);
    await expect(allowMessagesAgain(ctxFor(prisma, clinicA), active.id, { consent: true })).rejects.toMatchObject({
      code: "NOT_OPTED_OUT",
    });
  });

  it("cannot touch another clinic's patient", async () => {
    await expect(allowMessagesAgain(ctxFor(prisma, clinicB), optedOutId, { consent: true })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: optedOutId } })).doNotContact).toBe(true);
  });

  it("is limited to roles that can update patients", async () => {
    await expect(allowMessagesAgain(ctxFor(prisma, clinicA, "dentist"), optedOutId, { consent: true })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
