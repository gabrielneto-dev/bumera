import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { clinicAi } from "@/lib/ai/clinic";
import type { AiClient } from "@/lib/ai/types";
import { maskPersonalData } from "@/lib/ai/mask";
import { cleanName, detectWhom, looksLikeBookingRequest, matchProcedure, parseChoice } from "@/lib/booking/text";
import * as say from "@/lib/booking/messages";
import { findNextSlots, type SlotOption } from "@/lib/booking/slots";
import { isUniqueViolation } from "@/lib/db-errors";
import { AppError } from "@/lib/errors";
import { phoneCandidates } from "@/lib/inbound/evolution";
import { queueFlowReply } from "@/lib/inbound/reply";
import { normalizeBrPhone } from "@/lib/phone";
import { startOfLocalDay } from "@/lib/reminders/send-window";
import { bookAppointment } from "@/lib/services/appointments";
import { createPatient } from "@/lib/services/patients";
import { makeSystemContext } from "@/lib/services/system";
import { scopedPrisma } from "@/lib/tenant-scope";
import type { ClinicMessage, InboundOutcome } from "@/lib/inbound/handle";

const CONVERSATION_TTL_MS = 24 * 3_600_000;
const MAX_MISSES = 3;
/** New first contacts a clinic welcomes per local day: a ceiling against someone flooding the number. */
const DAILY_NEW_CONVERSATIONS = 30;
const PAGE_SIZE = 3;
const MENU_LIMIT = 8;
const HUMAN_REQUEST = /\b(atendente|humano|pessoa|secretaria|falar com (a )?(equipe|alguem))\b/;

type Conversation = Prisma.ConversationGetPayload<object>;
interface StoredSlots {
  items: SlotOption[];
  hasMore: boolean;
}

const AI_PROCEDURE_CONFIDENCE = 0.8;

/** When the words do not name a procedure, the clinic's AI (if it opted in) may recognise what was meant. */
async function aiProcedure(
  prisma: PrismaClient,
  organizationId: string,
  override: AiClient | null | undefined,
  text: string,
  procedures: ReadonlyArray<{ id: string; name: string }>,
  clinic: string,
): Promise<string | null> {
  const ai = await clinicAi(prisma, organizationId, override);
  if (!ai) return null;
  try {
    const picked = await ai.pickProcedure({ clinicName: clinic, message: maskPersonalData(text, []).slice(0, 400), procedures: procedures.map((procedure) => procedure.name) });
    if (picked.choice === null || picked.confidence < AI_PROCEDURE_CONFIDENCE) return null;
    return procedures[picked.choice - 1]?.id ?? null;
  } catch {
    return null;
  }
}

/** What is still needed before slots can be offered, in the order the dialog asks for it. */
function missingStep(conv: Pick<Conversation, "procedureId" | "forSelf" | "personName" | "patientId" | "name">): "PROCEDURE" | "WHO" | "PERSON" | "NAME" | "SLOT" {
  if (!conv.procedureId) return "PROCEDURE";
  if (conv.forSelf === null) return "WHO";
  if (conv.forSelf === false && !conv.personName) return "PERSON";
  // The writer's own name: the patient's when the appointment is for them, the contact for the notices otherwise.
  if (!conv.patientId && !conv.name) return "NAME";
  return "SLOT";
}

const normalize = (text: string): string => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Closes conversations nobody answered for a day, erasing the name and slots they held. */
export async function expireStaleConversations(prisma: PrismaClient, now: Date): Promise<void> {
  await prisma.conversation.updateMany({
    where: { status: "OPEN", expiresAt: { lt: now } },
    data: { status: "EXPIRED", name: null, personName: null, slotOptions: Prisma.DbNull },
  });
}

/** A conversation also ends when the person opts out of messages. */
export async function closeOpenConversations(prisma: PrismaClient, organizationId: string, phones: string[]): Promise<void> {
  await prisma.conversation.updateMany({
    where: { organizationId, phoneE164: { in: phones }, status: "OPEN" },
    data: { status: "EXPIRED", name: null, personName: null, slotOptions: Prisma.DbNull },
  });
}

