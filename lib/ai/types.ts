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

export type AiIntent = "YES" | "NO" | "STOP" | "QUESTION" | "OTHER";

export interface AiDecision {
  intent: AiIntent;
  /** 0 to 1: how sure the model says it is. The app acts only above a threshold per intent. */
  confidence: number;
  /** A suggested answer for QUESTION, written only from the clinic's information; null otherwise. */
  answer: string | null;
}

export interface AiClient {
  interpret(input: AiInput): Promise<AiDecision>;
}
