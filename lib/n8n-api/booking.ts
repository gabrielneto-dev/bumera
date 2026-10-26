import type { PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { normalizeBrPhone, phoneCandidates } from "@/lib/phone";
import { formatSlot } from "@/lib/reminders/messages";
import { findNextSlots, type SlotOption, type SlotPreference } from "@/lib/schedule-slots";
import { bookAppointment } from "@/lib/services/appointments";
import { createPatient } from "@/lib/services/patients";
import { makeSystemContext } from "@/lib/services/system";
import { assertClinicExists } from "@/lib/n8n-api/clinic";

/**
 * Booking side of the API the n8n WhatsApp workflows call. The workflow (or its AI) talks to the person; the app
 * says which procedures and free times exist and files the request as a PENDING appointment the secretary
 * approves. Times always come from here: a workflow never invents one.
 */

export interface ProcedureOption {
  id: string;
  name: string;
  durationMin: number;
}

export async function listProcedures(prisma: PrismaClient, organizationId: string): Promise<ProcedureOption[]> {
  await assertClinicExists(prisma, organizationId);
  const rows = await prisma.procedure.findMany({ where: { organizationId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, defaultDurationMin: true } });
  return rows.map((row) => ({ id: row.id, name: row.name, durationMin: row.defaultDurationMin }));
}

export interface SlotsQuery {
  procedureId: string;
  offset: number;
  limit: number;
  preference?: SlotPreference | null;
}

export interface LabeledSlot extends SlotOption {
  /** "terça-feira, 20/10 às 10:00", ready to show. */
  label: string;
}

export async function listSlots(prisma: PrismaClient, organizationId: string, query: SlotsQuery, now: Date): Promise<{ slots: LabeledSlot[]; hasMore: boolean }> {
  await assertClinicExists(prisma, organizationId);
  const procedure = await prisma.procedure.findFirst({ where: { id: query.procedureId, organizationId, active: true }, select: { id: true } });
  if (!procedure) throw new AppError("NOT_FOUND", "Procedimento não encontrado", { resource: "procedure" });
  const page = await findNextSlots(makeSystemContext(prisma, organizationId, now), { procedureId: query.procedureId, offset: query.offset, limit: query.limit, preference: query.preference });
  return { slots: page.slots.map((slot) => ({ ...slot, label: formatSlot(slot.startsAt) })), hasMore: page.hasMore };
}

export interface BookingRequestInput {
  phone: string;
  procedureId: string;
  dentistId: string;
  startsAt: string;
  /** False when the appointment is for someone else (a child, a relative) registered as a dependent. */
  forSelf: boolean;
  /** The writer's full name; required when the phone belongs to no adult patient yet. */
  name?: string;
  /** The patient's full name when `forSelf` is false. */
  personName?: string;
}

export interface BookingRequestResult {
  appointmentId: string;
  patientId: string;
  status: "PENDING";
  startsAt: string;
}

const incomplete = (field: string, message: string): AppError => new AppError("VALIDATION", "Dados inválidos", { issues: [{ path: field, message }] });

/**
 * Registers the person if needed (pending patient, consent given in the chat; a dependent when it is for someone
 * else) and files the PENDING appointment. A slot taken meanwhile is refused (SLOT_TAKEN): offer slots again.
 */
export async function createBookingRequest(prisma: PrismaClient, organizationId: string, input: BookingRequestInput, now: Date): Promise<BookingRequestResult> {
  await assertClinicExists(prisma, organizationId);
  const phone = normalizeBrPhone(input.phone);
  if (!phone) throw incomplete("phone", "Telefone inválido");
  const system = makeSystemContext(prisma, organizationId, now);
  const candidates = phoneCandidates(phone);
  const known = await prisma.patient.findMany({
    where: { organizationId, phoneE164: { in: candidates }, anonymizedAt: null },
    select: { id: true, name: true, guardianName: true, doNotContact: true },
    orderBy: { createdAt: "asc" },
  });
  const adult = known.find((patient) => patient.guardianName === null && !patient.doNotContact);

  let patientId: string;
  if (input.forSelf) {
    if (adult) patientId = adult.id;
    else if (input.name) patientId = (await createPatient(system, { name: input.name, phone, consent: true }, { whatsapp: true })).id;
    else throw incomplete("name", "Informe o nome de quem vai ser atendido");
  } else {
    const guardian = adult?.name ?? input.name;
    if (!input.personName) throw incomplete("personName", "Informe o nome de quem vai ser atendido");
    if (!guardian) throw incomplete("name", "Informe o nome de quem está pedindo a consulta");
    // A returning dependent (same name, same phone) keeps their record instead of getting a second one.
    const existing = known.find((patient) => patient.guardianName !== null && patient.name.toLowerCase() === input.personName?.trim().toLowerCase());
    patientId = existing?.id ?? (await createPatient(system, { name: input.personName, phone, consent: true }, { whatsapp: true, guardianName: guardian })).id;
  }

  const appointment = await bookAppointment(system, { patientId, dentistId: input.dentistId, procedureId: input.procedureId, startsAt: input.startsAt }, { pending: true });
  return { appointmentId: appointment.id, patientId, status: "PENDING", startsAt: appointment.startsAt };
}
