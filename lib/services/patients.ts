import type { Prisma } from "@/generated/prisma/client";
import { assertCan } from "@/lib/authz";
import { isValidCpf, maskCpf } from "@/lib/cpf";
import { decryptField, encryptField, hashField } from "@/lib/crypto";
import { isUniqueViolation } from "@/lib/db-errors";
import { AppError } from "@/lib/errors";
import { parseInput, patientInputSchema, patientUpdateSchema } from "@/lib/schemas";
import type { ServiceContext } from "@/lib/services/context";

const DEFAULT_PAGE_SIZE = 50;
const MIN_PHONE_SEARCH_DIGITS = 4;

export interface PatientDto {
  id: string;
  name: string;
  cpfMasked: string | null;
  phoneE164: string;
  birthDate: string | null;
  status: "PENDING" | "CONFIRMED";
  source: "SECRETARY" | "WHATSAPP";
  doNotContact: boolean;
  createdAt: string;
}

type PatientRow = Prisma.PatientGetPayload<object>;

function toDto(row: PatientRow, ctx: ServiceContext): PatientDto {
  return {
    id: row.id,
    name: row.name,
    cpfMasked: row.cpfEncrypted ? maskCpf(decryptField(row.cpfEncrypted, ctx.keys.encryption)) : null,
    phoneE164: row.phoneE164,
    birthDate: row.birthDate ? row.birthDate.toISOString().slice(0, 10) : null,
    status: row.status,
    source: row.source,
    doNotContact: row.doNotContact,
    createdAt: row.createdAt.toISOString(),
  };
}

function duplicateError(existingPatientId: string): AppError {
  return new AppError("DUPLICATE_PATIENT", "Já existe um paciente com este CPF nesta clínica", {
    existingPatientId,
  });
}

async function assertNoDuplicate(ctx: ServiceContext, cpfHash: string, exceptId?: string) {
  const existing = await ctx.db.patient.findFirst({
    where: { cpfHash, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  });
  if (existing) throw duplicateError(existing.id);
}

async function requirePatient(ctx: ServiceContext, id: string): Promise<PatientRow> {
  const row = await ctx.db.patient.findUnique({ where: { id } });
  if (!row) throw new AppError("NOT_FOUND", "Paciente não encontrado", { resource: "patient" });
  return row;
}

function birthDateToDate(value: string, ctx: ServiceContext): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (date > ctx.now()) {
    throw new AppError("VALIDATION", "Dados inválidos", {
      issues: [{ path: "birthDate", message: "A data de nascimento não pode ser futura" }],
    });
  }
  return date;
}

export async function createPatient(ctx: ServiceContext, rawInput: unknown): Promise<PatientDto> {
  assertCan(ctx.role, "patient", "create");
  const input = parseInput(patientInputSchema, rawInput);
  const cpfHash = input.cpf ? hashField(input.cpf, ctx.keys.hash) : null;
  if (cpfHash) await assertNoDuplicate(ctx, cpfHash);

  try {
    const row = await ctx.db.patient.create({
      data: {
        organizationId: ctx.organizationId,
        name: input.name,
        cpfEncrypted: input.cpf ? encryptField(input.cpf, ctx.keys.encryption) : null,
        cpfHash,
        phoneE164: input.phone,
        birthDate: input.birthDate ? birthDateToDate(input.birthDate, ctx) : null,
        consentAt: input.consent ? ctx.now() : null,
        consentSource: input.consent ? "secretary" : null,
      },
    });
    return toDto(row, ctx);
  } catch (error) {
    // Lost a race against another request with the same CPF.
    if (isUniqueViolation(error) && cpfHash) {
      const existing = await ctx.db.patient.findFirst({ where: { cpfHash }, select: { id: true } });
      if (existing) throw duplicateError(existing.id);
    }
    throw error;
  }
}

export async function updatePatient(
  ctx: ServiceContext,
  id: string,
  rawInput: unknown,
): Promise<PatientDto> {
  assertCan(ctx.role, "patient", "update");
  const input = parseInput(patientUpdateSchema, rawInput);
  await requirePatient(ctx, id);

  const data: Prisma.PatientUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.phone !== undefined) data.phoneE164 = input.phone;
  if (input.birthDate !== undefined) {
    data.birthDate = input.birthDate === null ? null : birthDateToDate(input.birthDate, ctx);
  }
  if (input.cpf !== undefined) {
    if (input.cpf === null) {
      data.cpfEncrypted = null;
      data.cpfHash = null;
    } else {
      const cpfHash = hashField(input.cpf, ctx.keys.hash);
      await assertNoDuplicate(ctx, cpfHash, id);
      data.cpfEncrypted = encryptField(input.cpf, ctx.keys.encryption);
      data.cpfHash = cpfHash;
    }
  }
  return toDto(await ctx.db.patient.update({ where: { id }, data }), ctx);
}

/** A secretary confirms a patient created through WhatsApp. */
export async function confirmPatient(ctx: ServiceContext, id: string): Promise<PatientDto> {
  assertCan(ctx.role, "patient", "update");
  await requirePatient(ctx, id);
  return toDto(
    await ctx.db.patient.update({ where: { id }, data: { status: "CONFIRMED" } }),
    ctx,
  );
}

export async function getPatient(ctx: ServiceContext, id: string): Promise<PatientDto> {
  assertCan(ctx.role, "patient", "read");
  return toDto(await requirePatient(ctx, id), ctx);
}

export interface ListPatientsOptions {
  search?: string;
  status?: "PENDING" | "CONFIRMED";
  limit?: number;
  offset?: number;
}

/** Search matches name, phone digits or an exact CPF. */
export async function listPatients(
  ctx: ServiceContext,
  options: ListPatientsOptions,
): Promise<{ items: PatientDto[]; total: number }> {
  assertCan(ctx.role, "patient", "read");
  const where: Prisma.PatientWhereInput = {};
  if (options.status) where.status = options.status;

  const term = options.search?.trim();
  if (term) {
    const digits = term.replace(/\D/g, "");
    const conditions: Prisma.PatientWhereInput[] = [
      { name: { contains: term, mode: "insensitive" } },
    ];
    if (digits.length >= MIN_PHONE_SEARCH_DIGITS) conditions.push({ phoneE164: { contains: digits } });
    if (isValidCpf(digits)) conditions.push({ cpfHash: hashField(digits, ctx.keys.hash) });
    where.OR = conditions;
  }

  const [rows, total] = await Promise.all([
    ctx.db.patient.findMany({
      where,
      orderBy: { name: "asc" },
      take: options.limit ?? DEFAULT_PAGE_SIZE,
      skip: options.offset ?? 0,
    }),
    ctx.db.patient.count({ where }),
  ]);
  return { items: rows.map((row) => toDto(row, ctx)), total };
}
