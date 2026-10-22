import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptField } from "@/lib/crypto";
import { createPrismaClient } from "@/lib/prisma";
import { getAssistantSettings, updateAssistantSettings } from "@/lib/services/assistant";
import { createClinic } from "../helpers/factories";
import { ctxFor, NOW, TEST_KEYS } from "../helpers/service-context";

const KEY = "sk-or-v1-0123456789abcdef0123456789abcdef";

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

  it("is off by default, without a key", async () => {
    expect(await getAssistantSettings(admin(clinicA))).toEqual({ enabled: false, enabledAt: null, clinicInfo: "", keyConfigured: false, keyLast4: null, ready: false });
  });

  it("counts a key of the whole server as a way to be ready", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k".repeat(40));
    expect(await getAssistantSettings(admin(clinicA))).toMatchObject({ keyConfigured: false, ready: true });
  });

  describe("the clinic's own key", () => {
    it("is stored encrypted and never shown again, only its last characters", async () => {
      const saved = await updateAssistantSettings(admin(clinicA), { enabled: false, clinicInfo: "", apiKey: KEY });

      expect(saved).toMatchObject({ keyConfigured: true, keyLast4: "cdef", ready: true });
      expect(JSON.stringify(saved)).not.toContain(KEY);
      const row = await prisma.clinicSettings.findUniqueOrThrow({ where: { organizationId: clinicA } });
      expect(row.aiApiKeyEncrypted).not.toContain(KEY);
      expect(decryptField(row.aiApiKeyEncrypted as string, TEST_KEYS.encryption)).toBe(KEY);
      expect(JSON.stringify(await getAssistantSettings(admin(clinicA)))).not.toContain(KEY);
    });

    it("stays as it is when the form is saved without typing a key", async () => {
      await updateAssistantSettings(admin(clinicA), { enabled: false, clinicInfo: "", apiKey: KEY });
      const again = await updateAssistantSettings(admin(clinicA), { enabled: false, clinicInfo: "Abrimos às 8h." });

      expect(again).toMatchObject({ keyConfigured: true, keyLast4: "cdef" });
    });

    it("can be replaced and removed", async () => {
      await updateAssistantSettings(admin(clinicA), { enabled: false, clinicInfo: "", apiKey: KEY });
      expect(await updateAssistantSettings(admin(clinicA), { enabled: false, clinicInfo: "", apiKey: `${KEY.slice(0, -4)}wxyz` })).toMatchObject({ keyLast4: "wxyz" });

      const removed = await updateAssistantSettings(admin(clinicA), { enabled: false, clinicInfo: "", removeKey: true });

      expect(removed).toMatchObject({ keyConfigured: false, keyLast4: null, ready: false });
      expect((await prisma.clinicSettings.findUniqueOrThrow({ where: { organizationId: clinicA } })).aiApiKeyEncrypted).toBeNull();
    });

    it.each([["short"], ["has spaces in the middle of the key text 0123456789"], ["x".repeat(300)]])("rejects the key %j", async (apiKey) => {
      await expect(updateAssistantSettings(admin(clinicA), { enabled: false, clinicInfo: "", apiKey })).rejects.toMatchObject({ code: "VALIDATION" });
    });

    it("belongs to its clinic alone", async () => {
      await updateAssistantSettings(admin(clinicA), { enabled: false, clinicInfo: "", apiKey: KEY });
      expect(await getAssistantSettings(admin(clinicB))).toMatchObject({ keyConfigured: false, ready: false });
    });

    it("is recorded as a change in the activity log, without its value", async () => {
      await updateAssistantSettings(admin(clinicA), { enabled: false, clinicInfo: "", apiKey: KEY });
      await updateAssistantSettings(admin(clinicA), { enabled: false, clinicInfo: "", removeKey: true });

      const log = await prisma.auditLog.findMany({ where: { action: "AI_SETTINGS_CHANGED" }, orderBy: { createdAt: "asc" } });
      expect(log.map((item) => item.details)).toEqual([
        { enabled: false, infoChanged: false, keyChanged: true },
        { enabled: false, infoChanged: false, keyChanged: true },
      ]);
      expect(JSON.stringify(log)).not.toContain("sk-or");
    });
  });

  it("turns on only with a key, the clinic's explicit acceptance and some information, recording who and when", async () => {
    await expect(updateAssistantSettings(admin(clinicA), { enabled: true, clinicInfo: "Abrimos às 8h.", accept: true })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(updateAssistantSettings(admin(clinicA), { enabled: true, clinicInfo: "Abrimos às 8h.", accept: false, apiKey: KEY })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(updateAssistantSettings(admin(clinicA), { enabled: true, clinicInfo: "", accept: true, apiKey: KEY })).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await getAssistantSettings(admin(clinicA))).enabled).toBe(false);

    const saved = await updateAssistantSettings(admin(clinicA), { enabled: true, clinicInfo: "Abrimos às 8h.", accept: true, apiKey: KEY });

    expect(saved).toMatchObject({ enabled: true, clinicInfo: "Abrimos às 8h.", enabledAt: NOW.toISOString() });
    expect(await prisma.clinicSettings.findUniqueOrThrow({ where: { organizationId: clinicA } })).toMatchObject({ aiEnabled: true, aiEnabledBy: "user_test" });
  });

  it("does not ask for the acceptance again while it stays on, and keeps the original date", async () => {
    await updateAssistantSettings(admin(clinicA), { enabled: true, clinicInfo: "v1", accept: true, apiKey: KEY });
    const later = await updateAssistantSettings(ctxFor(prisma, clinicA, "admin"), { enabled: true, clinicInfo: "v2 com novidades" });

    expect(later).toMatchObject({ enabled: true, clinicInfo: "v2 com novidades", enabledAt: NOW.toISOString() });
  });

  it("can be turned off, keeping what the clinic wrote", async () => {
    await updateAssistantSettings(admin(clinicA), { enabled: true, clinicInfo: "Abrimos às 8h.", accept: true, apiKey: KEY });

    const off = await updateAssistantSettings(admin(clinicA), { enabled: false, clinicInfo: "Abrimos às 8h." });

    expect(off).toMatchObject({ enabled: false, clinicInfo: "Abrimos às 8h." });
    expect(await getAssistantSettings(admin(clinicB))).toMatchObject({ enabled: false, clinicInfo: "" });
  });

  it("limits the text and records the change without its content", async () => {
    await expect(updateAssistantSettings(admin(clinicA), { enabled: false, clinicInfo: "x".repeat(2001) })).rejects.toMatchObject({ code: "VALIDATION" });

    await updateAssistantSettings(admin(clinicA), { enabled: true, clinicInfo: "Rua Segredo, 123", accept: true, apiKey: KEY });
    await updateAssistantSettings(admin(clinicA), { enabled: false, clinicInfo: "Rua Segredo, 123" });

    const log = await prisma.auditLog.findMany({ where: { action: "AI_SETTINGS_CHANGED" }, orderBy: { createdAt: "asc" } });
    expect(log.map((item) => item.details)).toEqual([{ enabled: true, infoChanged: true, keyChanged: true }, { enabled: false, infoChanged: false, keyChanged: false }]);
    expect(JSON.stringify(log)).not.toContain("Segredo");
  });

  it("is limited to the clinic administrator", async () => {
    for (const role of ["secretary", "dentist"]) {
      await expect(getAssistantSettings(ctxFor(prisma, clinicA, role))).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(updateAssistantSettings(ctxFor(prisma, clinicA, role), { enabled: false, clinicInfo: "" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
});
