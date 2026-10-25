import { AppError } from "@/lib/errors";
import { exportPatientData } from "@/lib/services/patient-privacy";
import { getServiceContext } from "@/lib/services/server";

const STATUS_BY_CODE: Partial<Record<AppError["code"], number>> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  ANONYMIZED_PATIENT: 410,
};

/** Downloads everything the clinic holds about one patient (LGPD) as a JSON file. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  try {
    const data = await exportPatientData(await getServiceContext(), id);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="dados-paciente-${id.slice(0, 8)}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return new Response(error.message, { status: STATUS_BY_CODE[error.code] ?? 400 });
    }
    throw error;
  }
}
