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
  /** What was quoted (quote follow-ups only). */
  quoteDescription?: string;
}

const MAX_NAME_LENGTH = 60;
const MAX_QUOTE_LENGTH = 120;

/**
 * Names are typed by people (or arrive from WhatsApp) and end up inside a message sent from the
 * clinic's number, so they must not be able to add links, formatting or extra lines.
 */
export function sanitizeName(raw: string, maxLength = MAX_NAME_LENGTH): string {
  return raw
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ")
    .replace(/(https?:\/\/|www\.)\S*/gi, "")
    .replace(/\b[\w-]+(\.[\w-]+)+\/\S*/g, "")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
}

/** Blank line between paragraphs; WhatsApp renders *text* in bold. */
const PARAGRAPH = "\n\n";
const OPT_OUT_LINE = "Para não receber mais mensagens, responda *SAIR*.";
const QUOTE_ANSWER_BLOCK = ["Responda:", "*1* para falar com a equipe", "*2* para agora não"].join("\n");
const ANSWER_BLOCK = ["Responda:", "*1* para confirmar", "*2* para remarcar"].join("\n");

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

const join = (...paragraphs: string[]): string => paragraphs.join(PARAGRAPH);

/** Fixed pt-BR texts (no AI in the pilot). Rendered by the app so n8n flows stay generic. */
export function renderReminderMessage(raw: MessageInput): string {
  const input = {
    ...raw,
    clinicName: sanitizeName(raw.clinicName),
    dentistName: sanitizeName(raw.dentistName),
    procedureName: sanitizeName(raw.procedureName),
    quoteDescription: sanitizeName(raw.quoteDescription ?? "", MAX_QUOTE_LENGTH),
  };
  const { day, time } = when(input.startsAt);
  const hello = greeting(input.patientName);
  const clinic = `*${input.clinicName}*`;
  const slot = `${day} às ${time}`;
  const details = [`📅 ${slot}`, `🦷 ${input.procedureName}`, `👤 ${input.dentistName}`].join("\n");

  switch (input.kind) {
    case "CONFIRMATION":
      return join(hello, `Sua consulta na ${clinic} foi agendada.`, details, ANSWER_BLOCK, OPT_OUT_LINE);
    case "REMINDER_24H":
      return join(hello, `Lembrete: você tem consulta na ${clinic} amanhã.`, details, ANSWER_BLOCK, OPT_OUT_LINE);
    case "REMINDER_2H":
      return join(hello, `Sua consulta na ${clinic} é hoje.`, `⏰ ${time}\n👤 ${input.dentistName}`, "Até já!");
    case "REPLY_CONFIRMED":
      return join(hello, "Consulta confirmada ✅", details, "Até lá!");
    case "REPLY_RESCHEDULE":
      return join(
        hello,
        "Recebemos o seu pedido para remarcar.",
        `A equipe da ${clinic} entra em contato em breve para combinar um novo horário.`,
      );
    case "REPLY_OPTED_OUT":
      return join(
        hello,
        `Tudo certo: você não vai mais receber mensagens da ${clinic}.`,
        "Se mudar de ideia, é só falar com a clínica.",
      );
    case "REACTIVATION":
      return join(
        hello,
        `Faz um tempo desde o seu atendimento na ${clinic} (${input.procedureName}). Que tal agendar o seu retorno?`,
        ["Responda:", "*1* para agendar", "*2* para agora não"].join("\n"),
        OPT_OUT_LINE,
      );
    case "QUOTE_FOLLOWUP_1":
      return join(
        hello,
        `Passando para saber se ficou alguma dúvida sobre o orçamento *${input.quoteDescription}* na ${clinic}.`,
        QUOTE_ANSWER_BLOCK,
        OPT_OUT_LINE,
      );
    case "QUOTE_FOLLOWUP_2":
      return join(
        hello,
        `O seu orçamento *${input.quoteDescription}* na ${clinic} continua disponível. Quer conversar sobre as condições?`,
        QUOTE_ANSWER_BLOCK,
        OPT_OUT_LINE,
      );
    case "REPLY_INTERESTED":
      return join(hello, "Ótimo! 😊", `A equipe da ${clinic} entra em contato em breve.`);
    case "REPLY_DECLINED":
      return join(hello, "Tudo bem!", "Quando precisar, é só chamar. Cuide bem do seu sorriso! 🦷");
    case "NO_SHOW_FOLLOWUP":
      return join(
        hello,
        `Sentimos sua falta na consulta de ${slot} na ${clinic}.`,
        "Quer remarcar? Responda *2* e nossa equipe entra em contato.",
        OPT_OUT_LINE,
      );
  }
}
