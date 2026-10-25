import { CalendarClock, CalendarSync, ClipboardList, HeartHandshake, MessageCircleWarning, MessageSquareText, UserPlus } from "lucide-react";
import type { ReactNode } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { AvatarInitials } from "@/components/avatar-initials";
import { EmptyState } from "@/components/empty-state";
import { ConfirmButton } from "@/components/form/confirm-button";
import { Stagger, StaggerItem } from "@/components/motion";
import { PageHeader } from "@/components/page-header";
import { formatDayLong, formatTime } from "@/lib/dates";
import { REMINDER_KIND_LABEL } from "@/lib/labels";
import { formatBrPhone } from "@/lib/phone";
import { listPending, listRescheduleRequests } from "@/lib/services/appointments";
import { listInbox } from "@/lib/services/inbox";
import { listPatients } from "@/lib/services/patients";
import { listFailedReminders, listInterestedPatients } from "@/lib/services/reminders";
import { getServiceContext } from "@/lib/services/server";
import { hasWhatsappInstance } from "@/lib/services/whatsapp";
import { approveAppointmentAction, approvePatientAction, markInboxHandledAction, clearInboxConversationAction, markInterestHandledAction, rejectAppointmentAction } from "./actions";

export const metadata = { title: "Pendentes" };
// Per-user page: it depends on the session cookie, so navigating here may block (loading.tsx covers the wait).
export const instant = false;

function Section({ icon: Icon, title, count, children }: { icon: typeof UserPlus; title: string; count: number; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-medium tracking-wide text-muted-foreground uppercase">
        <Icon className="size-4" aria-hidden />
        {title}
        <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-semibold text-foreground tabular-nums">{count}</span>
      </h2>
      {children}
    </div>
  );
}

