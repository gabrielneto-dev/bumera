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

export interface AiProcedureInput {
  clinicName: string;
  /** The patient's message, personal data masked. */
  message: string;
  /** The clinic's procedures, in the order of the menu the patient saw. */
  procedures: readonly string[];
}

export interface AiProcedureChoice {
  /** Position in the list (starting at 1) of the procedure the message asks for, or null when unclear. */
  choice: number | null;
  confidence: number;
}

export interface AiClient {
  interpret(input: AiInput): Promise<AiDecision>;
  /** Which of the clinic's procedures a free-text message is asking for. */
  pickProcedure(input: AiProcedureInput): Promise<AiProcedureChoice>;
}