export async function findOpenConversation(prisma: PrismaClient, organizationId: string, phones: string[], now: Date): Promise<Conversation | null> {
  await expireStaleConversations(prisma, now);
  return prisma.conversation.findFirst({ where: { organizationId, phoneE164: { in: phones }, status: "OPEN" } });
}

async function clinicName(prisma: PrismaClient, organizationId: string): Promise<string> {
  return (await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } })).name;
}

/** Starts a conversation with a first contact (patient null) or with a patient who asked to book. */
export async function startConversation(prisma: PrismaClient, message: ClinicMessage, patient: { id: string } | null, now: Date, ai?: AiClient | null): Promise<InboundOutcome> {
  const { organizationId } = message;
  const startedToday = await prisma.conversation.count({ where: { organizationId, createdAt: { gte: startOfLocalDay(now) } } });
  if (startedToday >= DAILY_NEW_CONVERSATIONS) return { outcome: "IGNORED" };

  const procedures = await prisma.procedure.findMany({ where: { organizationId, active: true }, orderBy: { name: "asc" }, take: MENU_LIMIT });
  // One procedure to offer, or the first message already names exactly one: no need to show the menu.
  const clinic = await clinicName(prisma, organizationId);
  const named = procedures.length > 1 ? (matchProcedure(message.text, procedures) ?? (await aiProcedure(prisma, organizationId, ai, message.text, procedures, clinic))) : null;
  const only = procedures.length === 1 ? procedures[0] : procedures.find((procedure) => procedure.id === named);
  const whom = detectWhom(message.text);
  const start = { patientId: patient?.id ?? null, procedureId: only?.id ?? null, forSelf: whom === null ? null : whom === "self", personName: null, name: null };
  let created: Conversation;
  try {
    created = await prisma.conversation.create({
      data: {
        organizationId,
        phoneE164: message.phoneE164,
        patientId: start.patientId,
        procedureId: start.procedureId,
        forSelf: start.forSelf,
        step: missingStep(start),
        lastMessageId: message.messageId,
        expiresAt: new Date(now.getTime() + CONVERSATION_TTL_MS),
      },
    });
  } catch (error) {
    // Another delivery of the same message started it already.
    if (isUniqueViolation(error)) return { outcome: "IGNORED" };
    throw error;
  }
  if (procedures.length === 0) return handOff(prisma, created, message, now, clinic, "Pediu para marcar uma consulta (sem procedimentos cadastrados)");
  return prompt(prisma, created, message, now, clinic, procedures);
}

/** Says what the dialog needs next: a menu, a question, or the free slots. */
async function prompt(prisma: PrismaClient, conv: Conversation, message: ClinicMessage, now: Date, name: string, procedures?: ReadonlyArray<{ name: string }>): Promise<InboundOutcome> {
  switch (conv.step) {
    case "PROCEDURE": {
      const list = procedures ?? (await prisma.procedure.findMany({ where: { organizationId: conv.organizationId, active: true }, orderBy: { name: "asc" }, take: MENU_LIMIT }));
      return reply(prisma, conv, message, now, say.procedureMenu(name, list));
    }
    case "WHO":
      return reply(prisma, conv, message, now, say.askWho());
    case "PERSON":
      return reply(prisma, conv, message, now, say.askPerson());
    case "NAME":
      return reply(prisma, conv, message, now, conv.forSelf === false ? say.askGuardianName() : say.askName());
    case "SLOT":
      return offerSlots(prisma, conv, message, now, name, 0);
    case "CONFIRM":
      return reply(prisma, conv, message, now, say.slotMenu(readSlots(conv).items, readSlots(conv).hasMore));
  }
}

