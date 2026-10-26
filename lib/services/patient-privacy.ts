import { recordAudit } from "@/lib/audit";
import { assertCan } from "@/lib/authz";
import { decryptField } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import type { ServiceContext } from "@/lib/services/context";

const CENTS = 100;

/** Everything the clinic holds about one patient, in a form the patient can take elsewhere. */
export interface PatientExport {
  exportedAt: string;
  patient: {
    id: string;
    name: string;
    /** Full CPF, digits only: it is the patient's own data. */
    cpf: string | null;
    phone: string;
    /** For a dependent: the person who answers for them. */
    guardianName: string | null;
    birthDate: string | null;
    status: string;
    source: string;
    consentAt: string | null;
    consentSource: string | null;
    doNotContact: boolean;
    optedOutAt: string | null;
    createdAt: string;
  };
  appointments: Array<{
    id: string;
    startsAt: string;
    endsAt: string;
    status: string;
    dentist: string;
    procedure: string;
    rescheduleRequestedAt: string | null;
  }>;
  quotes: Array<{ id: string; description: string; valueReais: number | null; status: string; createdAt: string; closedAt: string | null }>;
  /** What the patient wrote that no keyword explained, with the text while it was still needed. */
  /** Messages the system sent or tried to send (their text is not stored). */
  messages: Array<{ kind: string; status: string; attempts: number; sentAt: string | null; createdAt: string }>;
}

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

/**
 * Exports a patient's data (LGPD art. 18, II and V) and records the export in the activity log.
 * Secretaries can do it because requests usually arrive at the counter.
 */
export async function exportPatientData(ctx: ServiceContext, id: string): Promise<PatientExport> {
  assertCan(ctx.role, "patient", "update");
  const patient = await ctx.db.patient.findUnique({ where: { id } });
  if (!patient) throw new AppError("NOT_FOUND", "Paciente não encontrado", { resource: "patient" });
  if (patient.anonymizedAt) throw new AppError("ANONYMIZED_PATIENT", "Os dados deste paciente já foram apagados");

  const [appointments, quotes, reminders] = await Promise.all([
    ctx.db.appointment.findMany({
      where: { patientId: id },
      include: { dentist: { select: { name: true } }, procedure: { select: { name: true } } },
      orderBy: { startsAt: "asc" },
    }),
    ctx.db.quote.findMany({ where: { patientId: id }, orderBy: { createdAt: "asc" } }),
    ctx.db.reminder.findMany({
      where: { OR: [{ appointment: { patientId: id } }, { quote: { patientId: id } }] },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  await recordAudit(ctx.db, ctx, { action: "PATIENT_EXPORTED", patientId: id, entityId: id });

  return {
    exportedAt: ctx.now().toISOString(),
    patient: {
      id: patient.id,
      name: patient.name,
      cpf: patient.cpfEncrypted ? decryptField(patient.cpfEncrypted, ctx.keys.encryption) : null,
      phone: patient.phoneE164,
      guardianName: patient.guardianName,
      birthDate: patient.birthDate ? patient.birthDate.toISOString().slice(0, 10) : null,
      status: patient.status,
      source: patient.source,
      consentAt: iso(patient.consentAt),
      consentSource: patient.consentSource,
      doNotContact: patient.doNotContact,
      optedOutAt: iso(patient.optedOutAt),
      createdAt: patient.createdAt.toISOString(),
    },
    appointments: appointments.map((row) => ({
      id: row.id,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      status: row.status,
      dentist: row.dentist.name,
      procedure: row.procedure.name,
      rescheduleRequestedAt: iso(row.rescheduleRequestedAt),
    })),
    quotes: quotes.map((row) => ({
      id: row.id,
      description: row.description,
      valueReais: row.valueCents === null ? null : row.valueCents / CENTS,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      closedAt: iso(row.closedAt),
    })),
    messages: reminders.map((row) => ({
      kind: row.kind,
      status: row.status,
      attempts: row.attempts,
      sentAt: iso(row.sentAt),
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
