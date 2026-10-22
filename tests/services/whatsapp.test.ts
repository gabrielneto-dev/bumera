import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/prisma";
import { getWhatsappInstance, setWhatsappInstance } from "@/lib/services/whatsapp";
import { createClinic } from "../helpers/factories";
import { ctxFor } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);

describe("whatsapp instance of a clinic", () => {
  let clinicA: string;
  let clinicB: string;
  const admin = (clinic: string) => ctxFor(prisma, clinic, "admin");

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinicA = await createClinic(prisma, "a");
    clinicB = await createClinic(prisma, "b");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("is empty until the clinic sets it", async () => {
    expect(await getWhatsappInstance(admin(clinicA))).toBeNull();
  });

  it("saves the instance name and keeps the timings untouched", async () => {
    expect(await setWhatsappInstance(admin(clinicA), { instance: "clinica-sorriso" })).toBe("clinica-sorriso");
    expect(await getWhatsappInstance(admin(clinicA))).toBe("clinica-sorriso");
    const row = await prisma.clinicSettings.findUniqueOrThrow({ where: { organizationId: clinicA } });
    expect(row).toMatchObject({ reminder1HoursBefore: 24, dailySendLimit: 150 });
  });

  it("normalizes the case and trims blanks", async () => {
    expect(await setWhatsappInstance(admin(clinicA), { instance: "  Clinica_Sorriso1 " })).toBe("clinica_sorriso1");
  });

  it("can be changed and disconnected", async () => {
    await setWhatsappInstance(admin(clinicA), { instance: "um" + "-nome" });
    expect(await setWhatsappInstance(admin(clinicA), { instance: "outro-nome" })).toBe("outro-nome");
    expect(await setWhatsappInstance(admin(clinicA), { instance: null })).toBeNull();
    expect(await getWhatsappInstance(admin(clinicA))).toBeNull();
  });

  it.each([[""], ["a"], ["com espaço"], ["acentuação"], ["-comeca-com-hifen"], ["x".repeat(41)], [42]])("rejects the invalid name %j", async (instance) => {
    await expect(setWhatsappInstance(admin(clinicA), { instance })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("refuses a name that another clinic already uses", async () => {
    await setWhatsappInstance(admin(clinicA), { instance: "compartilhada" });

    await expect(setWhatsappInstance(admin(clinicB), { instance: "compartilhada" })).rejects.toMatchObject({ code: "DUPLICATE_WHATSAPP" });
    expect(await getWhatsappInstance(admin(clinicB))).toBeNull();
  });

  it("lets the same clinic save its own name again", async () => {
    await setWhatsappInstance(admin(clinicA), { instance: "minha" + "-clinica" });
    expect(await setWhatsappInstance(admin(clinicA), { instance: "minha-clinica" })).toBe("minha-clinica");
  });

  it("is limited to the clinic administrator", async () => {
    for (const role of ["secretary", "dentist"]) {
      await expect(getWhatsappInstance(ctxFor(prisma, clinicA, role))).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(setWhatsappInstance(ctxFor(prisma, clinicA, role), { instance: "abc-def" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
});
