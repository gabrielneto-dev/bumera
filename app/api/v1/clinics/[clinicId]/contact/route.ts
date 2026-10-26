import { fail, ok } from "@/lib/api-response";
import { assertClinicExists, describeContact } from "@/lib/n8n-api/clinic";
import { contactQuerySchema, toE164 } from "@/lib/n8n-api/schemas";
import { prisma } from "@/lib/prisma";
import { serviceRoute } from "@/lib/service-route";

/** n8n: who is behind a phone in this clinic (first names, upcoming appointments, what a "sim" would answer). */
export async function GET(request: Request, context: { params: Promise<{ clinicId: string }> }): Promise<Response> {
  return serviceRoute(request, async () => {
    const { clinicId } = await context.params;
    const parsed = contactQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return fail(400, "VALIDATION", "Informe phone");
    await assertClinicExists(prisma, clinicId);
    return ok(await describeContact(prisma, clinicId, toE164(parsed.data.phone), new Date()));
  });
}
