import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/prisma";
import { listRescheduleRequests } from "@/lib/services/appointments";
import { createClinic, createDentist, createPatient, createProcedure } from "../helpers/factories";
import { ctxFor, NOW } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const HOUR = 3_600_000;

describe("listRescheduleRequests", () => {
  let clinicA: string;
  let clinicB: string;

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinicA = await createClinic(prisma, "a");
    clinicB = await createClinic(prisma, "b");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function book(clinic: string, hoursAhead: number, extra: { status?: "SCHEDULED" | "CANCELLED"; requested?: boolean } = {}) {
    const startsAt = new Date(NOW.getTime() + hoursAhead * HOUR);
    return prisma.appointment.create({
      data: {
        organizationId: clinic,
        patientId: (await createPatient(prisma, clinic, { name: `P${hoursAhead}` })).id,
        dentistId: (await createDentist(prisma, clinic)).id,
        procedureId: (await createProcedure(prisma, clinic)).id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 1_800_000),
        status: extra.status ?? "SCHEDULED",
        rescheduleRequestedAt: extra.requested === false ? null : NOW,
      },
    });
  }

  it("lists upcoming live appointments the patient asked to reschedule, soonest first, for this clinic only", async () => {
    const later = await book(clinicA, 72);
    const sooner = await book(clinicA, 24);
    await book(clinicA, 30, { requested: false });
    await book(clinicA, 40, { status: "CANCELLED" });
    await book(clinicA, -5);
    await book(clinicB, 24);

    const list = await listRescheduleRequests(ctxFor(prisma, clinicA));

    expect(list.map((item) => item.id)).toEqual([sooner.id, later.id]);
  });
});
