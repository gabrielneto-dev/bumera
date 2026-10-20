import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { hashField } from "@/lib/crypto";
import { createPrismaClient } from "@/lib/prisma";
import {
  confirmPatient,
  createPatient,
  listPatients,
  updatePatient,
} from "@/lib/services/patients";
import { createClinic } from "../helpers/factories";
import { ctxFor, TEST_KEYS } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const VALID_CPF = "529.982.247-25";
const OTHER_CPF = "111.444.777-35";
const base = { name: "Maria Souza", phone: "(11) 98765-4321" };

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe("patients service", () => {
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

  it("creates a patient, normalizes data and never stores the CPF in clear", async () => {
    const patient = await createPatient(ctxFor(prisma, clinicA), { ...base, cpf: VALID_CPF });
    expect(patient).toMatchObject({
      name: "Maria Souza",
      phoneE164: "+5511987654321",
      cpfMasked: "***.***.***-25",
      status: "CONFIRMED",
      source: "SECRETARY",
    });
    const row = await prisma.patient.findUniqueOrThrow({ where: { id: patient.id } });
    expect(row.cpfEncrypted).not.toContain("52998224725");
    expect(row.cpfHash).toBe(hashField("52998224725", TEST_KEYS.hash));
    expect(JSON.stringify(patient)).not.toContain("52998224725");
  });

  it("records consent when given", async () => {
    const patient = await createPatient(ctxFor(prisma, clinicA), { ...base, consent: true });
    const row = await prisma.patient.findUniqueOrThrow({ where: { id: patient.id } });
    expect(row.consentAt).toEqual(new Date("2026-10-15T12:00:00.000Z"));
    expect(row.consentSource).toBe("secretary");
  });

  it("validates name, CPF, phone and birth date", async () => {
    const ctx = ctxFor(prisma, clinicA);
    await expectCode(createPatient(ctx, { ...base, name: "A" }), "VALIDATION");
    await expectCode(createPatient(ctx, { ...base, cpf: "123.456.789-00" }), "VALIDATION");
    await expectCode(createPatient(ctx, { ...base, phone: "123" }), "VALIDATION");
    await expectCode(createPatient(ctx, { ...base, birthDate: "2999-01-01" }), "VALIDATION");
    await expectCode(createPatient(ctx, { ...base, birthDate: "01/02/2000" }), "VALIDATION");
  });

  it("rejects a duplicated CPF in the same clinic and points to the existing patient", async () => {
    const ctx = ctxFor(prisma, clinicA);
    const first = await createPatient(ctx, { ...base, cpf: VALID_CPF });
    const attempt = createPatient(ctx, { name: "Outra Pessoa", phone: "(11) 91234-5678", cpf: "52998224725" });
    await expectCode(attempt, "DUPLICATE_PATIENT");
    await attempt.catch((error: AppError) => expect(error.details).toMatchObject({ existingPatientId: first.id }));
  });

  it("allows the same CPF in another clinic and several patients without CPF", async () => {
    await createPatient(ctxFor(prisma, clinicA), { ...base, cpf: VALID_CPF });
    await expect(createPatient(ctxFor(prisma, clinicB), { ...base, cpf: VALID_CPF })).resolves.toBeDefined();
    await createPatient(ctxFor(prisma, clinicA), { name: "Criança Um", phone: "(11) 98888-1111" });
    await expect(
      createPatient(ctxFor(prisma, clinicA), { name: "Criança Dois", phone: "(11) 98888-2222" }),
    ).resolves.toBeDefined();
  });

  it("forbids roles without permission", async () => {
    await expectCode(createPatient(ctxFor(prisma, clinicA, "dentist"), base), "FORBIDDEN");
    await expect(listPatients(ctxFor(prisma, clinicA, "dentist"), {})).resolves.toBeDefined();
  });

  it("lists and searches by name, phone and CPF inside the clinic only", async () => {
    const ctx = ctxFor(prisma, clinicA);
    await createPatient(ctx, { ...base, cpf: VALID_CPF });
    await createPatient(ctx, { name: "João Lima", phone: "(21) 99999-0000" });
    await createPatient(ctxFor(prisma, clinicB), { name: "Maria Outra", phone: "(11) 97777-7777" });

    expect((await listPatients(ctx, {})).total).toBe(2);
    expect((await listPatients(ctx, { search: "maria" })).items.map((p) => p.name)).toEqual(["Maria Souza"]);
    expect((await listPatients(ctx, { search: "99999" })).items.map((p) => p.name)).toEqual(["João Lima"]);
    expect((await listPatients(ctx, { search: "529.982.247-25" })).items.map((p) => p.name)).toEqual(["Maria Souza"]);
    expect((await listPatients(ctx, { search: "zzz" })).items).toEqual([]);
  });

  it("updates data and blocks a CPF that belongs to another patient", async () => {
    const ctx = ctxFor(prisma, clinicA);
    const maria = await createPatient(ctx, { ...base, cpf: VALID_CPF });
    const joao = await createPatient(ctx, { name: "João Lima", phone: "(21) 99999-0000", cpf: OTHER_CPF });

    const renamed = await updatePatient(ctx, maria.id, { name: "Maria S. Souza" });
    expect(renamed.name).toBe("Maria S. Souza");
    expect(renamed.cpfMasked).toBe("***.***.***-25");

    await expectCode(updatePatient(ctx, joao.id, { cpf: VALID_CPF }), "DUPLICATE_PATIENT");
    await expect(updatePatient(ctx, maria.id, { cpf: VALID_CPF })).resolves.toBeDefined();
    await expectCode(updatePatient(ctx, "00000000-0000-4000-8000-000000000000", { name: "Xx" }), "NOT_FOUND");
  });

  it("does not reach patients of another clinic", async () => {
    const other = await createPatient(ctxFor(prisma, clinicB), base);
    await expectCode(updatePatient(ctxFor(prisma, clinicA), other.id, { name: "Invasor" }), "NOT_FOUND");
  });

  it("confirms a pending patient", async () => {
    const row = await prisma.patient.create({
      data: { organizationId: clinicA, name: "Via WhatsApp", phoneE164: "+5511955554444", status: "PENDING", source: "WHATSAPP" },
    });
    const confirmed = await confirmPatient(ctxFor(prisma, clinicA), row.id);
    expect(confirmed.status).toBe("CONFIRMED");
    await expectCode(confirmPatient(ctxFor(prisma, clinicA, "dentist"), row.id), "FORBIDDEN");
  });
});
