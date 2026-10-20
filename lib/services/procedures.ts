import { assertCan } from "@/lib/authz";
import { AppError } from "@/lib/errors";
import { parseInput, procedureInputSchema, procedureUpdateSchema } from "@/lib/schemas";
import type { ServiceContext } from "@/lib/services/context";

export interface ProcedureDto {
  id: string;
  name: string;
  defaultDurationMin: number;
  active: boolean;
}

const toDto = (row: ProcedureDto): ProcedureDto => ({
  id: row.id,
  name: row.name,
  defaultDurationMin: row.defaultDurationMin,
  active: row.active,
});

export async function createProcedure(ctx: ServiceContext, rawInput: unknown): Promise<ProcedureDto> {
  assertCan(ctx.role, "procedure", "create");
  const input = parseInput(procedureInputSchema, rawInput);
  return toDto(await ctx.db.procedure.create({ data: { ...input, organizationId: ctx.organizationId } }));
}

export async function updateProcedure(
  ctx: ServiceContext,
  id: string,
  rawInput: unknown,
): Promise<ProcedureDto> {
  assertCan(ctx.role, "procedure", "update");
  const input = parseInput(procedureUpdateSchema, rawInput);
  const existing = await ctx.db.procedure.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Procedimento não encontrado", { resource: "procedure" });
  return toDto(await ctx.db.procedure.update({ where: { id }, data: input }));
}

export async function listProcedures(
  ctx: ServiceContext,
  options: { includeInactive?: boolean },
): Promise<ProcedureDto[]> {
  assertCan(ctx.role, "procedure", "read");
  const rows = await ctx.db.procedure.findMany({
    where: options.includeInactive ? {} : { active: true },
    orderBy: { name: "asc" },
  });
  return rows.map(toDto);
}
