import { ok } from "@/lib/api-response";
import { findClinicByInstance } from "@/lib/n8n-api/clinic";
import { prisma } from "@/lib/prisma";
import { serviceRoute } from "@/lib/service-route";

/** n8n: which clinic a WhatsApp number (Evolution instance) belongs to, and what its assistant may answer from. */
export async function GET(request: Request, context: { params: Promise<{ instance: string }> }): Promise<Response> {
  return serviceRoute(request, async () => {
    const { instance } = await context.params;
    return ok(await findClinicByInstance(prisma, decodeURIComponent(instance)));
  });
}
