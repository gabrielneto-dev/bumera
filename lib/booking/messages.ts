import type { SlotOption } from "@/lib/booking/slots";
import { formatSlot, sanitizeName } from "@/lib/reminders/messages";

const PARAGRAPH = "\n\n";
const OPTION_TALK = "*0* Falar com a equipe";
const join = (...parts: string[]): string => parts.join(PARAGRAPH);
const clean = (text: string): string => sanitizeName(text);

/** The texts of the booking dialog: fixed wording around sanitized names and real slots. */
export function procedureMenu(clinicName: string, procedures: ReadonlyArray<{ name: string }>, intro = true): string {
  const options = procedures.map((procedure, index) => `*${index + 1}* ${clean(procedure.name)}`).join("\n");
  const welcome = intro ? `Olá! Aqui é o atendimento da *${clean(clinicName)}*. Vou te ajudar a pedir um horário.` : "";
  return join(...[welcome, `Qual procedimento você procura?\n${options}`, OPTION_TALK].filter(Boolean));
}

export const askName = (): string => "Perfeito! Qual é o seu nome completo?";

export function slotMenu(slots: readonly SlotOption[], hasMore: boolean, heading = "Estes são os próximos horários livres:"): string {
  const lines = slots.map((slot, index) => `*${index + 1}* ${formatSlot(slot.startsAt)} (${clean(slot.dentistName)})`);
  if (hasMore) lines.push(`*${slots.length + 1}* Ver outros horários`);
  return join(heading, lines.join("\n"), OPTION_TALK);
}

export function confirmation(slot: SlotOption, procedureName: string): string {
  const details = [`📅 ${formatSlot(slot.startsAt)}`, `🦷 ${clean(procedureName)}`, `👤 ${clean(slot.dentistName)}`].join("\n");
  return join(
    "Confere o seu pedido:",
    details,
    "Responda:\n*1* para confirmar e aceitar receber lembretes por WhatsApp\n*2* para escolher outro horário",
    OPTION_TALK,
  );
}

export const requested = (clinicName: string): string =>
  join("Pedido recebido! ✅", `A equipe da *${clean(clinicName)}* vai confirmar o seu horário em breve e avisamos por aqui.`);

export const slotTaken = (): string => "Esse horário acabou de ser ocupado. Veja outras opções:";

export const noSlots = (clinicName: string): string =>
  join("No momento não encontrei horários livres nos próximos dias.", `A equipe da *${clean(clinicName)}* vai entrar em contato para combinar o melhor horário.`);

export const handoff = (clinicName: string): string =>
  join("Tudo bem!", `A equipe da *${clean(clinicName)}* vai falar com você em breve.`);

export const notUnderstood = (): string => "Não entendi. Responda com o número de uma das opções, por favor.";
