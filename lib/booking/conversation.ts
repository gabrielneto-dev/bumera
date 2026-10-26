import { type AiEventKind, Prisma, type PrismaClient } from "@/generated/prisma/client";
import { clinicAi } from "@/lib/ai/clinic";
import { maskPersonalData } from "@/lib/ai/mask";
import { recordAiEvent } from "@/lib/ai/events";
import type { AiClient, SlotPreference, AiPhraseInput, AiTurn, AiTurnInput } from "@/lib/ai/types";
import { trusted, validateAnswer, validatePhrase } from "@/lib/booking/fluid";
import * as say from "@/lib/booking/messages";
import { findNextSlots, type SlotOption } from "@/lib/booking/slots";
import { cleanName, detectWhom, greetingOf, isAffirmation, isGreeting, looksLikeBookingRequest, matchProcedure, parseChoice, withGreeting } from "@/lib/booking/text";
import { isUniqueViolation } from "@/lib/db-errors";
import { AppError } from "@/lib/errors";
import { phoneCandidates } from "@/lib/inbound/evolution";
import type { ClinicMessage, InboundOutcome } from "@/lib/inbound/handle";
import { looksLikeInjection } from "@/lib/inbound/injection";
import { queueFlowReply } from "@/lib/inbound/reply";
import { isUrgent } from "@/lib/inbound/urgent";
import { normalizeBrPhone } from "@/lib/phone";
import { formatSlot, sanitizeName } from "@/lib/reminders/messages";
import { startOfLocalDay } from "@/lib/reminders/send-window";
import { bookAppointment } from "@/lib/services/appointments";
import { createPatient } from "@/lib/services/patients";
import { makeSystemContext } from "@/lib/services/system";
import { scopedPrisma } from "@/lib/tenant-scope";

const CONVERSATION_TTL_MS = 24 * 3_600_000;
const MAX_MISSES = 3;
/** New first contacts a clinic welcomes per local day: a ceiling against someone flooding the number. */
const DAILY_NEW_CONVERSATIONS = 30;
/** AI calls (reading answers, writing questions) per conversation and per clinic per day: a cost and abuse ceiling. */
const MAX_CONVERSATION_AI_CALLS = 40;
const DAILY_AI_CALLS = 400;
const PAGE_SIZE = 3;
const MENU_LIMIT = 8;
const MAX_AI_MESSAGE_LENGTH = 400;
const HUMAN_REQUEST = /\b(atendente|humano|secretaria|pessoa de verdade|falar com (a |uma )?(equipe|alguem|pessoa))\b/;
const QUESTION_WORD = /^(qual|quais|quanto|quando|onde|como|tem|voces|aceita|atende|que horas|a que horas)\b/;

type Conversation = Prisma.ConversationGetPayload<object>;
type Step = Conversation["step"];
interface StoredSlots {
  items: SlotOption[];
  hasMore: boolean;
  /** The day/time of day the person asked for; kept so "ver outros" stays within it. */
  prefer?: SlotPreference;
}

/** Everything one incoming message needs while it is handled. */
interface Turn {
  prisma: PrismaClient;
  message: ClinicMessage;
  now: Date;
  clinic: string;
  info: string;
  /** The clinic's AI, or null: not opted in, no key, ceiling reached or it failed during this message. Then the dialog uses its fixed texts. */
  ai: AiClient | null;
  /** AI calls made for this message, added to the conversation's count when the reply is queued. */
  calls: number;
  /** Answer to a side question, said before the next question. */
  aside: string | null;
  /** First message of the conversation. */
  greet: boolean;
}

const normalize = (text: string): string => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** What is still needed before slots can be offered, in the order the dialog asks for it. */
function missingStep(conv: Pick<Conversation, "procedureId" | "forSelf" | "personName" | "patientId" | "name">): "PROCEDURE" | "WHO" | "PERSON" | "NAME" | "SLOT" {
  if (!conv.procedureId) return "PROCEDURE";
  if (conv.forSelf === null) return "WHO";
  if (conv.forSelf === false && !conv.personName) return "PERSON";
  // The writer's own name: the patient's when the appointment is for them, the contact for the notices otherwise.
  if (!conv.patientId && !conv.name) return "NAME";
  return "SLOT";
}

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

