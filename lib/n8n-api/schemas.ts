import { z } from "zod";

/** Inputs of the API the n8n WhatsApp workflows call. Phones arrive as WhatsApp sends them (digits, with or without +). */
const phone = z.string().trim().min(10).max(20);

export const contactQuerySchema = z.object({ phone });

export const answerSchema = z.object({ phone, answer: z.enum(["CONFIRM", "RESCHEDULE", "OPT_OUT"]) });

const MAX_PAGE = 10;
const weekdayList = z
  .string()
  .regex(/^[0-6](,[0-6])*$/, "weekdays: dígitos 0-6 separados por vírgula (0 = domingo)")
  .transform((value) => [...new Set(value.split(",").map(Number))]);

export const slotsQuerySchema = z.object({
  procedureId: z.string().min(1),
  offset: z.coerce.number().int().min(0).max(100).default(0),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE).default(3),
  weekdays: weekdayList.optional(),
  period: z.enum(["morning", "afternoon"]).optional(),
  fromHour: z.coerce.number().int().min(0).max(23).optional(),
});

const personName = z.string().trim().min(3).max(120);

export const bookingRequestSchema = z.object({
  phone,
  procedureId: z.string().min(1),
  dentistId: z.string().min(1),
  startsAt: z.iso.datetime(),
  forSelf: z.boolean(),
  name: personName.optional(),
  personName: personName.optional(),
});

/** "5511987654321" or "+5511987654321" → "+5511987654321". */
export const toE164 = (value: string): string => `+${value.replace(/\D/g, "")}`;
