import { z } from "zod";
import { isValidCpf, normalizeCpf } from "@/lib/cpf";
import { AppError } from "@/lib/errors";
import { normalizeBrPhone } from "@/lib/phone";

const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 120;
const MIN_DURATION_MIN = 5;
const MAX_DURATION_MIN = 480;
const DEFAULT_WORK_START = "08:00";
const DEFAULT_WORK_END = "18:00";
const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5, 6];

/** Parses untrusted input; failures become a VALIDATION AppError with per-field messages. */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError("VALIDATION", "Dados inválidos", {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return result.data;
}

const name = z
  .string()
  .trim()
  .min(MIN_NAME_LENGTH, "Informe o nome")
  .max(MAX_NAME_LENGTH, "Nome muito longo");
const cpf = z.string().trim().transform(normalizeCpf).refine(isValidCpf, "CPF inválido");
const phone = z
  .string()
  .trim()
  .transform((value) => normalizeBrPhone(value))
  .pipe(z.string({ error: "Telefone inválido" }));
const birthDate = z.iso.date({ error: "Data de nascimento inválida" });
const duration = z
  .number({ error: "Informe a duração em minutos" })
  .int("Use minutos inteiros")
  .min(MIN_DURATION_MIN, `Mínimo de ${MIN_DURATION_MIN} minutos`)
  .max(MAX_DURATION_MIN, `Máximo de ${MAX_DURATION_MIN} minutos`);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido (use HH:MM)");
const workDays = z
  .array(z.number().int().min(0).max(6))
  .min(1, "Escolha ao menos um dia")
  .refine((days) => new Set(days).size === days.length, "Dias repetidos");

export const patientInputSchema = z.object({
  name,
  cpf: cpf.optional(),
  phone,
  birthDate: birthDate.optional(),
  consent: z.boolean().default(false),
});

export const patientUpdateSchema = z
  .object({ name, cpf: cpf.nullable(), phone, birthDate: birthDate.nullable() })
  .partial();

const dentistFields = { name, workStart: time, workEnd: time, workDays };

export const dentistInputSchema = z
  .object({
    ...dentistFields,
    workStart: time.default(DEFAULT_WORK_START),
    workEnd: time.default(DEFAULT_WORK_END),
    workDays: workDays.default(() => [...DEFAULT_WORK_DAYS]),
  })
  .refine((dentist) => dentist.workStart < dentist.workEnd, {
    message: "O fim deve ser depois do início",
    path: ["workEnd"],
  });

export const dentistUpdateSchema = z
  .object(dentistFields)
  .partial()
  .extend({ active: z.boolean().optional() });

export const procedureInputSchema = z.object({ name, defaultDurationMin: duration });

export const procedureUpdateSchema = z
  .object({ name, defaultDurationMin: duration })
  .partial()
  .extend({ active: z.boolean().optional() });

export const appointmentInputSchema = z.object({
  patientId: z.uuid(),
  dentistId: z.uuid(),
  procedureId: z.uuid(),
  startsAt: z.iso.datetime({ error: "Data e hora inválidas" }),
  durationMin: duration.optional(),
});

export { DEFAULT_WORK_END, DEFAULT_WORK_START };
