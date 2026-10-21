import type { ReminderKind } from "@/generated/prisma/client";
import { stripTitle } from "@/lib/initials";
import { CLINIC_TIME_ZONE } from "@/lib/schedule";

export interface MessageInput {
  kind: ReminderKind;
  clinicName: string;
  patientName: string;
  /** ISO instant. */
  startsAt: string;
  dentistName: string;
  procedureName: string;
}

const MAX_NAME_LENGTH = 60;

/**
 * Names are typed by people (or arrive from WhatsApp) and end up inside a message sent from the
 * clinic's number, so they must not be able to add links, formatting or extra lines.
 */
export function sanitizeName(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ")
    .replace(/(https?:\/\/|www\.)\S*/gi, "")
    .replace(/\b[\w-]+(\.[\w-]+)+\/\S*/g, "")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
}

const OPT_OUT_LINE = "Para não receber mais mensagens, responda SAIR.";
const ANSWER_LINE = "Responda 1 para confirmar ou 2 para remarcar.";

function when(iso: string): { day: string; time: string } {
  const date = new Date(iso);
  const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone: CLINIC_TIME_ZONE, weekday: "long" }).format(date);
  const dayMonth = new Intl.DateTimeFormat("pt-BR", {
    timeZone: CLINIC_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
  }).format(date);
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone: CLINIC_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return { day: `${weekday}, ${dayMonth}`, time };
}

export function firstName(patientName: string): string {
  return stripTitle(sanitizeName(patientName)).split(/\s+/)[0] ?? "";
}

function greeting(patientName: string): string {
  const first = firstName(patientName);
  return first ? `Olá, ${first}!` : "Olá!";
}

/** Fixed pt-BR texts (no AI in the pilot). Rendered by the app so n8n flows stay generic. */
export function renderReminderMessage(raw: MessageInput): string {
  const input = {
    ...raw,
    clinicName: sanitizeName(raw.clinicName),
    dentistName: sanitizeName(raw.dentistName),
    procedureName: sanitizeName(raw.procedureName),
  };
  const { day, time } = when(input.startsAt);
  const hello = greeting(input.patientName);
  const slot = `${day} às ${time}`;

  switch (input.kind) {
    case "CONFIRMATION":
      return `${hello} Sua consulta na ${input.clinicName} foi agendada para ${slot}, com ${input.dentistName} (${input.procedureName}). ${ANSWER_LINE} ${OPT_OUT_LINE}`;
    case "REMINDER_24H":
      return `${hello} Lembrete: sua consulta na ${input.clinicName} é ${slot}, com ${input.dentistName}. ${ANSWER_LINE} ${OPT_OUT_LINE}`;
    case "REMINDER_2H":
      return `${hello} Sua consulta na ${input.clinicName} é hoje às ${time}, com ${input.dentistName}. Até já!`;
    case "REPLY_CONFIRMED":
      return `${hello} Consulta confirmada: ${slot}, com ${input.dentistName}. Até lá!`;
    case "REPLY_RESCHEDULE":
      return `${hello} Recebemos o seu pedido para remarcar. A equipe da ${input.clinicName} entra em contato em breve para combinar um novo horário.`;
    case "REPLY_OPTED_OUT":
      return `${hello} Tudo certo: você não vai mais receber mensagens da ${input.clinicName}. Se mudar de ideia, é só falar com a clínica.`;
    case "NO_SHOW_FOLLOWUP":
      return `${hello} Sentimos sua falta na consulta de ${slot} na ${input.clinicName}. Quer remarcar? Responda 2 para remarcar e nossa equipe entra em contato. ${OPT_OUT_LINE}`;
  }
}
