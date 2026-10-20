import { assertCan } from "@/lib/authz";
import { AppError } from "@/lib/errors";
import { dentistInputSchema, dentistUpdateSchema, parseInput } from "@/lib/schemas";
import type { ServiceContext } from "@/lib/services/context";

export interface DentistDto {
  id: string;
  name: string;
  active: boolean;
  workStart: string;
  workEnd: string;
  workDays: number[];
}

type DentistRow = Omit<DentistDto, "workDays"> & { workDays: number[] };

const toDto = (row: DentistRow): DentistDto => ({
  id: row.id,
  name: row.name,
  active: row.active,
  workStart: row.workStart,
  workEnd: row.workEnd,
  workDays: row.workDays,
});

export async function createDentist(ctx: ServiceContext, rawInput: unknown): Promise<DentistDto> {
  assertCan(ctx.role, "dentist", "create");
  const input = parseInput(dentistInputSchema, rawInput);
  return toDto(await ctx.db.dentist.create({ data: { ...input, organizationId: ctx.organizationId } }));
}

export async function updateDentist(
  ctx: ServiceContext,
  id: string,
  rawInput: unknown,
): Promise<DentistDto> {
  assertCan(ctx.role, "dentist", "update");
  const input = parseInput(dentistUpdateSchema, rawInput);
  const existing = await ctx.db.dentist.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Dentista não encontrado", { resource: "dentist" });

  const merged = { ...existing, ...input };
  if (merged.workStart >= merged.workEnd) {
    throw new AppError("VALIDATION", "Dados inválidos", {
      issues: [{ path: "workEnd", message: "O fim deve ser depois do início" }],
    });
  }
  return toDto(await ctx.db.dentist.update({ where: { id }, data: input }));
}

export async function listDentists(
  ctx: ServiceContext,
  options: { includeInactive?: boolean },
): Promise<DentistDto[]> {
  assertCan(ctx.role, "dentist", "read");
  const rows = await ctx.db.dentist.findMany({
    where: options.includeInactive ? {} : { active: true },
    orderBy: { name: "asc" },
  });
  return rows.map(toDto);
}