/** Applies one more message to an open conversation. */
export async function continueConversation(prisma: PrismaClient, message: ClinicMessage, conversation: Conversation, now: Date, ai?: AiClient | null): Promise<InboundOutcome> {
  if (conversation.lastMessageId === message.messageId) return { outcome: "IGNORED" };
  const name = await clinicName(prisma, conversation.organizationId);
  const text = message.text;
  const choice = parseChoice(text);

  if (choice === 0 || HUMAN_REQUEST.test(normalize(text))) return handOff(prisma, conversation, message, now, name, "Pediu para falar com a equipe durante o agendamento");

  switch (conversation.step) {
    case "PROCEDURE":
      return onProcedure(prisma, conversation, message, now, name, choice, ai);
    case "WHO":
      return onWho(prisma, conversation, message, now, name, choice);
    case "PERSON":
      return onPerson(prisma, conversation, message, now, name);
    case "NAME":
      return onName(prisma, conversation, message, now, name);
    case "SLOT":
      return onSlot(prisma, conversation, message, now, name, choice);
    case "CONFIRM":
      return onConfirm(prisma, conversation, message, now, name, choice);
  }
}

async function onProcedure(prisma: PrismaClient, conv: Conversation, message: ClinicMessage, now: Date, name: string, choice: number | null, ai?: AiClient | null): Promise<InboundOutcome> {
  const procedures = await prisma.procedure.findMany({ where: { organizationId: conv.organizationId, active: true }, orderBy: { name: "asc" }, take: MENU_LIMIT });
  const chosen =
    choice && choice >= 1 && choice <= procedures.length
      ? procedures[choice - 1]?.id
      : (matchProcedure(message.text, procedures) ?? (await aiProcedure(prisma, conv.organizationId, ai, message.text, procedures, name)));
  if (!chosen) return miss(prisma, conv, message, now, name, say.procedureMenu(name, procedures, false));
  const next = await advance(prisma, conv, message, { procedureId: chosen }, now);
  return prompt(prisma, next, message, now, name);
}

async function onWho(prisma: PrismaClient, conv: Conversation, message: ClinicMessage, now: Date, name: string, choice: number | null): Promise<InboundOutcome> {
  const whom = choice === 1 ? "self" : choice === 2 ? "other" : detectWhom(message.text);
  if (!whom) return miss(prisma, conv, message, now, name, say.askWho());
  const next = await advance(prisma, conv, message, { forSelf: whom === "self" }, now);
  return prompt(prisma, next, message, now, name);
}

async function onPerson(prisma: PrismaClient, conv: Conversation, message: ClinicMessage, now: Date, name: string): Promise<InboundOutcome> {
  const given = cleanName(message.text);
  if (!given) return miss(prisma, conv, message, now, name, say.askPerson());
  const next = await advance(prisma, conv, message, { personName: given }, now);
  return prompt(prisma, next, message, now, name);
}

async function onName(prisma: PrismaClient, conv: Conversation, message: ClinicMessage, now: Date, name: string): Promise<InboundOutcome> {
  const given = cleanName(message.text);
  if (!given) return miss(prisma, conv, message, now, name, conv.forSelf === false ? say.askGuardianName() : say.askName());
  const next = await advance(prisma, conv, message, { name: given }, now);
  return prompt(prisma, next, message, now, name);
}

async function onSlot(prisma: PrismaClient, conv: Conversation, message: ClinicMessage, now: Date, name: string, choice: number | null): Promise<InboundOutcome> {
  const offered = readSlots(conv);
  if (choice !== null && choice >= 1 && choice <= offered.items.length) {
    const slot = offered.items[choice - 1] as SlotOption;
    const next = await advance(prisma, conv, message, { chosenStartsAt: new Date(slot.startsAt), chosenDentistId: slot.dentistId, step: "CONFIRM" }, now);
    const procedure = await prisma.procedure.findUniqueOrThrow({ where: { id: conv.procedureId as string }, select: { name: true } });
    return reply(prisma, next, message, now, say.confirmation(slot, procedure.name, next.forSelf === false ? (next.personName ?? undefined) : undefined));
  }
  if (choice !== null && offered.hasMore && choice === offered.items.length + 1) {
    return offerSlots(prisma, conv, message, now, name, conv.slotOffset + PAGE_SIZE);
  }
  return miss(prisma, conv, message, now, name, say.slotMenu(offered.items, offered.hasMore));
}

