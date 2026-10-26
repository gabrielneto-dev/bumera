import { fail, ok } from "@/lib/api-response";
import { listSlots } from "@/lib/n8n-api/booking";
import { slotsQuerySchema } from "@/lib/n8n-api/schemas";
import { prisma } from "@/lib/prisma";
import { serviceRoute } from "@/lib/service-route";

/** n8n: the next real free times for a procedure, a page at a time, optionally within the person's preference. */
export async function GET(request: Request, context: { params: Promise<{ clinicId: string }> }): Promise<Response> {
  return serviceRoute(request, async () => {
    const { clinicId } = await context.params;
    const parsed = slotsQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return fail(400, "VALIDATION", parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
    const { procedureId, offset, limit, weekdays, period, fromHour } = parsed.data;
    const preference = weekdays || period || fromHour !== undefined ? { weekdays, period, fromHour } : null;
    return ok(await listSlots(prisma, clinicId, { procedureId, offset, limit, preference }, new Date()));
  });
}
