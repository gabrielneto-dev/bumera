export const metadata = { title: "Agenda" };

export default function AgendaPage() {
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-3xl tracking-tight">Agenda</h1>
        <p className="text-sm text-muted-foreground">Consultas de hoje, por dentista.</p>
      </header>
      <div className="rounded-xl border border-dashed bg-card px-6 py-16 text-center">
        <p className="font-heading text-xl">Nenhuma consulta por aqui ainda</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground text-pretty">
          Cadastre dentistas e pacientes para começar a agendar. Os lembretes por WhatsApp
          saem sozinhos depois.
        </p>
      </div>
    </section>
  );
}