async function onConfirm(prisma: PrismaClient, conv: Conversation, message: ClinicMessage, now: Date, name: string, choice: number | null): Promise<InboundOutcome> {
  if (choice === 2) {
    const next = await advance(prisma, conv, message, { step: "SLOT", chosenStartsAt: null, chosenDentistId: null }, now);
    const offered = readSlots(next);
    return reply(prisma, next, message, now, say.slotMenu(offered.items, offered.hasMore));
  }
  if (choice !== 1) {
    const offered = readSlots(conv);
    const slot = offered.items.find((item) => item.startsAt === conv.chosenStartsAt?.toISOString());
    const procedure = await prisma.procedure.findUniqueOrThrow({ where: { id: conv.procedureId as string }, select: { name: true } });
    return miss(prisma, conv, message, now, name, slot ? say.confirmation(slot, procedure.name, conv.forSelf === false ? (conv.personName ?? undefined) : undefined) : say.slotMenu(offered.items, offered.hasMore));
  }
  return book(prisma, conv, message, now, name);
}

/** Registers the patient if needed (a dependent when it is for someone else) and files the pending appointment. */
async function book(prisma: PrismaClient, conv: Conversation, message: ClinicMessage, now: Date, name: string): Promise<InboundOutcome> {
  const system = makeSystemContext(prisma, conv.organizationId, now);
  const phone = phoneCandidates(conv.phoneE164).map((candidate) => normalizeBrPhone(candidate)).find(Boolean);
  const forOther = conv.forSelf === false;
  let patientId = conv.patientId;

  if (forOther) {
    const guardian = conv.patientId ? (await prisma.patient.findUniqueOrThrow({ where: { id: conv.patientId }, select: { name: true } })).name : conv.name;
    if (!phone || !conv.personName || !guardian) return handOff(prisma, conv, message, now, name, "Quis marcar uma consulta para outra pessoa (dados incompletos)");
    // A returning dependent (same name, same contact phone) keeps their record instead of getting a second one.
    const existing = await prisma.patient.findFirst({
      where: { organizationId: conv.organizationId, phoneE164: { in: phoneCandidates(conv.phoneE164) }, guardianName: { not: null }, anonymizedAt: null, name: { equals: conv.personName, mode: "insensitive" } },
    });
    patientId = existing?.id ?? (await createPatient(system, { name: conv.personName, phone, consent: true }, { whatsapp: true, guardianName: guardian })).id;
  } else if (!patientId) {
    if (!phone || !conv.name) return handOff(prisma, conv, message, now, name, "Quis marcar uma consulta (dados incompletos)");
    patientId = (await createPatient(system, { name: conv.name, phone, consent: true }, { whatsapp: true })).id;
    await prisma.conversation.update({ where: { id: conv.id }, data: { patientId } });
  }

  const person = forOther ? (conv.personName ?? undefined) : undefined;
  try {
    const appointment = await bookAppointment(
      system,
      { patientId, dentistId: conv.chosenDentistId, procedureId: conv.procedureId, startsAt: conv.chosenStartsAt?.toISOString() },
      { pending: true },
    );
    const done = await prisma.conversation.update({
      where: { id: conv.id },
      data: { status: "DONE", appointmentId: appointment.id, name: null, personName: null, slotOptions: Prisma.DbNull, lastMessageId: message.messageId },
    });
    await reply(prisma, done, message, now, say.requested(name, person));
    return { outcome: "BOOKING_REQUESTED", appointmentId: appointment.id };
  } catch (error) {
    if (error instanceof AppError && ["SLOT_TAKEN", "PAST_APPOINTMENT", "OUTSIDE_WORKING_HOURS"].includes(error.code)) {
      const refreshed = await prisma.conversation.update({ where: { id: conv.id }, data: { step: "SLOT", chosenStartsAt: null, chosenDentistId: null } });
      return offerSlots(prisma, refreshed, message, now, name, 0, say.slotTaken());
    }
    throw error;
  }
}

function readSlots(conv: Conversation): StoredSlots {
  const stored = conv.slotOptions as StoredSlots | null;
  return stored ?? { items: [], hasMore: false };
}

