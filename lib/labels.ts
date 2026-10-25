import type { AppointmentStatus, AuditAction, ReminderKind } from "@/generated/prisma/client";

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
  REMINDER_24H: "1º lembrete antes da consulta",
  REMINDER_2H: "2º lembrete antes da consulta",
  NO_SHOW_FOLLOWUP: "Convite para remarcar",
  REPLY_CONFIRMED: "Resposta: consulta confirmada",
  REPLY_RESCHEDULE: "Resposta: pedido de remarcação",
  REPLY_OPTED_OUT: "Resposta: descadastro",
  REACTIVATION: "Convite para voltar",
  REPLY_INTERESTED: "Resposta: quer agendar",
  REPLY_DECLINED: "Resposta: agora não",
  QUOTE_FOLLOWUP_1: "Orçamento: 1º contato",
  QUOTE_FOLLOWUP_2: "Orçamento: 2º contato",
  REPLY_HANDOFF: "Resposta: mensagem recebida",
  REPLY_AI: "Resposta do assistente",
  REPLY_MEDIA: "Resposta: áudio ou mídia recebida",
  REPLY_FLOW: "Atendimento: agendamento",
};

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  PATIENT_CREATED: "Paciente cadastrado",
  PATIENT_UPDATED: "Dados do paciente alterados",
  PATIENT_CONFIRMED: "Cadastro de paciente confirmado",
  CONSENT_RENEWED: "Mensagens liberadas de novo (novo consentimento)",
  PATIENT_OPTED_OUT: "Paciente pediu para não receber mensagens",
  PATIENT_EXPORTED: "Dados do paciente exportados",
  PATIENT_ANONYMIZED: "Dados do paciente apagados",
  APPOINTMENT_BOOKED: "Consulta agendada",
  APPOINTMENT_STATUS_CHANGED: "Situação da consulta alterada",
  APPOINTMENT_ANSWERED_BY_PATIENT: "Paciente respondeu pelo WhatsApp",
  QUOTE_CREATED: "Orçamento registrado",
  QUOTE_CLOSED: "Orçamento encerrado",
  SETTINGS_UPDATED: "Configurações de mensagens alteradas",
  WHATSAPP_CHANGED: "WhatsApp da clínica alterado",
  AI_SETTINGS_CHANGED: "Assistente de IA alterado",
  INBOUND_MESSAGE_HANDLED: "Mensagem de paciente respondida pela equipe",
  PATIENT_MESSAGE_ANSWERED_BY_AI: "Paciente respondido pelo assistente de IA",
  CONVERSATION_CLEARED: "Conversa do WhatsApp limpa pela equipe",
};