async function openTurn(prisma: PrismaClient, message: ClinicMessage, now: Date, override: AiClient | null | undefined, conv: Conversation | null): Promise<Turn> {
  const { organizationId } = message;
  const [organization, settings] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } }),
    prisma.clinicSettings.findUnique({ where: { organizationId }, select: { clinicInfo: true } }),
  ]);
  let ai = await clinicAi(prisma, organizationId, override);
  if (ai && conv && conv.aiCalls >= MAX_CONVERSATION_AI_CALLS) ai = null;
  if (ai) {
    const spent = await prisma.conversation.aggregate({ _sum: { aiCalls: true }, where: { organizationId, updatedAt: { gte: startOfLocalDay(now) } } });
    if ((spent._sum.aiCalls ?? 0) >= DAILY_AI_CALLS) ai = null;
  }
  return { prisma, message, now, clinic: organization.name, info: settings?.clinicInfo ?? "", ai, calls: 0, aside: null, greet: conv === null };
}

const track = (turn: Turn, kind: AiEventKind): Promise<void> => recordAiEvent(turn.prisma, turn.message.organizationId, kind);

/** Reads a free-text message with the AI. Any failure turns the AI off for the rest of this message. */
async function understand(turn: Turn, conv: Pick<Conversation, "forSelf"> & { step: Step }, extra: { procedures: readonly string[]; chosenProcedure: string | null; slots: StoredSlots }): Promise<AiTurn | null> {
  if (!turn.ai || looksLikeInjection(turn.message.text)) return null;
  const input: AiTurnInput = {
    clinicName: turn.clinic,
    clinicInfo: turn.info,
    step: conv.step,
    message: maskPersonalData(turn.message.text, []).slice(0, MAX_AI_MESSAGE_LENGTH),
    procedures: extra.procedures,
    slots: extra.slots.items.map(slotFact),
    hasMoreSlots: extra.slots.hasMore,
    chosenProcedure: extra.chosenProcedure,
    forSelf: conv.forSelf,
  };
  try {
    turn.calls += 1;
    const read = await turn.ai.understandTurn(input);
    const sure = trusted(read);
    await track(turn, sure ? "TURN_READ" : "TURN_UNSURE");
    const proposed = sure?.answer ?? null;
    const aside = sure ? validateAnswer(read.answer, turn.info) : null;
    if (proposed) await track(turn, aside ? "ASIDE_ANSWERED" : "ASIDE_REJECTED");
    if (aside) turn.aside = aside;
    return sure ?? (read.human ? read : null);
  } catch {
    turn.ai = null;
    await track(turn, "TURN_FAILED");
    return null;
  }
}

const slotFact = (slot: SlotOption): string => `${formatSlot(slot.startsAt)} com ${sanitizeName(slot.dentistName)}`;

async function listProcedures(prisma: PrismaClient, organizationId: string): Promise<Array<{ id: string; name: string }>> {
  return prisma.procedure.findMany({ where: { organizationId, active: true }, orderBy: { name: "asc" }, take: MENU_LIMIT, select: { id: true, name: true } });
}

const hintedProcedure = (hint: AiTurn | null, procedures: ReadonlyArray<{ id: string }>): string | null => (hint?.procedure ? (procedures[hint.procedure - 1]?.id ?? null) : null);

