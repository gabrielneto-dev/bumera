import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/prisma";
import { scopedPrisma } from "@/lib/tenant-scope";
import { at, createClinic, createDentist, createPatient, createProcedure } from "./helpers/factories";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);

describe("scopedPrisma on registry and appointment tables", () => {
  let clinicA: string;
  let clinicB: string;

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinicA = await createClinic(prisma, "a");
    clinicB = await createClinic(prisma, "b");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("lists only the clinic's own patients, procedures and dentists", async () => {
    await createPatient(prisma, clinicA, { name: "Ana" });
    await createPatient(prisma, clinicB, { name: "Bia", phoneE164: "+5511912345678" });
    await createProcedure(prisma, clinicB);
    await createDentist(prisma, clinicB);

    const db = scopedPrisma(prisma, clinicA);
    expect((await db.patient.findMany()).map((p) => p.name)).toEqual(["Ana"]);
    expect(await db.procedure.count()).toBe(0);
    expect(await db.dentist.count()).toBe(0);
  });

  it("cannot read another clinic's patient by id", async () => {
    const other = await createPatient(prisma, clinicB);
    expect(await scopedPrisma(prisma, clinicA).patient.findUnique({ where: { id: other.id } })).toBeNull();
  });

  it("cannot book an appointment with another clinic's patient", async () => {
    const dentist = await createDentist(prisma, clinicA);
    const procedure = await createProcedure(prisma, clinicA);
    const foreignPatient = await createPatient(prisma, clinicB);

    await expect(
      scopedPrisma(prisma, clinicA).appointment.create({
        data: {
          organizationId: clinicA,
          patientId: foreignPatient.id,
          dentistId: dentist.id,
          procedureId: procedure.id,
          startsAt: at("10:00"),
          endsAt: at("10:30"),
        },
      }),
    ).rejects.toThrow();
  });

  it("books and lists the clinic's own appointments only", async () => {
    const dentist = await createDentist(prisma, clinicA);
    const procedure = await createProcedure(prisma, clinicA);
    const patient = await createPatient(prisma, clinicA);
    const db = scopedPrisma(prisma, clinicA);

    await db.appointment.create({
      data: {
        organizationId: clinicA,
        patientId: patient.id,
        dentistId: dentist.id,
        procedureId: procedure.id,
        startsAt: at("10:00"),
        endsAt: at("10:30"),
      },
    });

    expect(await db.appointment.count()).toBe(1);
    expect(await scopedPrisma(prisma, clinicB).appointment.count()).toBe(0);
  });
});
