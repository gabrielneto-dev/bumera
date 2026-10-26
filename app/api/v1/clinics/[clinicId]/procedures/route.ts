import { ok } from "@/lib/api-response";
import { listProcedures } from "@/lib/n8n-api/booking";
import { prisma } from "@/lib/prisma";
import { serviceRoute } from "@/lib/service-route";

/** n8n: the procedures that can be booked by WhatsApp. */
export async function GET(request: Request, context: { params: Promise<{ clinicId: string }> }): Promise<Response> {
  return serviceRoute(request, async () => {
    const { clinicId } = await context.params;
    return ok(await listProcedures(prisma, clinicId));
  });
}
