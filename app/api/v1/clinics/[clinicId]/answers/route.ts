import { fail, ok } from "@/lib/api-response";
import { applyPatientAnswer } from "@/lib/n8n-api/answers";
import { assertClinicExists } from "@/lib/n8n-api/clinic";
import { answerSchema, toE164 } from "@/lib/n8n-api/schemas";
import { prisma } from "@/lib/prisma";
import { readJsonBody, serviceRoute } from "@/lib/service-route";

/**
 * n8n: the patient answered (CONFIRM = "1"/yes, RESCHEDULE = "2", OPT_OUT = "SAIR"). The app applies it and returns the
 * reply to send. Safe to repeat.
 */
export async function POST(request: Request, context: { params: Promise<{ clinicId: string }> }): Promise<Response> {
  return serviceRoute(request, async () => {
    const { clinicId } = await context.params;
    const read = await readJsonBody(request);
    if ("response" in read) return read.response;
    const parsed = answerSchema.safeParse(read.body);
    if (!parsed.success) return fail(400, "VALIDATION", 'Corpo inválido: use {"phone":"5511...","answer":"CONFIRM"|"RESCHEDULE"|"OPT_OUT"}');
    await assertClinicExists(prisma, clinicId);
    return ok(await applyPatientAnswer(prisma, { organizationId: clinicId, phoneE164: toE164(parsed.data.phone), answer: parsed.data.answer }, new Date()));
  });
}
