import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/prisma";
import {
  at,
  createClinic,
  createDentist,
  createPatient,
  createProcedure,
} from "./helpers/factories";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);

async function setup(slug: string) {
  const organizationId = await createClinic(prisma, slug);
  const [dentist, procedure, patient] = await Promise.all([
    createDentist(prisma, organizationId),
    createProcedure(prisma, organizationId),
    createPatient(prisma, organizationId),
  ]);
  return { organizationId, dentist, procedure, patient };
}

function appointment(
  fixtures: Awaited<ReturnType<typeof setup>>,
  startsAt: Date,
  endsAt: Date,
  status: "SCHEDULED" | "CANCELLED" | "NO_SHOW" = "SCHEDULED",
) {
  return prisma.appointment.create({
    data: {
      organizationId: fixtures.organizationId,
      patientId: fixtures.patient.id,
      dentistId: fixtures.dentist.id,
      procedureId: fixtures.procedure.id,
      startsAt,
      endsAt,
      status,
    },
  });
}

describe("database constraints", () => {
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("no overlapping appointments per dentist", () => {
    it("rejects an overlapping active appointment", async () => {
      const f = await setup("a");
      await appointment(f, at("10:00"), at("11:00"));
      await expect(appointment(f, at("10:30"), at("11:30"))).rejects.toThrow();
    });

    it("allows back-to-back appointments", async () => {
      const f = await setup("a");
      await appointment(f, at("10:00"), at("11:00"));
      await expect(appointment(f, at("11:00"), at("12:00"))).resolves.toBeDefined();
    });

    it("ignores cancelled and no-show appointments", async () => {
      const f = await setup("a");
      await appointment(f, at("10:00"), at("11:00"), "CANCELLED");
      await appointment(f, at("10:00"), at("11:00"), "NO_SHOW");
      await expect(appointment(f, at("10:15"), at("10:45"))).resolves.toBeDefined();
    });

    it("allows the same time for different dentists", async () => {
      const f = await setup("a");
      const other = await createDentist(prisma, f.organizationId, "Dr. Beto");
      await appointment(f, at("10:00"), at("11:00"));
      await expect(
        prisma.appointment.create({
          data: {
            organizationId: f.organizationId,
            patientId: f.patient.id,
            dentistId: other.id,
            procedureId: f.procedure.id,
            startsAt: at("10:00"),
            endsAt: at("11:00"),
          },
        }),
      ).resolves.toBeDefined();
    });

    it("rejects an appointment that ends before it starts", async () => {
      const f = await setup("a");
      await expect(appointment(f, at("11:00"), at("10:00"))).rejects.toThrow();
    });
  });

  describe("clinic isolation in relations", () => {
    it("rejects an appointment that points to another clinic's patient", async () => {
      const a = await setup("a");
      const b = await setup("b");
      await expect(
        prisma.appointment.create({
          data: {
            organizationId: a.organizationId,
            patientId: b.patient.id,
            dentistId: a.dentist.id,
            procedureId: a.procedure.id,
            startsAt: at("10:00"),
            endsAt: at("11:00"),
          },
        }),
      ).rejects.toThrow();
    });

    it("rejects an appointment that points to another clinic's dentist or procedure", async () => {
      const a = await setup("a");
      const b = await setup("b");
      const base = {
        organizationId: a.organizationId,
        patientId: a.patient.id,
        startsAt: at("10:00"),
        endsAt: at("11:00"),
      };
      await expect(
        prisma.appointment.create({
          data: { ...base, dentistId: b.dentist.id, procedureId: a.procedure.id },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.appointment.create({
          data: { ...base, dentistId: a.dentist.id, procedureId: b.procedure.id },
        }),
      ).rejects.toThrow();
    });
  });

  describe("patient CPF uniqueness", () => {
    it("rejects the same CPF hash twice in one clinic", async () => {
      const a = await createClinic(prisma, "a");
      await createPatient(prisma, a, { cpfHash: "hash-1" });
      await expect(createPatient(prisma, a, { cpfHash: "hash-1" })).rejects.toThrow();
    });

    it("allows the same CPF hash in different clinics", async () => {
      const a = await createClinic(prisma, "a");
      const b = await createClinic(prisma, "b");
      await createPatient(prisma, a, { cpfHash: "hash-1" });
      await expect(createPatient(prisma, b, { cpfHash: "hash-1" })).resolves.toBeDefined();
    });

    it("allows several patients without CPF", async () => {
      const a = await createClinic(prisma, "a");
      await createPatient(prisma, a, { name: "Criança 1" });
      await expect(createPatient(prisma, a, { name: "Criança 2" })).resolves.toBeDefined();
    });
  });
});
