import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/prisma";
import { changeQuoteStatus, createQuote, listQuotes } from "@/lib/services/quotes";
import { createClinic, createPatient } from "../helpers/factories";
import { ctxFor, NOW } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const DAY = 86_400_000;

describe("quotes service", () => {
  let clinicA: string;
  let clinicB: string;
  let patientId: string;

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinicA = await createClinic(prisma, "a");
    clinicB = await createClinic(prisma, "b");
    patientId = (await createPatient(prisma, clinicA, { name: "Maria Souza" })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates an open quote and schedules its two follow-ups", async () => {
    const quote = await createQuote(ctxFor(prisma, clinicA), { patientId, description: "Implante dente 36", value: 3500 });

    expect(quote).toMatchObject({ status: "OPEN", effectiveStatus: "OPEN", description: "Implante dente 36", valueCents: 350_000, patient: { name: "Maria Souza" } });
    const reminders = await prisma.reminder.findMany({ where: { quoteId: quote.id }, orderBy: { dueAt: "asc" } });
    expect(reminders.map((item) => [item.kind, item.status, item.appointmentId])).toEqual([
      ["QUOTE_FOLLOWUP_1", "PENDING", null],
      ["QUOTE_FOLLOWUP_2", "PENDING", null],
    ]);
    expect(reminders[0]?.dueAt).toEqual(new Date(NOW.getTime() + 2 * DAY));
  });

  it("accepts a quote without a value", async () => {
    const quote = await createQuote(ctxFor(prisma, clinicA), { patientId, description: "Clareamento" });
    expect(quote.valueCents).toBeNull();
  });

  it.each([
    [{ description: "" }],
    [{ description: "x".repeat(201) }],
    [{ description: "ok", value: -1 }],
    [{ description: "ok", value: 1_000_000 }],
    [{ patientId: "not-a-uuid", description: "ok" }],
  ])("rejects invalid input %j", async (override) => {
    await expect(createQuote(ctxFor(prisma, clinicA), { patientId, ...override })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("refuses a patient of another clinic", async () => {
    await expect(createQuote(ctxFor(prisma, clinicB), { patientId, description: "Clareamento" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("is limited to roles that can manage quotes", async () => {
    await expect(createQuote(ctxFor(prisma, clinicA, "dentist"), { patientId, description: "Clareamento" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("closing a quote cancels its pending follow-ups", async () => {
    const quote = await createQuote(ctxFor(prisma, clinicA), { patientId, description: "Implante" });

    const closed = await changeQuoteStatus(ctxFor(prisma, clinicA), quote.id, "ACCEPTED");

    expect(closed).toMatchObject({ status: "ACCEPTED" });
    const reminders = await prisma.reminder.findMany({ where: { quoteId: quote.id } });
    expect(reminders.every((item) => item.status === "CANCELLED")).toBe(true);
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).closedAt).toEqual(NOW);
  });

  it("does not reopen or re-close a closed quote, nor touch another clinic's", async () => {
    const quote = await createQuote(ctxFor(prisma, clinicA), { patientId, description: "Implante" });
    await changeQuoteStatus(ctxFor(prisma, clinicA), quote.id, "DECLINED");

    await expect(changeQuoteStatus(ctxFor(prisma, clinicA), quote.id, "ACCEPTED")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(changeQuoteStatus(ctxFor(prisma, clinicB), quote.id, "ACCEPTED")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(changeQuoteStatus(ctxFor(prisma, clinicA), quote.id, "OPEN" as never)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("lists this clinic's quotes newest first and shows old open quotes as expired", async () => {
    const recent = await createQuote(ctxFor(prisma, clinicA), { patientId, description: "Recente" });
    const old = await prisma.quote.create({
      data: { organizationId: clinicA, patientId, description: "Antigo", createdAt: new Date(NOW.getTime() - 20 * DAY) },
    });
    const otherPatient = await createPatient(prisma, clinicB);
    await prisma.quote.create({ data: { organizationId: clinicB, patientId: otherPatient.id, description: "Outra clínica" } });

    const list = await listQuotes(ctxFor(prisma, clinicA));

    expect(list.map((item) => [item.description, item.effectiveStatus])).toEqual([
      ["Recente", "OPEN"],
      ["Antigo", "EXPIRED"],
    ]);
    expect(list[0]?.id).toBe(recent.id);
    expect(list[1]?.status).toBe(old.status);
  });
});
