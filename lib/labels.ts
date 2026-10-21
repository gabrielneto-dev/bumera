import type { AppointmentStatus, ReminderKind } from "@/generated/prisma/client";

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

export const REMINDER_KIND_LABEL: Record<ReminderKind, string> = {
  CONFIRMATION: "Confirmação do agendamento",
  REMINDER_24H: "Lembrete de 24h",
  REMINDER_2H: "Lembrete de 2h",
  NO_SHOW_FOLLOWUP: "Convite para remarcar",
  REPLY_CONFIRMED: "Resposta: consulta confirmada",
  REPLY_RESCHEDULE: "Resposta: pedido de remarcação",
  REPLY_OPTED_OUT: "Resposta: descadastro",
  REACTIVATION: "Convite para voltar",
  REPLY_INTERESTED: "Resposta: quer agendar",
  REPLY_DECLINED: "Resposta: agora não",
  QUOTE_FOLLOWUP_1: "Orçamento: 1º contato",
  QUOTE_FOLLOWUP_2: "Orçamento: 2º contato",
};
