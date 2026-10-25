import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PgBoss } from "pg-boss";
import { POST } from "@/app/api/webhooks/evolution/[token]/route";
import { createPrismaClient } from "@/lib/prisma";
import { createBoss, QUEUE_SCHEMA } from "@/lib/queue/boss";
import { stopProducerBoss } from "@/lib/queue/producer";
import { startWorker, type RunningWorker } from "@/lib/queue/worker";
import type { OutgoingText, WhatsappChannel } from "@/lib/whatsapp/evolution-client";
import { whatsappWorkerSetup } from "@/lib/whatsapp/queues";
import { connectWhatsapp, createClinic, createDentist, createPatient, createProcedure } from "../helpers/factories";
import { silentLogger } from "../helpers/logger";
import { waitFor } from "../helpers/wait";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const TOKEN = "webhook-token-webhook-token-webhook-01";
const PHONE = "+5511987654321";
/** F1 target (docs/ai-gap-analysis.md): message received to reply sent under 20 s. */
const TARGET_MS = 20_000;

const webhook = (id: string, text: string) =>
  POST(
    new Request(`http://localhost/api/webhooks/evolution/${TOKEN}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "messages.upsert", instance: "bumera-teste", data: { key: { remoteJid: "5511987654321@s.whatsapp.net", fromMe: false, id }, message: { conversation: text } } }),
    }),
    { params: Promise.resolve({ token: TOKEN }) },
  );

describe("WhatsApp pipeline on the worker (webhook → turn → dispatch → send)", () => {
  let boss: PgBoss;
  let worker: RunningWorker;
  let appointmentId: string;
  const sent: Array<OutgoingText & { at: number }> = [];
  const channel: WhatsappChannel = {
    async sendText(message) {
      sent.push({ ...message, at: Date.now() });
      return { ok: true, providerMessageId: `WA-${sent.length}` };
    },
  };

  beforeAll(async () => {
    vi.stubEnv("WHATSAPP_SENDER", "worker");
    vi.stubEnv("EVOLUTION_WEBHOOK_TOKEN", TOKEN);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    await prisma.$executeRawUnsafe(`delete from ${QUEUE_SCHEMA}.job where name like 'whatsapp.%'`).catch(() => 0);
    const clinic = await createClinic(prisma, "a");
    await connectWhatsapp(prisma, clinic);
    const patient = await createPatient(prisma, clinic, { name: "Maria Souza", phoneE164: PHONE });
    const dentist = await createDentist(prisma, clinic);
    const procedure = await createProcedure(prisma, clinic);
    const startsAt = new Date(Date.now() + 48 * 3_600_000);
    appointmentId = (
      await prisma.appointment.create({
        data: { organizationId: clinic, patientId: patient.id, dentistId: dentist.id, procedureId: procedure.id, startsAt, endsAt: new Date(startsAt.getTime() + 1_800_000) },
      })
    ).id;
    boss = createBoss(process.env.DATABASE_URL as string);
    await boss.start();
    worker = await startWorker({ boss, log: silentLogger(), ...whatsappWorkerSetup({ prisma, boss, channel, sender: "worker" }) });
  });

  afterAll(async () => {
    await worker.stop();
    await stopProducerBoss();
    vi.unstubAllEnvs();
    await prisma.$disconnect();
  });

  it("confirms on '1' and the confirmation reaches the patient within the target, once", async () => {
    const receivedAt = Date.now();
    expect(await (await webhook("E2E-1", "1")).json()).toMatchObject({ data: { outcome: "BUFFERED" } });

    await waitFor(() => sent.length > 0, 30_000);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ instance: "bumera-teste", phoneE164: PHONE });
    expect(sent[0].at - receivedAt).toBeLessThan(TARGET_MS);
    expect(await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } })).toMatchObject({ status: "CONFIRMED" });
    // The result is recorded right after the channel answers.
    await vi.waitFor(async () => {
      expect(await prisma.reminder.findFirstOrThrow({ where: { kind: "REPLY_CONFIRMED" } })).toMatchObject({ status: "SENT", providerMessageId: "WA-1" });
    }, { timeout: 5000, interval: 100 });
    // Nothing else goes out afterwards.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(sent).toHaveLength(1);
  }, 45_000);
});
