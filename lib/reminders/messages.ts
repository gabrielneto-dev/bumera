import { stripTitle } from "@/lib/initials";
import { CLINIC_TIME_ZONE } from "@/lib/schedule";

/** Answers to a patient's own message; sent by the n8n workflows with the text the API returns. */
export type AnswerKind = "REPLY_CONFIRMED" | "REPLY_RESCHEDULE" | "REPLY_OPTED_OUT" | "REPLY_INTERESTED" | "REPLY_DECLINED";

export interface MessageInput {
  kind: AnswerKind;
  clinicName: string;
  patientName: string;
  /** ISO instant. */
  startsAt: string;
  dentistName: string;
  procedureName: string;
  /** An extra line added by the app to an answer (e.g. other appointments still waiting). */
  freeText?: string;
  /** For a dependent: who answers for the patient. Messages are addressed to them and speak of the patient. */
  guardianName?: string;
}

const MAX_NAME_LENGTH = 60;
export const MAX_QUOTE_LENGTH = 120;
const MAX_FREE_TEXT_LENGTH = 800;

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

/** "sábado, 17/10" and "09:00" in the clinic's time zone. */
export function dayAndTime(iso: string): { day: string; time: string } {
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

/** "terça-feira, 20/10 às 10:00": how a slot is shown to a patient. */
export function formatSlot(iso: string): string {
  const { day, time } = dayAndTime(iso);
  return `${day} às ${time}`;
}

export function firstName(patientName: string): string {
  return stripTitle(sanitizeName(patientName)).split(/\s+/)[0] ?? "";
}

function greeting(patientName: string): string {
  const first = firstName(patientName);
  return first ? `Olá, ${first}!` : "Olá!";
}

/**
 * Free text written by an AI is untrusted: paragraphs are kept, but links, formatting characters and
 * control characters are removed and the length is capped.
 */
export function sanitizeParagraphs(raw: string, maxLength = MAX_FREE_TEXT_LENGTH): string {
  return raw
    .split(/\n\s*\n/)
    .map((paragraph) => sanitizeName(paragraph, maxLength))
    .filter(Boolean)
    .join(PARAGRAPH)
    .slice(0, maxLength)
    .trim();
}

/** An optional last line added by the app (e.g. other appointments still waiting), kept short and without links. */
const extraLine = (text: string | undefined): string => sanitizeParagraphs(text ?? "", 200);

const join = (...paragraphs: string[]): string => paragraphs.join(PARAGRAPH);

/**
 * Fixed pt-BR answers to a patient's own message, returned by `/answers`. The reminder texts
 * themselves live in the n8n workflow "Bumera - Lembretes por WhatsApp (v2)".
 */
export function renderAnswerMessage(raw: MessageInput): string {
  const input = {
    ...raw,
    clinicName: sanitizeName(raw.clinicName),
    dentistName: sanitizeName(raw.dentistName),
    procedureName: sanitizeName(raw.procedureName),
  };
  const { day, time } = dayAndTime(input.startsAt);
  const guardian = sanitizeName(raw.guardianName ?? "");
  const dependent = guardian !== "";
  // For a dependent the greeting goes to the person who answers, and the text speaks of the patient.
  const hello = greeting(dependent ? guardian : input.patientName);
  const who = firstName(input.patientName);
  const clinic = `*${input.clinicName}*`;
  const details = [`📅 ${day} às ${time}`, `🦷 ${input.procedureName}`, `👤 ${input.dentistName}`].join("\n");

  switch (input.kind) {
    case "REPLY_CONFIRMED":
      return join(...[hello, dependent ? `Consulta de *${who}* confirmada ✅` : "Consulta confirmada ✅", details, "Até lá!", extraLine(raw.freeText)].filter(Boolean));
    case "REPLY_RESCHEDULE":
      return join(
        hello,
        dependent ? `Recebemos o pedido para remarcar a consulta de *${who}*.` : "Recebemos o seu pedido para remarcar.",
        `A equipe da ${clinic} entra em contato em breve para combinar um novo horário.`,
      );
    case "REPLY_OPTED_OUT":
      return join(
        hello,
        `Tudo certo: você não vai mais receber mensagens da ${clinic}.`,
        "Se mudar de ideia, é só falar com a clínica.",
      );
    case "REPLY_INTERESTED":
      return join(hello, "Ótimo! 😊", `A equipe da ${clinic} entra em contato em breve.`);
    case "REPLY_DECLINED":
      return join(hello, "Tudo bem!", "Quando precisar, é só chamar. Cuide bem do seu sorriso! 🦷");
  }
}
