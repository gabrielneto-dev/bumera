import type { PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { phoneCandidates } from "@/lib/phone";
import { firstName } from "@/lib/reminders/messages";
import { openCampaignMessage } from "@/lib/n8n-api/answers";

/**
 * Read side of the API the n8n WhatsApp workflows call (CTX-DEC-20261026-whatsapp-in-n8n). The app owns the data;
 * n8n owns the conversation. Answers carry first names only: never full names, CPFs or birth dates.
 */

export interface ClinicByInstance {
  id: string;
  name: string;
  /** What the clinic wrote for the assistant to answer from (address, hours, payment); empty when none. */
  info: string;
  /** Whether first contacts may be guided to a booking request. */
  bookingEnabled: boolean;
}

/** The clinic whose WhatsApp number (Evolution instance) received a message. */
export async function findClinicByInstance(prisma: PrismaClient, instance: string): Promise<ClinicByInstance> {
  const settings = await prisma.clinicSettings.findUnique({
    where: { whatsappInstance: instance },
    select: { bookingEnabled: true, clinicInfo: true, organization: { select: { id: true, name: true } } },
  });
  if (!settings) throw new AppError("NOT_FOUND", "Instância não encontrada", { resource: "instance" });
  return { id: settings.organization.id, name: settings.organization.name, info: settings.clinicInfo ?? "", bookingEnabled: settings.bookingEnabled };
}

export async function assertClinicExists(prisma: PrismaClient, organizationId: string): Promise<void> {
  const found = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
  if (!found) throw new AppError("NOT_FOUND", "Clínica não encontrada", { resource: "clinic" });
}

export interface ContactDescription {
  known: boolean;
  /** Every record of the phone asked not to be contacted: send nothing but an opt-out acknowledgement. */
  optedOut: boolean;
  patients: Array<{ id: string; firstName: string; dependent: boolean }>;
  upcoming: Array<{ id: string; startsAt: string; status: string; dentist: string; procedure: string; patientFirstName: string; rescheduleRequested: boolean }>;
  /** What a "sim"/"1" would answer: an appointment message, a campaign (reactivation, quote) or nothing. */
  awaitingAnswer: "appointment" | "campaign" | null;
}

const LIVE_STATUSES = ["PENDING", "SCHEDULED", "CONFIRMED"] as const;

/** Who is behind a phone number in one clinic, for the workflow to decide what to do. */
export async function describeContact(prisma: PrismaClient, organizationId: string, phoneE164: string, now: Date): Promise<ContactDescription> {
  const patients = await prisma.patient.findMany({
    where: { organizationId, phoneE164: { in: phoneCandidates(phoneE164) }, anonymizedAt: null },
    select: { id: true, name: true, doNotContact: true, guardianName: true },
    orderBy: { createdAt: "asc" },
  });
  if (patients.length === 0) return { known: false, optedOut: false, patients: [], upcoming: [], awaitingAnswer: null };

  const ids = patients.map((patient) => patient.id);
  const upcoming = await prisma.appointment.findMany({
    where: { organizationId, patientId: { in: ids }, status: { in: [...LIVE_STATUSES] }, startsAt: { gt: now } },
    include: { dentist: { select: { name: true } }, procedure: { select: { name: true } }, patient: { select: { name: true } } },
    orderBy: { startsAt: "asc" },
  });
  const campaign = await openCampaignMessage(prisma, ids, now);
  return {
    known: true,
    optedOut: patients.every((patient) => patient.doNotContact),
    patients: patients.map((patient) => ({ id: patient.id, firstName: firstName(patient.name), dependent: patient.guardianName !== null })),
    upcoming: upcoming.map((item) => ({
      id: item.id,
      startsAt: item.startsAt.toISOString(),
      status: item.status,
      dentist: item.dentist.name,
      procedure: item.procedure.name,
      patientFirstName: firstName(item.patient.name),
      rescheduleRequested: item.rescheduleRequestedAt !== null,
    })),
    awaitingAnswer: campaign ? "campaign" : upcoming.some((item) => item.status !== "PENDING") ? "appointment" : null,
  };
}
