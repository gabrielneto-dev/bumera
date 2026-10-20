import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/prisma";
import { listTeam } from "@/lib/services/team";
import { createClinic } from "../helpers/factories";
import { ctxFor } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);

async function addMember(organizationId: string, key: string, role: string, name = key) {
  const user = await prisma.user.create({
    data: { id: `user_${key}`, name, email: `${key}@example.com`, emailVerified: false },
  });
  await prisma.member.create({
    data: { id: `member_${key}`, organizationId, userId: user.id, role, createdAt: new Date("2026-10-01T10:00:00.000Z") },
  });
  return user;
}

describe("team service", () => {
  let clinicA: string;
  let clinicB: string;

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization", "user" CASCADE');
    clinicA = await createClinic(prisma, "a");
    clinicB = await createClinic(prisma, "b");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("lists the clinic's members with name, e-mail and role, never another clinic's", async () => {
    await addMember(clinicA, "admin", "admin", "Dra. Chefe");
    await addMember(clinicA, "sec", "secretary", "Sônia");
    await addMember(clinicB, "other", "admin", "Intruso");

    const team = await listTeam(prisma, ctxFor(prisma, clinicA, "admin"));
    expect(team.members.map((m) => [m.name, m.email, m.role])).toEqual([
      ["Dra. Chefe", "admin@example.com", "admin"],
      ["Sônia", "sec@example.com", "secretary"],
    ]);
  });

  it("lists only pending, unexpired invitations of this clinic", async () => {
    const admin = await addMember(clinicA, "admin", "admin");
    const other = await addMember(clinicB, "other", "admin");
    const future = new Date("2026-10-25T00:00:00.000Z");
    const past = new Date("2026-10-10T00:00:00.000Z");
    const invite = (id: string, org: string, inviter: string, status: string, expiresAt: Date) =>
      prisma.invitation.create({ data: { id, organizationId: org, email: `${id}@example.com`, role: "secretary", status, expiresAt, inviterId: inviter } });
    await invite("pending", clinicA, admin.id, "pending", future);
    await invite("expired", clinicA, admin.id, "pending", past);
    await invite("accepted", clinicA, admin.id, "accepted", future);
    await invite("foreign", clinicB, other.id, "pending", future);

    const team = await listTeam(prisma, ctxFor(prisma, clinicA, "admin"));
    expect(team.invitations.map((i) => i.email)).toEqual(["pending@example.com"]);
  });

  it("is forbidden for roles that cannot invite", async () => {
    await expect(listTeam(prisma, ctxFor(prisma, clinicA, "secretary"))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listTeam(prisma, ctxFor(prisma, clinicA, "dentist"))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
