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

/** Reactivating messages needs the secretary to confirm the patient agreed again (LGPD consent). */
export const allowMessagesSchema = z.object({
  consent: z.literal(true, { error: "Confirme que o paciente aceitou voltar a receber mensagens" }),
});

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

const reactivateAfterMonths = z
  .number({ error: "Informe os meses" })
  .int("Use meses inteiros")
  .min(1, "Mínimo de 1 mês")
  .max(60, "Máximo de 60 meses");

export const procedureInputSchema = z.object({
  name,
  defaultDurationMin: duration,
  reactivateAfterMonths: reactivateAfterMonths.nullable().optional(),
});

export const procedureUpdateSchema = z
  .object({ name, defaultDurationMin: duration, reactivateAfterMonths: reactivateAfterMonths.nullable() })
  .partial()
  .extend({ active: z.boolean().optional() });

const quoteValueReais = z
  .number({ error: "Informe o valor em reais" })
  .min(0, "O valor não pode ser negativo")
  .max(99_999.99, "Valor acima do permitido");

export const quoteInputSchema = z.object({
  patientId: z.uuid(),
  description: z.string().trim().min(1, "Descreva o orçamento").max(200, "Use até 200 caracteres"),
  value: quoteValueReais.optional(),
});

export const quoteCloseSchema = z.enum(["ACCEPTED", "DECLINED"], { error: "Situação inválida" });

const wholeNumber = (label: string, min: number, max: number) =>
  z
    .number({ error: `${label}: informe um número` })
    .int(`${label}: use números inteiros`)
    .min(min, `${label}: mínimo de ${min}`)
    .max(max, `${label}: máximo de ${max}`);

/** Per-clinic message timings (lib/reminders/settings.ts has the defaults). */
export const clinicSettingsSchema = z
  .object({
    confirmationEnabled: z.boolean(),
    reminder1Enabled: z.boolean(),
    reminder1HoursBefore: wholeNumber("Primeiro lembrete (horas antes)", 1, 168),
    reminder2Enabled: z.boolean(),
    reminder2HoursBefore: wholeNumber("Segundo lembrete (horas antes)", 1, 168),
    noShowEnabled: z.boolean(),
    noShowDelayHours: wholeNumber("Convite após falta (horas depois)", 1, 72),
    quoteFollowup1Days: wholeNumber("1º contato do orçamento (dias)", 1, 30),
    quoteFollowup2Days: wholeNumber("2º contato do orçamento (dias)", 1, 60),
    quoteValidDays: wholeNumber("Validade do orçamento (dias)", 1, 90),
    quietEnabled: z.boolean(),
    quietStartHour: wholeNumber("Início do silêncio (hora)", 0, 23),
    quietEndHour: wholeNumber("Fim do silêncio (hora)", 0, 23),
    dailySendLimit: wholeNumber("Limite diário de mensagens", 10, 1000),
  })
  .superRefine((value, ctx) => {
    if (value.reminder1Enabled && value.reminder2Enabled && value.reminder1HoursBefore <= value.reminder2HoursBefore) {
      ctx.addIssue({ code: "custom", path: ["reminder1HoursBefore"], message: "O primeiro lembrete deve vir antes do segundo" });
    }
    if (value.quoteFollowup1Days >= value.quoteFollowup2Days) {
      ctx.addIssue({ code: "custom", path: ["quoteFollowup2Days"], message: "O 2º contato deve vir depois do 1º" });
    }
    if (value.quietEnabled && value.quietStartHour === value.quietEndHour) {
      ctx.addIssue({ code: "custom", path: ["quietEndHour"], message: "O fim do silêncio deve ser diferente do início" });
    }
    if (value.quoteFollowup2Days > value.quoteValidDays) {
      ctx.addIssue({ code: "custom", path: ["quoteValidDays"], message: "A validade deve cobrir o 2º contato" });
    }
  });

/** Evolution instance names: lowercase letters, digits, "-" and "_", starting with a letter or digit. */
export const whatsappInstanceSchema = z.object({
  instance: z
    .string({ error: "Informe o nome da instância" })
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9_-]{1,39}$/, "Use de 2 a 40 letras minúsculas, números, - ou _")
    .nullable(),
});

export const assistantSettingsSchema = z.object({
  enabled: z.boolean(),
  clinicInfo: z.string({ error: "Informe o texto" }).trim().max(2000, "Use até 2000 caracteres"),
  /** The clinic's acceptance that patients' messages go, masked, to an external AI provider. */
  accept: z.boolean().optional(),
});

export const appointmentInputSchema = z.object({
  patientId: z.uuid(),
  dentistId: z.uuid(),
  procedureId: z.uuid(),
  startsAt: z.iso.datetime({ error: "Data e hora inválidas" }),
  durationMin: duration.optional(),
});

export { DEFAULT_WORK_END, DEFAULT_WORK_START };
