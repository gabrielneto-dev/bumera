import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/prisma";
import { createDentist, listDentists, updateDentist } from "@/lib/services/dentists";
import { createProcedure, listProcedures, updateProcedure } from "@/lib/services/procedures";
import { createClinic } from "../helpers/factories";
import { ctxFor } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe("dentists and procedures services", () => {
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

  it("lets the admin create a dentist with default hours", async () => {
    const dentist = await createDentist(ctxFor(prisma, clinicA, "admin"), { name: "Dra. Ana" });
    expect(dentist).toMatchObject({ name: "Dra. Ana", active: true, workStart: "08:00", workEnd: "18:00" });
    expect(dentist.workDays).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("forbids the secretary from creating dentists or procedures but lets her list them", async () => {
    const secretary = ctxFor(prisma, clinicA, "secretary");
    await expectCode(createDentist(secretary, { name: "Dr. X" }), "FORBIDDEN");
    await expectCode(createProcedure(secretary, { name: "Limpeza", defaultDurationMin: 30 }), "FORBIDDEN");
    await expect(listDentists(secretary, {})).resolves.toEqual([]);
    await expect(listProcedures(secretary, {})).resolves.toEqual([]);
  });

  it("validates working hours and days", async () => {
    const admin = ctxFor(prisma, clinicA, "admin");
    await expectCode(createDentist(admin, { name: "Dr. X", workStart: "18:00", workEnd: "08:00" }), "VALIDATION");
    await expectCode(createDentist(admin, { name: "Dr. X", workStart: "8h", workEnd: "12:00" }), "VALIDATION");
    await expectCode(createDentist(admin, { name: "Dr. X", workDays: [] }), "VALIDATION");
    await expectCode(createDentist(admin, { name: "Dr. X", workDays: [7] }), "VALIDATION");
    await expectCode(createDentist(admin, { name: "A" }), "VALIDATION");
  });

  it("updates and deactivates a dentist; lists active ones by default", async () => {
    const admin = ctxFor(prisma, clinicA, "admin");
    const dentist = await createDentist(admin, { name: "Dra. Ana" });
    await createDentist(admin, { name: "Dr. Beto", workStart: "09:00", workEnd: "13:00" });
    await updateDentist(admin, dentist.id, { active: false });
    expect((await listDentists(admin, {})).map((d) => d.name)).toEqual(["Dr. Beto"]);
    expect(await listDentists(admin, { includeInactive: true })).toHaveLength(2);
    await expectCode(updateDentist(admin, dentist.id, { workStart: "20:00" }), "VALIDATION");
  });

  it("isolates catalogs between clinics", async () => {
    await createDentist(ctxFor(prisma, clinicB, "admin"), { name: "Dr. Outro" });
    await createProcedure(ctxFor(prisma, clinicB, "admin"), { name: "Canal", defaultDurationMin: 60 });
    expect(await listDentists(ctxFor(prisma, clinicA, "admin"), {})).toEqual([]);
    expect(await listProcedures(ctxFor(prisma, clinicA, "admin"), {})).toEqual([]);
  });

  it("creates, validates and updates procedures", async () => {
    const admin = ctxFor(prisma, clinicA, "admin");
    const procedure = await createProcedure(admin, { name: "Limpeza", defaultDurationMin: 30 });
    expect(procedure).toMatchObject({ name: "Limpeza", defaultDurationMin: 30, active: true });
    await expectCode(createProcedure(admin, { name: "Limpeza", defaultDurationMin: 0 }), "VALIDATION");
    await expectCode(createProcedure(admin, { name: "Limpeza", defaultDurationMin: 9999 }), "VALIDATION");
    const updated = await updateProcedure(admin, procedure.id, { defaultDurationMin: 45, active: false });
    expect(updated).toMatchObject({ defaultDurationMin: 45, active: false });
    expect(await listProcedures(admin, {})).toEqual([]);
    expect(await listProcedures(admin, { includeInactive: true })).toHaveLength(1);
    await expectCode(updateProcedure(admin, "00000000-0000-4000-8000-000000000000", { name: "Xx" }), "NOT_FOUND");
  });
});
