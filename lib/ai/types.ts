/** What the clinic last said to the patient, which decides what a short answer such as "sim" means. */
export type AiContext = "appointment" | "campaign" | "none";

export interface AiInput {
  clinicName: string;
  /** What the clinic wrote for the assistant to answer from (address, hours, payment methods...). */
  clinicInfo: string;
  /** The patient's message with personal data already masked. */
  message: string;
  context: AiContext;
}

export type AiIntent = "YES" | "NO" | "STOP" | "QUESTION" | "BOOK" | "OTHER";

export interface AiDecision {
  intent: AiIntent;
  /** 0 to 1: how sure the model says it is. The app acts only above a threshold per intent. */
  confidence: number;
  /** A suggested answer for QUESTION, written only from the clinic's information; null otherwise. */
  answer: string | null;
}

export type BookingStep = "PROCEDURE" | "WHO" | "PERSON" | "NAME" | "SLOT" | "CONFIRM";

export interface AiTurnInput {
  clinicName: string;
  clinicInfo: string;
  /** What the dialog asked last, which decides what a short answer means. */
  step: BookingStep;
  /** The person's message, personal data masked. */
  message: string;
  /** The clinic's procedures, numbered from 1 in this order. */
  procedures: readonly string[];
  /** The times last offered, numbered from 1 in this order (empty before any are offered). */
  slots: readonly string[];
  hasMoreSlots: boolean;
  /** The procedure already chosen, if any. */
  chosenProcedure: string | null;
  /** true = for the writer, false = for someone else, null = not known yet. */
  forSelf: boolean | null;
}

/** Which of the free times a person would rather have. Every field is optional; an empty preference is null. */
export interface SlotPreference {
  /** Days of the week, 0 = Sunday ... 6 = Saturday. */
  weekdays?: number[];
  period?: "morning" | "afternoon";
  /** Not before this hour (0-23), e.g. "depois das 16h". */
  fromHour?: number;
}

/** What one free-text message of the booking dialog says. Every field is null/false when the message does not say it. */
export interface AiTurn {
  /** Position (from 1) in the procedure list. */
  procedure: number | null;
  whom: "self" | "other" | null;
  /** Position (from 1) in the offered times, or "more" to see other times. */
  slot: number | "more" | null;
  confirm: "yes" | "no" | null;
  /** The day or time of day the person asks for instead of the times offered; null when they say none. */
  prefer: SlotPreference | null;
  /** The person wants to talk to a human. */
  human: boolean;
  /** Answer to a side question, written only from the clinic's information; null otherwise. */
  answer: string | null;
  confidence: number;
}

export type PhraseGoal = "ask_procedure" | "ask_who" | "ask_person" | "ask_name" | "ask_contact_name" | "offer_slots" | "confirm" | "requested";

export interface AiPhraseInput {
  clinicName: string;
  goal: PhraseGoal;
  /** True facts the message may use (procedure names, times...). Nothing else may be stated. */
  facts: readonly string[];
  /** Texts the message must contain exactly as given (the times). */
  required: readonly string[];
  /** First message of the conversation: greet and introduce. */
  greet: boolean;
  /** The last answer was not understood: ask again, kindly. */
  retry: boolean;
  /** The times were just taken by someone else. */
  slotTaken: boolean;
  /** The message may mention the patient with the placeholder {{PACIENTE}}. */
  hasPatient: boolean;
}

export interface AiClient {
  interpret(input: AiInput): Promise<AiDecision>;
  /** Reads a free-text message of the booking dialog. */
  understandTurn(input: AiTurnInput): Promise<AiTurn>;
  /** Writes the dialog's next message in a natural tone; the app validates it before sending. */
  phrase(input: AiPhraseInput): Promise<string>;
}