/** Starts a conversation with a first contact (patient null) or with a patient who asked to book. */
export async function startConversation(prisma: PrismaClient, message: ClinicMessage, patient: { id: string } | null, now: Date, ai?: AiClient | null): Promise<InboundOutcome> {
  const { organizationId } = message;
  const startedToday = await prisma.conversation.count({ where: { organizationId, createdAt: { gte: startOfLocalDay(now) } } });
  if (startedToday >= DAILY_NEW_CONVERSATIONS) return { outcome: "IGNORED" };

  const procedures = await listProcedures(prisma, organizationId);
  const turn = await openTurn(prisma, message, now, ai, null);
  // One procedure to offer, or the first message already names exactly one: no need to ask.
  // A plain hello asks nothing yet: it gets an open question, not the first step of a form.
  const greeting = isGreeting(message.text);
  let procedureId = greeting ? null : procedures.length === 1 ? (procedures[0]?.id ?? null) : matchProcedure(message.text, procedures);
  let whom = greeting ? null : detectWhom(message.text);
  if (!greeting && procedures.length > 0 && (procedureId === null || whom === null)) {
    const hint = await understand(turn, { step: "PROCEDURE", forSelf: null }, { procedures: procedures.map((item) => item.name), chosenProcedure: null, slots: { items: [], hasMore: false } });
    procedureId ??= hintedProcedure(hint, procedures);
    whom ??= hint?.whom ?? null;
  }
  const start = { patientId: patient?.id ?? null, procedureId, forSelf: whom === null ? null : whom === "self", personName: null, name: null };
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
  if (isUrgent(message.text)) return handOff(turn, created, "Pediu para marcar, mas a mensagem parece urgente", undefined, "URGENT");
  if (procedures.length === 0) return handOff(turn, created, "Pediu para marcar uma consulta (sem procedimentos cadastrados)");
  if (greeting) return reply(turn, created, await speak(turn, created, { open: true }));
  return prompt(turn, created);
}

/** Says what the dialog needs next: a question, or the free slots. */
async function prompt(turn: Turn, conv: Conversation): Promise<InboundOutcome> {
  if (conv.step === "SLOT") return offerSlots(turn, conv, 0);
  return reply(turn, conv, await speak(turn, conv));
}

/** Applies one more message to an open conversation. */
export async function continueConversation(prisma: PrismaClient, message: ClinicMessage, conversation: Conversation, now: Date, ai?: AiClient | null): Promise<InboundOutcome> {
  if (conversation.lastMessageId === message.messageId) return { outcome: "IGNORED" };
  const turn = await openTurn(prisma, message, now, ai, conversation);
  const text = message.text;
  const choice = parseChoice(text);

  if (choice === 0 || HUMAN_REQUEST.test(normalize(text))) return handOff(turn, conversation, "Pediu para falar com a equipe durante o agendamento");
  if (isUrgent(text)) return handOff(turn, conversation, "Escreveu algo urgente durante o agendamento", undefined, "URGENT");

  // Another hello is not a wrong answer: ask the same thing again, kindly, without counting a miss.
  if (choice === null && isGreeting(text)) {
    const next = await turn.prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageId: message.messageId, expiresAt: new Date(now.getTime() + CONVERSATION_TTL_MS) } });
    return reply(turn, next, await speak(turn, next, { open: next.step === "PROCEDURE" && next.procedureId === null }));
  }

  // A bare number answers a menu; a plain name answers a name question. Anything else is read by the AI, if the clinic has one.
  const isPlainName = (conversation.step === "PERSON" || conversation.step === "NAME") && cleanName(text) !== null && !QUESTION_WORD.test(normalize(text));
  const needsReading = choice === null && !isPlainName && turn.ai !== null;
  const procedures = needsReading || conversation.step === "PROCEDURE" ? await listProcedures(prisma, conversation.organizationId) : [];
  const chosen = procedures.find((item) => item.id === conversation.procedureId);
  const hint = needsReading
    ? await understand(turn, conversation, { procedures: procedures.map((item) => item.name), chosenProcedure: chosen?.name ?? null, slots: readSlots(conversation) })
    : null;
  if (hint?.human) return handOff(turn, conversation, "Pediu para falar com a equipe durante o agendamento");

  switch (conversation.step) {
    case "PROCEDURE":
      return onProcedure(turn, conversation, procedures, choice, hint);
    case "WHO":
      return onWho(turn, conversation, choice, hint);
    case "PERSON":
      return onPerson(turn, conversation);
    case "NAME":
      return onName(turn, conversation);
    case "SLOT":
      return onSlot(turn, conversation, choice, hint);
    case "CONFIRM":
      return onConfirm(turn, conversation, choice, hint);
  }
}

