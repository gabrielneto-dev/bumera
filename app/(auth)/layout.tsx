import { CalendarCheck, MessageCircle, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { FadeIn } from "@/components/motion";
import { BrandMark } from "@/components/brand-mark";

const HIGHLIGHTS = [
  { icon: CalendarCheck, title: "Agenda sem conflito", text: "Só horários livres, por dentista." },
  { icon: MessageCircle, title: "Lembretes por WhatsApp", text: "Confirmações que saem sozinhas." },
  { icon: ShieldCheck, title: "Dados protegidos", text: "CPF criptografado, cada clínica isolada." },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -right-40 size-[34rem] rounded-full bg-sidebar-primary/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-24 size-96 rounded-full border border-sidebar-foreground/10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 -left-8 size-64 rounded-full border border-sidebar-foreground/15"
        />
        <BrandMark tone="dark" className="relative" />
        <div className="relative max-w-md space-y-10">
          <div className="space-y-5">
            <h1 className="font-heading text-5xl leading-[1.05] tracking-tight text-balance text-sidebar-accent-foreground">
              Cada paciente lembrado, cada cadeira ocupada.
            </h1>
            <p className="text-lg text-sidebar-foreground/75 text-pretty">
              Agenda, confirmações e retornos para a sua clínica, sem planilhas e sem esquecer ninguém.
            </p>
          </div>
          <ul className="space-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-primary">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="leading-snug">
                  <p className="text-sm font-medium text-sidebar-accent-foreground">{title}</p>
                  <p className="text-sm text-sidebar-foreground/70">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-sidebar-foreground/50">© Bumera</p>
      </aside>
      <div className="flex flex-col px-4 py-8 sm:px-8">
        <BrandMark className="lg:hidden" />
        <div className="flex flex-1 items-center justify-center py-10">
          <FadeIn className="w-full max-w-sm">{children}</FadeIn>
        </div>
      </div>
    </main>
  );
}
