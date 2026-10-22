import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPrismaClient } from "@/lib/prisma";
import { getAssistantSettings, updateAssistantSettings } from "@/lib/services/assistant";
import { createClinic } from "../helpers/factories";
import { ctxFor, NOW } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);

describe("AI assistant settings", () => {
  let clinicA: string;
  let clinicB: string;
  const admin = (clinic: string) => ctxFor(prisma, clinic, "admin");

  beforeEach(async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("AI_MODEL", "");
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinicA = await createClinic(prisma, "a");
    clinicB = await createClinic(prisma, "b");
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.$disconnect();
  });

  it("is off by default and says whether the server has an AI configured", async () => {
    expect(await getAssistantSettings(admin(clinicA))).toEqual({ enabled: false, enabledAt: null, clinicInfo: "", serverReady: false });
    vi.stubEnv("OPENROUTER_API_KEY", "k".repeat(40));
    vi.stubEnv("AI_MODEL", "provider/model-x");
    expect((await getAssistantSettings(admin(clinicA))).serverReady).toBe(true);
  });

  it("turns on only with the clinic's explicit acceptance, recording who and when", async () => {
    await expect(updateAssistantSettings(admin(clinicA), { enabled: true, clinicInfo: "Abrimos às 8h.", accept: false })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(updateAssistantSettings(admin(clinicA), { enabled: true, clinicInfo: "" })).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await getAssistantSettings(admin(clinicA))).enabled).toBe(false);

    const saved = await updateAssistantSettings(admin(clinicA), { enabled: true, clinicInfo: "Abrimos às 8h.", accept: true });

    expect(saved).toMatchObject({ enabled: true, clinicInfo: "Abrimos às 8h.", enabledAt: NOW.toISOString() });
    expect(await prisma.clinicSettings.findUniqueOrThrow({ where: { organizationId: clinicA } })).toMatchObject({ aiEnabled: true, aiEnabledBy: "user_test" });
  });

  it("does not ask for the acceptance again while it stays on, and keeps the original date", async () => {
    await updateAssistantSettings(admin(clinicA), { enabled: true, clinicInfo: "v1", accept: true });
    const later = await updateAssistantSettings(ctxFor(prisma, clinicA, "admin"), { enabled: true, clinicInfo: "v2 com novidades" });

    expect(later).toMatchObject({ enabled: true, clinicInfo: "v2 com novidades", enabledAt: NOW.toISOString() });
  });

  it("can be turned off, keeping what the clinic wrote", async () => {
    await updateAssistantSettings(admin(clinicA), { enabled: true, clinicInfo: "Abrimos às 8h.", accept: true });

    const off = await updateAssistantSettings(admin(clinicA), { enabled: false, clinicInfo: "Abrimos às 8h." });

    expect(off).toMatchObject({ enabled: false, clinicInfo: "Abrimos às 8h." });
    expect(await getAssistantSettings(admin(clinicB))).toMatchObject({ enabled: false, clinicInfo: "" });
  });

  it("limits the text and records the change without its content", async () => {
    await expect(updateAssistantSettings(admin(clinicA), { enabled: false, clinicInfo: "x".repeat(2001) })).rejects.toMatchObject({ code: "VALIDATION" });

    await updateAssistantSettings(admin(clinicA), { enabled: true, clinicInfo: "Rua Segredo, 123", accept: true });
    await updateAssistantSettings(admin(clinicA), { enabled: false, clinicInfo: "Rua Segredo, 123" });

    const log = await prisma.auditLog.findMany({ where: { action: "AI_SETTINGS_CHANGED" }, orderBy: { createdAt: "asc" } });
    expect(log.map((item) => item.details)).toEqual([{ enabled: true, infoChanged: true }, { enabled: false, infoChanged: false }]);
    expect(JSON.stringify(log)).not.toContain("Segredo");
  });

  it("is limited to the clinic administrator", async () => {
    for (const role of ["secretary", "dentist"]) {
      await expect(getAssistantSettings(ctxFor(prisma, clinicA, role))).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(updateAssistantSettings(ctxFor(prisma, clinicA, role), { enabled: false, clinicInfo: "" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
});
