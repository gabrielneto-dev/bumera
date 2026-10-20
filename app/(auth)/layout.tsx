import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <span className="font-heading text-2xl tracking-tight">Bumera</span>
        <div className="max-w-md space-y-6">
          <h1 className="font-heading text-5xl leading-[1.05] tracking-tight text-balance">
            Cada paciente lembrado, cada cadeira ocupada.
          </h1>
          <p className="text-lg text-primary-foreground/80 text-pretty">
            Agenda, confirmações e retornos por WhatsApp para a sua clínica, sem
            planilhas e sem esquecer ninguém.
          </p>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full border border-primary-foreground/15"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -bottom-10 size-64 rounded-full border border-primary-foreground/25"
        />
      </aside>
      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </main>
  );
}
