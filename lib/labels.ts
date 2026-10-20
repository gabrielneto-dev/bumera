import type { AppointmentStatus } from "@/generated/prisma/client";

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  PENDING: "Pendente",
  SCHEDULED: "Agendada",
  CONFIRMED: "Confirmada",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
  NO_SHOW: "Faltou",
};

/** Sunday = 0, matching the dentist.workDays convention. */
export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

export function describeWorkDays(days: readonly number[]): string {
  return [...days].sort((a, b) => a - b).map((day) => WEEKDAY_LABELS[day]).join(", ");
}