async function offerSlots(prisma: PrismaClient, conv: Conversation, message: ClinicMessage, now: Date, name: string, offset: number, heading?: string): Promise<InboundOutcome> {
  const system = makeSystemContext(prisma, conv.organizationId, now);
  const page = await findNextSlots(system, { procedureId: conv.procedureId as string, offset, limit: PAGE_SIZE });
  if (page.slots.length === 0) {
    return handOff(prisma, conv, message, now, name, "Pediu um horário, mas não há horários livres nos próximos dias", say.noSlots(name));
  }
  const next = await advance(prisma, conv, message, { step: "SLOT", slotOffset: offset, slotOptions: { items: page.slots, hasMore: page.hasMore } as unknown as Prisma.InputJsonValue }, now);
  return reply(prisma, next, message, now, say.slotMenu(page.slots, page.hasMore, heading));
}

/** Saves the new state of the conversation and counts this message as seen. */
async function advance(prisma: PrismaClient, conv: Conversation, message: ClinicMessage, data: Prisma.ConversationUncheckedUpdateInput, now: Date): Promise<Conversation> {
  // Unless the caller says where to go, the next step is whatever is still missing after this answer.
  const merged = { ...conv, ...(data as Partial<Conversation>) };
  const step = data.step ?? missingStep(merged);
  return prisma.conversation.update({
    where: { id: conv.id },
    data: { ...data, step, misses: 0, lastMessageId: message.messageId, expiresAt: new Date(now.getTime() + CONVERSATION_TTL_MS) },
  });
}

/** An answer that is not one of the options: ask again, and after a few in a row call a person. */
async function miss(prisma: PrismaClient, conv: Conversation, message: ClinicMessage, now: Date, name: string, menu: string): Promise<InboundOutcome> {
  if (conv.misses + 1 >= MAX_MISSES) return handOff(prisma, conv, message, now, name, "Não conseguiu seguir o agendamento pelo WhatsApp");
  const next = await prisma.conversation.update({
    where: { id: conv.id },
    data: { misses: conv.misses + 1, lastMessageId: message.messageId, expiresAt: new Date(now.getTime() + CONVERSATION_TTL_MS) },
  });
  return reply(prisma, next, message, now, `${say.notUnderstood()}\n\n${menu}`);
}

/** Ends the conversation and leaves the person in the secretary's list, with the phone to call back. */
async function handOff(prisma: PrismaClient, conv: Conversation, message: ClinicMessage, now: Date, name: string, summary: string, text = say.handoff(name)): Promise<InboundOutcome> {
  const procedure = conv.procedureId ? await prisma.procedure.findUnique({ where: { id: conv.procedureId }, select: { name: true } }) : null;
  const db = scopedPrisma(prisma, conv.organizationId);
  await db.$transaction(async (tx) => {
    await tx.conversation.update({ where: { id: conv.id }, data: { status: "HANDED_OFF", name: null, personName: null, slotOptions: Prisma.DbNull, lastMessageId: message.messageId } });
    await tx.inboundMessage.upsert({
      where: { organizationId_messageId: { organizationId: conv.organizationId, messageId: `conversation-${conv.id}` } },
      update: {},
      create: {
        organizationId: conv.organizationId,
        patientId: conv.patientId,
        phoneE164: conv.phoneE164,
        messageId: `conversation-${conv.id}`,
        text: `${summary}${procedure ? ` (procedimento: ${procedure.name})` : ""}.`,
        reason: "UNRECOGNIZED",
      },
    });
    await queueFlowReply(tx, { organizationId: conv.organizationId, conversationId: conv.id, replyToMessageId: message.messageId, text }, now);
  });
  return { outcome: "HANDOFF" };
}

async function reply(prisma: PrismaClient, conv: Conversation, message: ClinicMessage, now: Date, text: string): Promise<InboundOutcome> {
  await queueFlowReply(scopedPrisma(prisma, conv.organizationId), { organizationId: conv.organizationId, conversationId: conv.id, replyToMessageId: message.messageId, text }, now);
  return { outcome: "CONVERSATION" };
}

export { looksLikeBookingRequest };