async function onProcedure(turn: Turn, conv: Conversation, procedures: Array<{ id: string }>, choice: number | null, hint: AiTurn | null): Promise<InboundOutcome> {
  const text = turn.message.text;
  const procedureId = choice && choice >= 1 && choice <= procedures.length ? procedures[choice - 1]?.id : (matchProcedure(text, procedures as Array<{ id: string; name: string }>) ?? hintedProcedure(hint, procedures));
  const whom = conv.forSelf === null ? (detectWhom(text) ?? hint?.whom ?? null) : null;
  const patch: Prisma.ConversationUncheckedUpdateInput = {};
  // "Quero marcar" or a plain yes to the one procedure on offer: that procedure. With several, the list to pick from.
  const saidYes = isAffirmation(text) || hint?.confirm === "yes";
  if (!procedureId && choice === null && (looksLikeBookingRequest(text) || (saidYes && procedures.length === 1))) {
    if (procedures.length === 1) patch.procedureId = (procedures[0] as { id: string }).id;
    else return prompt(turn, await advance(turn, conv, {}));
  }
  if (procedureId) patch.procedureId = procedureId;
  if (whom) patch.forSelf = whom === "self";
  if (Object.keys(patch).length === 0) return stuck(turn, conv);
  return prompt(turn, await advance(turn, conv, patch));
}

async function onWho(turn: Turn, conv: Conversation, choice: number | null, hint: AiTurn | null): Promise<InboundOutcome> {
  const whom = choice === 1 ? "self" : choice === 2 ? "other" : (detectWhom(turn.message.text) ?? hint?.whom ?? null);
  if (!whom) return stuck(turn, conv);
  return prompt(turn, await advance(turn, conv, { forSelf: whom === "self" }));
}

async function onPerson(turn: Turn, conv: Conversation): Promise<InboundOutcome> {
  const given = cleanName(turn.message.text);
  if (!given) return stuck(turn, conv);
  return prompt(turn, await advance(turn, conv, { personName: given }));
}

async function onName(turn: Turn, conv: Conversation): Promise<InboundOutcome> {
  const given = cleanName(turn.message.text);
  if (!given) return stuck(turn, conv);
  return prompt(turn, await advance(turn, conv, { name: given }));
}

/** The position (from 1) of the time a message picks, "more" for other times, or null. */
function pickedSlot(offered: StoredSlots, choice: number | null, hint: AiTurn | null, allowMore: boolean): number | "more" | null {
  if (choice !== null) {
    if (choice >= 1 && choice <= offered.items.length) return choice;
    return allowMore && offered.hasMore && choice === offered.items.length + 1 ? "more" : null;
  }
  const said = hint?.slot ?? null;
  if (typeof said === "number") return said >= 1 && said <= offered.items.length ? said : null;
  return said === "more" && allowMore && offered.hasMore ? "more" : null;
}

async function onSlot(turn: Turn, conv: Conversation, choice: number | null, hint: AiTurn | null): Promise<InboundOutcome> {
  const offered = readSlots(conv);
  const picked = pickedSlot(offered, choice, hint, true);
  if (picked === "more") return offerSlots(turn, conv, conv.slotOffset + PAGE_SIZE);
  if (picked === null) return hint?.prefer ? offerSlots(turn, conv, 0, { prefer: hint.prefer }) : stuck(turn, conv);
  return confirmSlot(turn, conv, offered.items[picked - 1] as SlotOption);
}

async function confirmSlot(turn: Turn, conv: Conversation, slot: SlotOption): Promise<InboundOutcome> {
  const next = await advance(turn, conv, { chosenStartsAt: new Date(slot.startsAt), chosenDentistId: slot.dentistId, step: "CONFIRM" });
  return reply(turn, next, await speak(turn, next));
}

async function onConfirm(turn: Turn, conv: Conversation, choice: number | null, hint: AiTurn | null): Promise<InboundOutcome> {
  const decision = choice === 1 ? "yes" : choice === 2 ? "no" : (hint?.confirm ?? null);
  if (decision === "yes") return book(turn, conv);
  // Naming another of the offered times instead of answering changes the choice.
  const other = decision === null ? pickedSlot(readSlots(conv), null, hint, false) : null;
  if (typeof other === "number") return confirmSlot(turn, conv, readSlots(conv).items[other - 1] as SlotOption);
  if (typeof other !== "number" && hint?.prefer) return offerSlots(turn, conv, 0, { prefer: hint.prefer });
  if (decision === "no") {
    const next = await advance(turn, conv, { step: "SLOT", chosenStartsAt: null, chosenDentistId: null });
    return reply(turn, next, await speak(turn, next));
  }
  return stuck(turn, conv);
}

