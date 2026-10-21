import { assertCan } from "@/lib/authz";
import { type ClinicSettings, toClinicSettings } from "@/lib/reminders/settings";
import { syncQuoteReminders, syncReminders } from "@/lib/reminders/sync";
import { clinicSettingsSchema, parseInput } from "@/lib/schemas";
import type { ServiceContext } from "@/lib/services/context";

const DAY_MS = 86_400_000;

/** The clinic's timings without a permission check, for the services that plan reminders. */
export async function loadClinicSettings(ctx: ServiceContext): Promise<ClinicSettings> {
  return toClinicSettings(await ctx.db.clinicSettings.findUnique({ where: { organizationId: ctx.organizationId } }));
}

export async function getSettings(ctx: ServiceContext): Promise<ClinicSettings> {
  assertCan(ctx.role, "triggerRule", "read");
  return loadClinicSettings(ctx);
}

/**
 * Saves the clinic's timings and re-plans the reminders that were not sent yet (upcoming appointments,
 * recent no-shows, open quotes) so the change takes effect now. Reminders already sent are history.
 */
export async function updateSettings(ctx: ServiceContext, rawInput: unknown): Promise<ClinicSettings> {
  assertCan(ctx.role, "triggerRule", "update");
  const input = parseInput(clinicSettingsSchema, rawInput);
  const saved = toClinicSettings(
    await ctx.db.clinicSettings.upsert({
      where: { organizationId: ctx.organizationId },
      update: input,
      create: { ...input, organizationId: ctx.organizationId },
    }),
  );

  const now = ctx.now();
  const appointments = await ctx.db.appointment.findMany({
    where: {
      OR: [
        { status: { in: ["SCHEDULED", "CONFIRMED"] }, startsAt: { gt: now } },
        { status: "NO_SHOW", endsAt: { gt: new Date(now.getTime() - DAY_MS) } },
      ],
    },
  });
  for (const appointment of appointments) await syncReminders(ctx.db, appointment, now, saved);

  const quotes = await ctx.db.quote.findMany({ where: { status: "OPEN" } });
  for (const quote of quotes) await syncQuoteReminders(ctx.db, quote, now, saved);
  return saved;
}
