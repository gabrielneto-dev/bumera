import type { PrismaClient } from "@/generated/prisma/client";

/** Fixtures for integration tests. They use the unscoped client on purpose (test data only). */
export async function createClinic(prisma: PrismaClient, slug: string): Promise<string> {
  const clinic = await prisma.organization.create({
    data: { id: `org_${slug}`, name: `Clinic ${slug}`, slug, createdAt: new Date() },
  });
  return clinic.id;
}

export function createDentist(prisma: PrismaClient, organizationId: string, name = "Dra. Ana") {
  return prisma.dentist.create({ data: { organizationId, name } });
}

export function createProcedure(prisma: PrismaClient, organizationId: string, name = "Limpeza") {
  return prisma.procedure.create({ data: { organizationId, name, defaultDurationMin: 30 } });
}

export function createPatient(
  prisma: PrismaClient,
  organizationId: string,
  overrides: { name?: string; cpfHash?: string | null; phoneE164?: string } = {},
) {
  return prisma.patient.create({
    data: {
      organizationId,
      name: overrides.name ?? "Paciente Teste",
      phoneE164: overrides.phoneE164 ?? "+5511987654321",
      cpfHash: overrides.cpfHash === undefined ? null : overrides.cpfHash,
    },
  });
}

export const at = (hhmm: string, day = "2026-10-20") => new Date(`${day}T${hhmm}:00.000Z`);