/** Registers the patient if needed (a dependent when it is for someone else) and files the pending appointment. */
async function book(turn: Turn, conv: Conversation): Promise<InboundOutcome> {
  const { prisma } = turn;
  const system = makeSystemContext(prisma, conv.organizationId, turn.now);
  const phone = phoneCandidates(conv.phoneE164).map((candidate) => normalizeBrPhone(candidate)).find(Boolean);
  const forOther = conv.forSelf === false;
  let patientId = conv.patientId;

  if (forOther) {
    const guardian = conv.patientId ? (await prisma.patient.findUniqueOrThrow({ where: { id: conv.patientId }, select: { name: true } })).name : conv.name;
    if (!phone || !conv.personName || !guardian) return handOff(turn, conv, "Quis marcar uma consulta para outra pessoa (dados incompletos)");
    // A returning dependent (same name, same contact phone) keeps their record instead of getting a second one.
    const existing = await prisma.patient.findFirst({
      where: { organizationId: conv.organizationId, phoneE164: { in: phoneCandidates(conv.phoneE164) }, guardianName: { not: null }, anonymizedAt: null, name: { equals: conv.personName, mode: "insensitive" } },
    });
    patientId = existing?.id ?? (await createPatient(system, { name: conv.personName, phone, consent: true }, { whatsapp: true, guardianName: guardian })).id;
  } else if (!patientId) {
    if (!phone || !conv.name) return handOff(turn, conv, "Quis marcar uma consulta (dados incompletos)");
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
      data: { status: "DONE", appointmentId: appointment.id, name: null, personName: null, slotOptions: Prisma.DbNull, lastMessageId: turn.message.messageId },
    });
    await reply(turn, done, await speak(turn, done, { done: true, person }));
    return { outcome: "BOOKING_REQUESTED", appointmentId: appointment.id };
  } catch (error) {
    if (error instanceof AppError && ["SLOT_TAKEN", "PAST_APPOINTMENT", "OUTSIDE_WORKING_HOURS"].includes(error.code)) {
      const refreshed = await prisma.conversation.update({ where: { id: conv.id }, data: { step: "SLOT", chosenStartsAt: null, chosenDentistId: null } });
      return offerSlots(turn, refreshed, 0, { slotTaken: true });
    }
    throw error;
  }
}

function readSlots(conv: Conversation): StoredSlots {
  const stored = conv.slotOptions as StoredSlots | null;
  return stored ?? { items: [], hasMore: false };
}

async function offerSlots(turn: Turn, conv: Conversation, offset: number, options: { slotTaken?: boolean; prefer?: SlotPreference } = {}): Promise<InboundOutcome> {
  const system = makeSystemContext(turn.prisma, conv.organizationId, turn.now);
  const asked = options.prefer ?? readSlots(conv).prefer;
  const procedureId = conv.procedureId as string;
  let prefer = asked;
  let page = await findNextSlots(system, { procedureId, offset, limit: PAGE_SIZE, preference: prefer });
  // Nothing free as asked: say so and show the nearest times instead of leaving the person with nothing.
  const unmatched = page.slots.length === 0 && prefer !== undefined && offset === 0;
  if (unmatched) {
    prefer = undefined;
    page = await findNextSlots(system, { procedureId, offset: 0, limit: PAGE_SIZE });
  }
  if (page.slots.length === 0) {
    return handOff(turn, conv, "Pediu um horário, mas não há horários livres nos próximos dias", say.noSlots(turn.clinic));
  }
  const next = await advance(turn, conv, { step: "SLOT", slotOffset: offset, chosenStartsAt: null, chosenDentistId: null, slotOptions: { items: page.slots, hasMore: page.hasMore, ...(prefer ? { prefer } : {}) } as unknown as Prisma.InputJsonValue });
  return reply(turn, next, await speak(turn, next, { slotTaken: options.slotTaken, unmatched }));
}