export default async function PendentesPage() {
  const ctx = await getServiceContext();
  const [patients, appointments, failedReminders, rescheduleRequests, interested, whatsappConnected, inbox] = await Promise.all([
    listPatients(ctx, { status: "PENDING" }),
    listPending(ctx),
    listFailedReminders(ctx),
    listRescheduleRequests(ctx),
    listInterestedPatients(ctx),
    hasWhatsappInstance(ctx),
    listInbox(ctx),
  ]);
  const isEmpty = patients.items.length === 0 && appointments.length === 0 && failedReminders.length === 0 && rescheduleRequests.length === 0 && interested.length === 0 && inbox.length === 0;

  return (
    <section className="space-y-8">
      <AutoRefresh />
      <PageHeader
        title="Pendentes"
        description="Cadastros e consultas que chegaram por WhatsApp e esperam a sua confirmação."
      />

      {!whatsappConnected && (
        <p role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
          O WhatsApp desta clínica ainda não está conectado: nenhum lembrete sai até o administrador conectar, na tela WhatsApp.
        </p>
      )}

      {isEmpty && (
        <EmptyState icon={ClipboardList} title="Tudo em dia">
          Quando um paciente se cadastrar ou marcar horário pelo WhatsApp, aparece aqui.
        </EmptyState>
      )}

      {inbox.length > 0 && (
        <Section icon={MessageSquareText} title="Mensagens para responder" count={inbox.length}>
          <Stagger className="space-y-2">
            {inbox.map((item) => (
              <StaggerItem
                key={item.id}
                className={`relative flex flex-wrap items-center gap-4 overflow-hidden rounded-2xl border bg-card py-4 pr-4 pl-5 ${item.reason === "URGENT" ? "border-destructive/40" : ""}`}
              >
                <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${item.reason === "URGENT" ? "bg-destructive" : "bg-warning"}`} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium">
                    <span className="truncate">{item.patient?.name ?? "Contato novo"}</span>
                    {item.reason === "URGENT" ? <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">Urgente</span> : null}
                  </p>
                  <p className="text-sm break-words whitespace-pre-wrap">{item.text}</p>
                  <p className="text-sm text-muted-foreground tabular-nums">Responda por aqui ou ligue: {formatBrPhone(item.phoneE164)}</p>
                </div>
                <div className="flex items-start gap-2">
                  <ConfirmButton
                    label="Limpar conversa"
                    variant="ghost"
                    confirmMessage="Limpar a conversa deste número? O agendamento em andamento é encerrado e as mensagens não lidas dele saem desta lista."
                    action={clearInboxConversationAction.bind(null, item.id)}
                  />
                  <ConfirmButton label="Marcar como respondida" action={markInboxHandledAction.bind(null, item.id)} />
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </Section>
      )}

      {interested.length > 0 && (
        <Section icon={HeartHandshake} title="Querem falar com a equipe" count={interested.length}>
          <Stagger className="space-y-2">
            {interested.map((item) => (
              <StaggerItem key={item.id} className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-2xl border bg-card py-4 pr-4 pl-5">
                <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-success" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.patient.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.quoteDescription
                      ? `Quer falar sobre o orçamento: ${item.quoteDescription}`
                      : `Respondeu ao convite de retorno (${item.procedureName ?? "consulta"})`}
                  </p>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    Ligue para combinar: {formatBrPhone(item.patient.phoneE164)}
                  </p>
                </div>
                <ConfirmButton label="Marcar como atendido" action={markInterestHandledAction.bind(null, item.id)} />
              </StaggerItem>
            ))}
          </Stagger>
        </Section>
      )}

      {rescheduleRequests.length > 0 && (
        <Section icon={CalendarSync} title="Pediram para remarcar" count={rescheduleRequests.length}>
          <Stagger className="space-y-2">
            {rescheduleRequests.map((appointment) => (
              <StaggerItem key={appointment.id} className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-2xl border bg-card py-4 pr-4 pl-5">
                <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-warning" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{appointment.patient.name}</p>
                  <p className="text-sm text-muted-foreground first-letter:uppercase">
                    {formatDayLong(appointment.startsAt.slice(0, 10))} · {formatTime(appointment.startsAt)} ·{" "}
                    {appointment.dentist.name} · {appointment.procedure.name}
                  </p>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    Ligue para combinar um novo horário: {formatBrPhone(appointment.patient.phoneE164)}
                  </p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </Section>
      )}

      {failedReminders.length > 0 && (
        <Section icon={MessageCircleWarning} title="Mensagens que não saíram" count={failedReminders.length}>
          <Stagger className="space-y-2">
            {failedReminders.map((reminder) => (
              <StaggerItem key={reminder.id} className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-2xl border border-destructive/30 bg-card py-4 pr-4 pl-5">
                <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-destructive/70" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{reminder.patient.name}</p>
                  <p className="text-sm text-muted-foreground first-letter:uppercase">
                    {REMINDER_KIND_LABEL[reminder.kind]} ·{" "}
                    {reminder.appointment
                      ? `consulta ${formatDayLong(reminder.appointment.startsAt.slice(0, 10))} ${formatTime(reminder.appointment.startsAt)}`
                      : `orçamento ${reminder.quote?.description ?? ""}`}
                  </p>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    Avise por telefone: {formatBrPhone(reminder.patient.phoneE164)}
                  </p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </Section>
      )}

      {patients.items.length > 0 && (
        <Section icon={UserPlus} title="Pacientes novos" count={patients.items.length}>
          <Stagger className="space-y-2">
            {patients.items.map((patient) => (
              <StaggerItem key={patient.id} className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-4">
                <AvatarInitials name={patient.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{patient.name}</p>
                  <p className="text-sm text-muted-foreground tabular-nums">{formatBrPhone(patient.phoneE164)}</p>
                  {patient.guardianName ? <p className="text-sm text-muted-foreground">Responsável pelos avisos: {patient.guardianName}</p> : null}
                </div>
                <ConfirmButton label="Confirmar cadastro" action={approvePatientAction.bind(null, patient.id)} />
              </StaggerItem>
            ))}
          </Stagger>
        </Section>
      )}

      {appointments.length > 0 && (
        <Section icon={CalendarClock} title="Consultas" count={appointments.length}>
          <Stagger className="space-y-2">
            {appointments.map((appointment) => (
              <StaggerItem key={appointment.id} className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-2xl border bg-card py-4 pr-4 pl-5">
                <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-warning" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{appointment.patient.name}</p>
                  <p className="text-sm text-muted-foreground first-letter:uppercase">
                    {formatDayLong(appointment.startsAt.slice(0, 10))} · {formatTime(appointment.startsAt)} ·{" "}
                    {appointment.dentist.name} · {appointment.procedure.name}
                  </p>
                  {appointment.source === "WHATSAPP" ? (
                    <p className="text-sm text-muted-foreground tabular-nums">
                      Pedido pelo WhatsApp: {formatBrPhone(appointment.patient.phoneE164)}
                      {appointment.patient.guardianName ? ` · responsável: ${appointment.patient.guardianName}` : ""}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <ConfirmButton label="Recusar" variant="ghost" action={rejectAppointmentAction.bind(null, appointment.id)} />
                  <ConfirmButton label="Aprovar" action={approveAppointmentAction.bind(null, appointment.id)} />
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </Section>
      )}
    </section>
  );
}
