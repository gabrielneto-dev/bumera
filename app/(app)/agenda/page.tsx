import Link from "next/link";
import { ActionDialog } from "@/components/form/action-dialog";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { AppointmentStatus } from "@/generated/prisma/client";
import { can } from "@/lib/authz";
import { formatDayLong, formatTime, shiftDay, todayInClinic } from "@/lib/dates";
import { APPOINTMENT_STATUS_LABEL } from "@/lib/labels";
import { formatBrPhone } from "@/lib/phone";
import { type AppointmentDto, listDay } from "@/lib/services/appointments";
import { listDentists } from "@/lib/services/dentists";
import { listPatients } from "@/lib/services/patients";
import { listProcedures } from "@/lib/services/procedures";
import { getServiceContext } from "@/lib/services/server";
import { bookAppointmentAction, changeStatusAction, loadSlotsAction } from "./actions";
import { BookingFields } from "./booking-fields";
import { StatusActions } from "./status-actions";

export const metadata = { title: "Agenda" };
// Per-user page: it depends on the session cookie, so navigating here may block (loading.tsx covers the wait).
export const instant = false;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PATIENT_PICKER_LIMIT = 300;

const BADGE_VARIANT: Record<AppointmentStatus, "default" | "secondary" | "outline" | "destructive"> = {
  PENDING: "outline",
  SCHEDULED: "secondary",
  CONFIRMED: "default",
  COMPLETED: "secondary",
  CANCELLED: "destructive",
  NO_SHOW: "destructive",
};

function groupByDentist(appointments: AppointmentDto[]) {
  const groups = new Map<string, { name: string; items: AppointmentDto[] }>();
  for (const appointment of appointments) {
    const group = groups.get(appointment.dentist.id) ?? { name: appointment.dentist.name, items: [] };
    group.items.push(appointment);
    groups.set(appointment.dentist.id, group);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export default async function AgendaPage({ searchParams }: PageProps<"/agenda">) {
  const params = await searchParams;
  const ctx = await getServiceContext(); // request-time access first, so the clock below is read per request
  const today = todayInClinic();
  const day = typeof params.dia === "string" && DAY_PATTERN.test(params.dia) ? params.dia : today;
  const dentistId = typeof params.dentista === "string" ? params.dentista : undefined;

  const canBook = can(ctx.role, "appointment", "create");
  const [appointments, dentists, procedures, patients] = await Promise.all([
    listDay(ctx, { day, dentistId }),
    listDentists(ctx, {}),
    listProcedures(ctx, {}),
    canBook ? listPatients(ctx, { limit: PATIENT_PICKER_LIMIT }) : Promise.resolve({ items: [], total: 0 }),
  ]);

  const dentistQuery = dentistId ? `&dentista=${dentistId}` : "";
  const dayHref = (target: string) => `/agenda?dia=${target}${dentistQuery}`;
  const groups = groupByDentist(appointments);
  const canUpdate = can(ctx.role, "appointment", "update");
  const canCancel = can(ctx.role, "appointment", "cancel");
  const ready = dentists.length > 0 && procedures.length > 0;

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-heading text-3xl tracking-tight">Agenda</h1>
          <p className="text-sm text-muted-foreground first-letter:uppercase">{formatDayLong(day)}</p>
        </div>
        {canBook && ready && (
          <ActionDialog
            triggerLabel="Nova consulta"
            title="Nova consulta"
            description="Só aparecem horários livres dentro do expediente do dentista."
            submitLabel="Agendar"
            action={bookAppointmentAction}
          >
            <BookingFields
              patients={patients.items.map((p) => ({ value: p.id, label: `${p.name} · ${formatBrPhone(p.phoneE164)}` }))}
              dentists={dentists.map((d) => ({ value: d.id, label: d.name }))}
              procedures={procedures.map((p) => ({ value: p.id, label: `${p.name} (${p.defaultDurationMin} min)` }))}
              defaultDay={day}
              loadSlots={loadSlotsAction}
            />
          </ActionDialog>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={dayHref(shiftDay(day, -1))} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label="Dia anterior">
          ←
        </Link>
        <Link href={dayHref(today)} className={buttonVariants({ variant: day === today ? "secondary" : "outline", size: "sm" })}>
          Hoje
        </Link>
        <Link href={dayHref(shiftDay(day, 1))} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label="Próximo dia">
          →
        </Link>
        <form method="get" className="ml-auto flex items-center gap-2">
          {dentistId && <input type="hidden" name="dentista" value={dentistId} />}
          <label className="sr-only" htmlFor="dia">
            Ir para o dia
          </label>
          <input
            id="dia"
            name="dia"
            type="date"
            defaultValue={day}
            className="h-7 rounded-lg border border-input bg-transparent px-2 text-sm"
          />
          <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Ir
          </button>
        </form>
      </div>

      {dentists.length > 1 && (
        <nav aria-label="Filtrar por dentista" className="flex flex-wrap gap-2">
          <Link href={`/agenda?dia=${day}`} className={buttonVariants({ variant: dentistId ? "outline" : "secondary", size: "xs" })}>
            Todos
          </Link>
          {dentists.map((dentist) => (
            <Link
              key={dentist.id}
              href={`/agenda?dia=${day}&dentista=${dentist.id}`}
              className={buttonVariants({ variant: dentistId === dentist.id ? "secondary" : "outline", size: "xs" })}
            >
              {dentist.name}
            </Link>
          ))}
        </nav>
      )}

      {!ready && canBook && (
        <div className="rounded-xl border border-dashed bg-card px-6 py-5 text-sm text-muted-foreground">
          Para agendar, cadastre ao menos um dentista e um procedimento.
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card px-6 py-14 text-center">
          <p className="font-heading text-xl">Nenhuma consulta neste dia</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground text-pretty">
            Use “Nova consulta” para agendar. Os lembretes por WhatsApp saem sozinhos depois.
          </p>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.name} className="space-y-3">
            <h2 className="font-heading text-xl tracking-tight">{group.name}</h2>
            <ul className="space-y-2">
              {group.items.map((appointment) => (
                <li key={appointment.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card p-4">
                  <p className="w-32 font-heading text-lg tabular-nums">
                    {formatTime(appointment.startsAt)}–{formatTime(appointment.endsAt)}
                  </p>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{appointment.patient.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {appointment.procedure.name} · {formatBrPhone(appointment.patient.phoneE164)}
                    </p>
                  </div>
                  <Badge variant={BADGE_VARIANT[appointment.status]}>{APPOINTMENT_STATUS_LABEL[appointment.status]}</Badge>
                  <StatusActions
                    appointmentId={appointment.id}
                    status={appointment.status}
                    canUpdate={canUpdate}
                    canCancel={canCancel}
                    changeStatus={changeStatusAction}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
