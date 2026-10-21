import type { Prisma } from "@/generated/prisma/client";
import { assertCan } from "@/lib/authz";
import { AppError } from "@/lib/errors";
import { QUOTE_VALID_DAYS } from "@/lib/reminders/guard";
import { syncQuoteReminders } from "@/lib/reminders/sync";
import { parseInput, quoteCloseSchema, quoteInputSchema } from "@/lib/schemas";
import type { ServiceContext } from "@/lib/services/context";

const DAY_MS = 86_400_000;
const CENTS = 100;
const LIST_LIMIT = 200;

const include = { patient: { select: { id: true, name: true, phoneE164: true } } } satisfies Prisma.QuoteInclude;
type QuoteRow = Prisma.QuoteGetPayload<{ include: typeof include }>;

export type QuoteStatus = "OPEN" | "ACCEPTED" | "DECLINED";

export interface QuoteDto {
  id: string;
  description: string;
  valueCents: number | null;
  /** What is stored. */
  status: QuoteStatus;
  /** What the secretary sees: an open quote older than its validity shows as expired. */
  effectiveStatus: QuoteStatus | "EXPIRED";
  createdAt: string;
  closedAt: string | null;
  patient: { id: string; name: string; phoneE164: string };
}

function toDto(row: QuoteRow, now: Date): QuoteDto {
  const expired = row.status === "OPEN" && now.getTime() - row.createdAt.getTime() > QUOTE_VALID_DAYS * DAY_MS;
  return {
    id: row.id,
    description: row.description,
    valueCents: row.valueCents,
    status: row.status,
    effectiveStatus: expired ? "EXPIRED" : row.status,
    createdAt: row.createdAt.toISOString(),
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    patient: row.patient,
  };
}

/** Records a quote and schedules its follow-ups (module 2). */
export async function createQuote(ctx: ServiceContext, rawInput: unknown): Promise<QuoteDto> {
  assertCan(ctx.role, "quote", "create");
  const input = parseInput(quoteInputSchema, rawInput);
  const patient = await ctx.db.patient.findUnique({ where: { id: input.patientId }, select: { id: true } });
  if (!patient) throw new AppError("NOT_FOUND", "Paciente não encontrado", { resource: "patient" });

  const now = ctx.now();
  const row = await ctx.db.$transaction(async (tx) => {
    const created = await tx.quote.create({
      data: {
        organizationId: ctx.organizationId,
        patientId: input.patientId,
        description: input.description,
        valueCents: input.value === undefined ? null : Math.round(input.value * CENTS),
        createdAt: now,
      },
      include,
    });
    await syncQuoteReminders(tx, created, now);
    return created;
  });
  return toDto(row, now);
}

/** The secretary closes a quote as accepted or declined; the unsent follow-ups stop. */
export async function changeQuoteStatus(ctx: ServiceContext, id: string, rawStatus: unknown): Promise<QuoteDto> {
  assertCan(ctx.role, "quote", "update");
  const to = parseInput(quoteCloseSchema, rawStatus);
  const current = await ctx.db.quote.findUnique({ where: { id } });
  if (!current) throw new AppError("NOT_FOUND", "Orçamento não encontrado", { resource: "quote" });
  if (current.status !== "OPEN") {
    throw new AppError("INVALID_TRANSITION", "Este orçamento já foi encerrado", { from: current.status, to });
  }
  const now = ctx.now();
  const row = await ctx.db.$transaction(async (tx) => {
    const updated = await tx.quote.update({ where: { id }, data: { status: to, closedAt: now }, include });
    await syncQuoteReminders(tx, updated, now);
    return updated;
  });
  return toDto(row, now);
}

export async function listQuotes(ctx: ServiceContext): Promise<QuoteDto[]> {
  assertCan(ctx.role, "quote", "read");
  const now = ctx.now();
  const rows = await ctx.db.quote.findMany({ include, orderBy: { createdAt: "desc" }, take: LIST_LIMIT });
  return rows.map((row) => toDto(row, now));
}
