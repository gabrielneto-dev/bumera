import { formatDayLong, formatTime } from "@/lib/dates";
import { formatBrPhone } from "@/lib/phone";
import { listPending } from "@/lib/services/appointments";
import { listPatients } from "@/lib/services/patients";
import { getServiceContext } from "@/lib/services/server";
import { approveAppointmentAction, approvePatientAction, rejectAppointmentAction } from "./actions";
import { ConfirmButton } from "./confirm-button";

export const metadata = { title: "Pendentes" };
// Per-user page: it depends on the session cookie, so navigating here may block (loading.tsx covers the wait).
export const instant = false;

export default async function PendentesPage() {
  const ctx = await getServiceContext();
  const [patients, appointments] = await Promise.all([
    listPatients(ctx, { status: "PENDING" }),
    listPending(ctx),
  ]);
  const isEmpty = patients.items.length === 0 && appointments.length === 0;

  return (
    <section className="space-y-8">
      <header className="space-y-1">
        <h1 className="font-heading text-3xl tracking-tight">Pendentes</h1>
        <p className="text-sm text-muted-foreground">
          Cadastros e consultas que chegaram por WhatsApp e esperam a sua confirmação.
        </p>
      </header>

      {isEmpty && (
        <div className="rounded-xl border border-dashed bg-card px-6 py-14 text-center">
          <p className="font-heading text-xl">Tudo em dia</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground text-pretty">
            Quando um paciente se cadastrar ou marcar horário pelo WhatsApp, aparece aqui.
          </p>
        </div>
      )}

      {patients.items.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-heading text-xl tracking-tight">Pacientes novos</h2>
          <ul className="space-y-2">
            {patients.items.map((patient) => (
              <li key={patient.id} className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{patient.name}</p>
                  <p className="text-sm text-muted-foreground">{formatBrPhone(patient.phoneE164)}</p>
                </div>
                <ConfirmButton label="Confirmar cadastro" action={approvePatientAction.bind(null, patient.id)} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {appointments.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-heading text-xl tracking-tight">Consultas</h2>
          <ul className="space-y-2">
            {appointments.map((appointment) => (
              <li key={appointment.id} className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{appointment.patient.name}</p>
                  <p className="text-sm text-muted-foreground first-letter:uppercase">
                    {formatDayLong(appointment.startsAt.slice(0, 10))} · {formatTime(appointment.startsAt)} ·{" "}
                    {appointment.dentist.name} · {appointment.procedure.name}
                  </p>
                </div>
                <div className="flex gap-2">
                  <ConfirmButton label="Recusar" variant="ghost" action={rejectAppointmentAction.bind(null, appointment.id)} />
                  <ConfirmButton label="Aprovar" action={approveAppointmentAction.bind(null, appointment.id)} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
