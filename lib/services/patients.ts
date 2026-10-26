import { Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit";
import { assertCan } from "@/lib/authz";
import { isValidCpf, maskCpf } from "@/lib/cpf";
import { decryptField, encryptField, hashField } from "@/lib/crypto";
import { isUniqueViolation } from "@/lib/db-errors";
import { AppError } from "@/lib/errors";
import { allowMessagesSchema, parseInput, patientInputSchema, patientUpdateSchema } from "@/lib/schemas";
import type { ServiceContext } from "@/lib/services/context";

const DEFAULT_PAGE_SIZE = 50;
const ERASED_NAME = "Paciente removido";
const ERASED_PHONE = "REMOVIDO";
const ERASED_TEXT = "(removido)";
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
  /** The patient's data was erased on request (LGPD): only the clinic's record of what happened remains. */
  anonymized: boolean;
  /** For a dependent: who answers for them. */
  guardianName: string | null;
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
    anonymized: row.anonymizedAt !== null,
    guardianName: row.guardianName,
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

/** Like requirePatient, but refuses a patient whose data was erased: nothing may be added to it. */
export async function requireActivePatient(ctx: ServiceContext, id: string): Promise<PatientRow> {
  const row = await requirePatient(ctx, id);
  if (row.anonymizedAt) throw new AppError("ANONYMIZED_PATIENT", "Os dados deste paciente foram apagados a pedido dele");
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

/** `whatsapp`: registered by the booking dialog: pending the secretary's confirmation, consent given in the chat. */
export async function createPatient(ctx: ServiceContext, rawInput: unknown, options: { whatsapp?: boolean; guardianName?: string } = {}): Promise<PatientDto> {
  assertCan(ctx.role, "patient", "create");
  const input = parseInput(patientInputSchema, rawInput);
  const cpfHash = input.cpf ? hashField(input.cpf, ctx.keys.hash) : null;
  if (cpfHash) await assertNoDuplicate(ctx, cpfHash);

  try {
    const row = await ctx.db.$transaction(async (tx) => {
      const created = await tx.patient.create({
        data: {
          organizationId: ctx.organizationId,
          name: input.name,
          cpfEncrypted: input.cpf ? encryptField(input.cpf, ctx.keys.encryption) : null,
          cpfHash,
          phoneE164: input.phone,
          birthDate: input.birthDate ? birthDateToDate(input.birthDate, ctx) : null,
          consentAt: input.consent ? ctx.now() : null,
          consentSource: input.consent ? (options.guardianName ? "whatsapp_booking_guardian" : options.whatsapp ? "whatsapp_booking" : "secretary") : null,
          guardianName: options.guardianName ?? null,
          ...(options.whatsapp ? { status: "PENDING" as const, source: "WHATSAPP" as const } : {}),
        },
      });
      await recordAudit(tx, ctx, { action: "PATIENT_CREATED", patientId: created.id, entityId: created.id });
      return created;
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
  await requireActivePatient(ctx, id);

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
  const changed = Object.entries(input).filter(([, value]) => value !== undefined).map(([field]) => field);
  const row = await ctx.db.$transaction(async (tx) => {
    const updated = await tx.patient.update({ where: { id }, data });
    await recordAudit(tx, ctx, { action: "PATIENT_UPDATED", patientId: id, entityId: id, details: { fields: changed } });
    return updated;
  });
  return toDto(row, ctx);
}

/** A secretary confirms a patient created through WhatsApp. */
export async function confirmPatient(ctx: ServiceContext, id: string): Promise<PatientDto> {
  assertCan(ctx.role, "patient", "update");
  await requirePatient(ctx, id);
  const row = await ctx.db.$transaction(async (tx) => {
    const updated = await tx.patient.update({ where: { id }, data: { status: "CONFIRMED" } });
    await recordAudit(tx, ctx, { action: "PATIENT_CONFIRMED", patientId: id, entityId: id });
    return updated;
  });
  return toDto(row, ctx);
}

/**
 * A secretary lifts a patient's opt-out after the patient agreed again. The new consent is recorded
 * with its source and time. Reminders that were skipped while opted out are not resent; the plan
 * applies to appointments changed from now on.
 */
export async function allowMessagesAgain(ctx: ServiceContext, id: string, rawInput: unknown): Promise<PatientDto> {
  assertCan(ctx.role, "patient", "update");
  parseInput(allowMessagesSchema, rawInput);
  const patient = await requireActivePatient(ctx, id);
  if (!patient.doNotContact) {
    throw new AppError("NOT_OPTED_OUT", "Este paciente não pediu para parar de receber mensagens");
  }
  const row = await ctx.db.$transaction(async (tx) => {
    const updated = await tx.patient.update({
      where: { id },
      data: { doNotContact: false, optedOutAt: null, consentAt: ctx.now(), consentSource: "secretary_reactivation" },
    });
    await recordAudit(tx, ctx, { action: "CONSENT_RENEWED", patientId: id, entityId: id });
    return updated;
  });
  return toDto(row, ctx);
}

/**
 * Erases a patient's personal data at their request (LGPD art. 18, VI). The row is kept, stripped of every
 * personal field, because the clinic's appointments and quotes still refer to it. Irreversible; idempotent.
 */
export async function anonymizePatient(ctx: ServiceContext, id: string): Promise<PatientDto> {
  assertCan(ctx.role, "patient", "delete");
  const current = await requirePatient(ctx, id);
  if (current.anonymizedAt) return toDto(current, ctx);

  const now = ctx.now();
  const row = await ctx.db.$transaction(async (tx) => {
    const erased = await tx.patient.update({
      where: { id },
      data: {
        name: ERASED_NAME,
        cpfEncrypted: null,
        cpfHash: null,
        phoneE164: ERASED_PHONE,
        birthDate: null,
        consentAt: null,
        consentSource: null,
        doNotContact: true,
        optedOutAt: now,
        anonymizedAt: now,
      },
    });
    // Dependents reached through this person's phone lose their contact channel and the guardian's name: both
    // are the erased person's data. Their own records stay, but nothing can be sent to them any more.
    if (!current.guardianName) {
      const dependents = await tx.patient.findMany({ where: { phoneE164: current.phoneE164, guardianName: { not: null }, NOT: { id } }, select: { id: true } });
      const dependentIds = dependents.map((item) => item.id);
      if (dependentIds.length > 0) {
        await tx.patient.updateMany({ where: { id: { in: dependentIds } }, data: { phoneE164: ERASED_PHONE, guardianName: null, doNotContact: true, optedOutAt: now } });
        await tx.reminder.updateMany({
          where: { status: { in: ["PENDING", "CLAIMED"] }, OR: [{ appointment: { patientId: { in: dependentIds } } }, { quote: { patientId: { in: dependentIds } } }] },
          data: { status: "CANCELLED", note: "guardian data erased" },
        });
      }
    }
    // Nothing more goes out to this patient, and a quote's free text may name them.
    await tx.reminder.updateMany({
      where: {
        status: { in: ["PENDING", "CLAIMED"] },
        OR: [
          { appointment: { patientId: id } },
          { quote: { patientId: id } },
        ],
      },
      data: { status: "CANCELLED", note: "patient data erased" },
    });
    await tx.quote.updateMany({ where: { patientId: id, status: "OPEN" }, data: { status: "DECLINED", closedAt: now } });
    await tx.quote.updateMany({ where: { patientId: id }, data: { description: ERASED_TEXT } });
    await recordAudit(tx, ctx, { action: "PATIENT_ANONYMIZED", patientId: id, entityId: id });
    return erased;
  });
  return toDto(row, ctx);
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
