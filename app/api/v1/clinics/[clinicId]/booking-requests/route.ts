import { fail, ok } from "@/lib/api-response";
import { createBookingRequest } from "@/lib/n8n-api/booking";
import { bookingRequestSchema, toE164 } from "@/lib/n8n-api/schemas";
import { prisma } from "@/lib/prisma";
import { readJsonBody, serviceRoute } from "@/lib/service-route";

/** n8n: files a booking request (PENDING appointment the secretary approves). 409 SLOT_TAKEN: offer slots again. */
export async function POST(request: Request, context: { params: Promise<{ clinicId: string }> }): Promise<Response> {
  return serviceRoute(request, async () => {
    const { clinicId } = await context.params;
    const read = await readJsonBody(request);
    if ("response" in read) return read.response;
    const parsed = bookingRequestSchema.safeParse(read.body);
    if (!parsed.success) return fail(400, "VALIDATION", parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
    return ok(await createBookingRequest(prisma, clinicId, { ...parsed.data, phone: toE164(parsed.data.phone) }, new Date()));
  });
}
