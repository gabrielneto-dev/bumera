import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/prisma";
import { scopedPrisma } from "@/lib/tenant-scope";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);

async function createClinic(slug: string): Promise<string> {
  const clinic = await prisma.organization.create({
    data: { id: `org_${slug}`, name: `Clinic ${slug}`, slug, createdAt: new Date() },
  });
  return clinic.id;
}

describe("scopedPrisma (tenant isolation)", () => {
  let clinicA: string;
  let clinicB: string;

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinicA = await createClinic("a");
    clinicB = await createClinic("b");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects an empty clinic id", () => {
    expect(() => scopedPrisma(prisma, "")).toThrow(/organizationId/);
  });

  it("creates records for its own clinic", async () => {
    const db = scopedPrisma(prisma, clinicA);
    const dentist = await db.dentist.create({ data: { name: "Ana", organizationId: clinicA } });
    expect(dentist.organizationId).toBe(clinicA);
  });

  it("refuses to create a record for another clinic", async () => {
    const db = scopedPrisma(prisma, clinicA);
    await expect(
      db.dentist.create({ data: { name: "Eve", organizationId: clinicB } }),
    ).rejects.toThrow(/another clinic/);
  });

  it("only lists and counts the clinic's own records", async () => {
    await scopedPrisma(prisma, clinicA).dentist.create({ data: { name: "Ana", organizationId: clinicA } });
    await scopedPrisma(prisma, clinicB).dentist.create({ data: { name: "Bia", organizationId: clinicB } });

    const dbA = scopedPrisma(prisma, clinicA);
    const listed = await dbA.dentist.findMany();
    expect(listed.map((d) => d.name)).toEqual(["Ana"]);
    expect(await dbA.dentist.count()).toBe(1);
  });

  it("cannot read another clinic's record by id", async () => {
    const other = await scopedPrisma(prisma, clinicB).dentist.create({ data: { name: "Bia", organizationId: clinicB } });
    const found = await scopedPrisma(prisma, clinicA).dentist.findUnique({
      where: { id: other.id },
    });
    expect(found).toBeNull();
  });

  it("cannot update or delete another clinic's record by id", async () => {
    const other = await scopedPrisma(prisma, clinicB).dentist.create({ data: { name: "Bia", organizationId: clinicB } });
    const dbA = scopedPrisma(prisma, clinicA);

    await expect(
      dbA.dentist.update({ where: { id: other.id }, data: { name: "Hacked" } }),
    ).rejects.toThrow();
    await expect(dbA.dentist.delete({ where: { id: other.id } })).rejects.toThrow();

    const untouched = await prisma.dentist.findUniqueOrThrow({ where: { id: other.id } });
    expect(untouched.name).toBe("Bia");
  });

  it("updateMany and deleteMany only touch the clinic's own records", async () => {
    await scopedPrisma(prisma, clinicA).dentist.create({ data: { name: "Ana", organizationId: clinicA } });
    await scopedPrisma(prisma, clinicB).dentist.create({ data: { name: "Bia", organizationId: clinicB } });
    const dbA = scopedPrisma(prisma, clinicA);

    const updated = await dbA.dentist.updateMany({ data: { active: false } });
    expect(updated.count).toBe(1);
    expect(await prisma.dentist.count({ where: { active: false } })).toBe(1);

    const deleted = await dbA.dentist.deleteMany();
    expect(deleted.count).toBe(1);
    expect(await prisma.dentist.count()).toBe(1);
  });

  it("does not allow moving a record to another clinic", async () => {
    const mine = await scopedPrisma(prisma, clinicA).dentist.create({ data: { name: "Ana", organizationId: clinicA } });
    await expect(
      scopedPrisma(prisma, clinicA).dentist.update({
        where: { id: mine.id },
        data: { organizationId: clinicB },
      }),
    ).rejects.toThrow(/another clinic/);
  });

  it("createMany accepts own rows and rejects foreign rows", async () => {
    const dbA = scopedPrisma(prisma, clinicA);
    await dbA.dentist.createMany({
      data: [
        { name: "Ana", organizationId: clinicA },
        { name: "Ari", organizationId: clinicA },
      ],
    });
    expect(await prisma.dentist.count({ where: { organizationId: clinicA } })).toBe(2);

    await expect(
      dbA.dentist.createMany({ data: [{ name: "Eve", organizationId: clinicB }] }),
    ).rejects.toThrow(/another clinic/);
  });

  it("upsert cannot overwrite another clinic's record", async () => {
    const other = await scopedPrisma(prisma, clinicB).dentist.create({ data: { name: "Bia", organizationId: clinicB } });
    await expect(
      scopedPrisma(prisma, clinicA).dentist.upsert({
        where: { id: other.id },
        create: { id: other.id, name: "Hacked", organizationId: clinicA },
        update: { name: "Hacked" },
      }),
    ).rejects.toThrow();
    const untouched = await prisma.dentist.findUniqueOrThrow({ where: { id: other.id } });
    expect(untouched.name).toBe("Bia");
  });

  it("denies access to models that are not tenant-scoped", async () => {
    const db = scopedPrisma(prisma, clinicA);
    // Cast: the scoped client type still exposes every model; the guard is at runtime.
    const unsafe = db as unknown as { organization: { findMany: () => Promise<unknown> } };
    await expect(unsafe.organization.findMany()).rejects.toThrow(/not available/);
  });
});