/** Saves the new state of the conversation and counts this message as seen. */
async function advance(turn: Turn, conv: Conversation, data: Prisma.ConversationUncheckedUpdateInput): Promise<Conversation> {
  // Unless the caller says where to go, the next step is whatever is still missing after this answer.
  const merged = { ...conv, ...(data as Partial<Conversation>) };
  const step = data.step ?? missingStep(merged);
  return turn.prisma.conversation.update({
    where: { id: conv.id },
    data: { ...data, step, misses: 0, lastMessageId: turn.message.messageId, expiresAt: new Date(turn.now.getTime() + CONVERSATION_TTL_MS) },
  });
}

/**
 * The message did not move the dialog. If it asked a side question that was answered, the same question is asked
 * again; otherwise it counts as a miss, and after a few in a row a person takes over.
 */
async function stuck(turn: Turn, conv: Conversation): Promise<InboundOutcome> {
  const refreshed = { expiresAt: new Date(turn.now.getTime() + CONVERSATION_TTL_MS), lastMessageId: turn.message.messageId };
  if (turn.aside) {
    const next = await turn.prisma.conversation.update({ where: { id: conv.id }, data: refreshed });
    return reply(turn, next, await speak(turn, next));
  }
  if (conv.misses + 1 >= MAX_MISSES) return handOff(turn, conv, "Não conseguiu seguir o agendamento pelo WhatsApp");
  const next = await turn.prisma.conversation.update({ where: { id: conv.id }, data: { ...refreshed, misses: conv.misses + 1 } });
  return reply(turn, next, await speak(turn, next, { retry: true }));
}

interface Spoken {
  goal: AiPhraseInput["goal"];
  facts: string[];
  required?: string[];
  /** The fixed text, used when there is no AI or what it wrote cannot be sent. */
  fallback: string;
  person?: string;
  slotTaken?: boolean;
}

/** The next message of the dialog for the conversation's current step: written by the AI when possible, fixed otherwise. */
async function speak(turn: Turn, conv: Conversation, options: { retry?: boolean; slotTaken?: boolean; unmatched?: boolean; done?: boolean; open?: boolean; person?: string } = {}): Promise<string> {
  const spoken = await spokenFor(turn, conv, options);
  const miss = conv.step === "PROCEDURE" ? say.procedureNotFound() : say.notUnderstood();
  const fallback = options.retry ? `${miss}\n\n${spoken.fallback}` : spoken.fallback;
  let text = fallback;
  if (turn.ai) {
    try {
      turn.calls += 1;
      const raw = await turn.ai.phrase({
        clinicName: turn.clinic,
        goal: spoken.goal,
        facts: spoken.facts,
        required: spoken.required ?? [],
        greet: turn.greet,
        retry: options.retry ?? false,
        slotTaken: spoken.slotTaken ?? false,
        hasPatient: Boolean(spoken.person),
      });
      const person = spoken.person ? sanitizeName(spoken.person) : null;
      const valid = validatePhrase(raw, { goal: spoken.goal, required: spoken.required ?? [], person, material: [turn.clinic, ...spoken.facts] });
      await track(turn, valid ? "PHRASE_USED" : "PHRASE_REJECTED");
      text = valid ?? fallback;
    } catch {
      turn.ai = null;
      await track(turn, "PHRASE_FAILED");
    }
  }
  return turn.aside ? `${turn.aside}\n\n${text}` : text;
}

