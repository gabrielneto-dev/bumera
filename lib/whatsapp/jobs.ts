import { z } from "zod";
import { defineJob } from "@/lib/queue/queues";

/**
 * Worker queues of the WhatsApp channel (phase F1, docs/ai-gap-analysis.md). Payloads carry ids only; the
 * handlers read everything else from the database.
 */

/** Answer everything one number wrote in a burst. Serialized per number. */
export const TURN_JOB = defineJob({
  name: "whatsapp.turn",
  payload: z.object({ organizationId: z.string().min(1), phoneE164: z.string().regex(/^\+\d{10,15}$/) }),
  retryLimit: 3,
  retryDelaySeconds: 5,
  heartbeatSeconds: 30,
  serializeByGroup: true,
});

/** Claim due reminders and replies and hand each to the sender of its WhatsApp number. Runs one at a time. */
export const DISPATCH_JOB = defineJob({
  name: "whatsapp.dispatch",
  payload: z.object({}),
  retryLimit: 2,
  retryDelaySeconds: 10,
  serializeByGroup: true,
});

/** Send one claimed reminder or reply. Serialized per WhatsApp number (pacing). */
export const SEND_JOB = defineJob({
  name: "whatsapp.send",
  payload: z.object({ reminderId: z.string().min(1), attempt: z.number().int().min(1) }),
  // A failed send is recorded on the reminder, whose own retry schedule takes over.
  retryLimit: 0,
  heartbeatSeconds: 30,
  serializeByGroup: true,
});

export const turnKey = (organizationId: string, phoneE164: string): string => `turn:${organizationId}:${phoneE164}`;
export const DISPATCH_GROUP = "dispatch";