async function spokenFor(turn: Turn, conv: Conversation, options: { slotTaken?: boolean; unmatched?: boolean; done?: boolean; open?: boolean; person?: string }): Promise<Spoken> {
  if (options.done) {
    return { goal: "requested", facts: options.person ? ["O pedido é para outra pessoa: o paciente é {{PACIENTE}}"] : [], fallback: say.requested(turn.clinic, options.person), person: options.person };
  }
  if (options.open) {
    const canAnswer = turn.ai !== null && turn.info.trim() !== "";
    return { goal: "ask_open", facts: canAnswer ? ["A atendente também responde dúvidas sobre endereço, horários e formas de pagamento"] : [], fallback: say.openQuestion(turn.clinic, canAnswer) };
  }
  switch (conv.step) {
    case "PROCEDURE": {
      const list = await listProcedures(turn.prisma, conv.organizationId);
      return { goal: "ask_procedure", facts: [`Procedimentos oferecidos: ${list.map((item) => sanitizeName(item.name)).join("; ")}`], fallback: say.procedureMenu(turn.clinic, list, turn.greet) };
    }
    case "WHO":
      return { goal: "ask_who", facts: [], fallback: say.askWho() };
    case "PERSON":
      return { goal: "ask_person", facts: [], fallback: say.askPerson() };
    case "NAME":
      return conv.forSelf === false
        ? { goal: "ask_contact_name", facts: [], fallback: say.askGuardianName() }
        : { goal: "ask_name", facts: [], fallback: say.askName() };
    case "SLOT": {
      const offered = readSlots(conv);
      return {
        goal: "offer_slots",
        facts: [...(options.unmatched ? ["Não havia horário livre no dia ou período pedido: estes são os mais próximos."] : []), ...offered.items.map(slotFact), offered.hasMore ? "Há mais horários, se nenhum desses servir." : "Não há outros horários além destes."],
        required: offered.items.map((slot) => formatSlot(slot.startsAt)),
        fallback: say.slotMenu(offered.items, offered.hasMore, options.slotTaken ? say.slotTaken() : options.unmatched ? say.noMatch() : undefined),
        slotTaken: options.slotTaken,
      };
    }
    case "CONFIRM": {
      const slot = readSlots(conv).items.find((item) => item.startsAt === conv.chosenStartsAt?.toISOString()) as SlotOption;
      const procedure = await turn.prisma.procedure.findUniqueOrThrow({ where: { id: conv.procedureId as string }, select: { name: true } });
      const person = conv.forSelf === false ? (conv.personName ?? undefined) : undefined;
      return {
        goal: "confirm",
        facts: [`Horário: ${slotFact(slot)}`, `Procedimento: ${sanitizeName(procedure.name)}`, ...(person ? ["O paciente é {{PACIENTE}} (consulta para outra pessoa)"] : [])],
        required: [formatSlot(slot.startsAt)],
        fallback: say.confirmation(slot, procedure.name, person),
        person,
      };
    }
  }
}

/** Ends the conversation and leaves the person in the secretary's list, with the phone to call back. */
async function handOff(turn: Turn, conv: Conversation, summary: string, text = say.handoff(turn.clinic), reason: "UNRECOGNIZED" | "URGENT" = "UNRECOGNIZED"): Promise<InboundOutcome> {
  const procedure = conv.procedureId ? await turn.prisma.procedure.findUnique({ where: { id: conv.procedureId }, select: { name: true } }) : null;
  const db = scopedPrisma(turn.prisma, conv.organizationId);
  await db.$transaction(async (tx) => {
    await tx.conversation.update({
      where: { id: conv.id },
      data: { status: "HANDED_OFF", name: null, personName: null, slotOptions: Prisma.DbNull, lastMessageId: turn.message.messageId, aiCalls: { increment: turn.calls } },
    });
    await tx.inboundMessage.upsert({
      where: { organizationId_messageId: { organizationId: conv.organizationId, messageId: `conversation-${conv.id}` } },
      update: {},
      create: {
        organizationId: conv.organizationId,
        patientId: conv.patientId,
        phoneE164: conv.phoneE164,
        messageId: `conversation-${conv.id}`,
        text: `${summary}${procedure ? ` (procedimento: ${procedure.name})` : ""}.`,
        reason,
      },
    });
    await queueFlowReply(tx, { organizationId: conv.organizationId, conversationId: conv.id, replyToMessageId: turn.message.messageId, text: withGreeting(text, greetingOf(turn.message.text)) }, turn.now);
  });
  return { outcome: "HANDOFF" };
}

/** Queues the answer to this message; a "bom dia" from the person is answered in kind. */
async function reply(turn: Turn, conv: Conversation, text: string): Promise<InboundOutcome> {
  const greeted = withGreeting(text, greetingOf(turn.message.text));
  await queueFlowReply(scopedPrisma(turn.prisma, conv.organizationId), { organizationId: conv.organizationId, conversationId: conv.id, replyToMessageId: turn.message.messageId, text: greeted }, turn.now);
  if (turn.calls > 0) {
    await turn.prisma.conversation.update({ where: { id: conv.id }, data: { aiCalls: { increment: turn.calls } } });
    turn.calls = 0;
  }
  return { outcome: "CONVERSATION" };
}

export { looksLikeBookingRequest };
