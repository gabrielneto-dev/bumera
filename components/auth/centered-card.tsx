import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";
import { FadeIn } from "@/components/motion";

interface CenteredCardProps {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  children: ReactNode;
}

/** Single centered card on a softly glowing page, used by one-off flows (onboarding, invitations). */
export function CenteredCard({ icon: Icon, eyebrow, title, children }: CenteredCardProps) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center overflow-hidden px-4 py-8 sm:px-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-48 left-1/2 size-[40rem] -translate-x-1/2 rounded-full bg-primary/[0.06] blur-3xl"
      />
      <BrandMark className="relative" />
      <div className="relative flex w-full flex-1 items-center justify-center py-10">
        <FadeIn className="w-full max-w-md">
          <div className="space-y-6 rounded-2xl border bg-card p-8 shadow-sm">
            <header className="space-y-4">
              <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                <Icon className="size-5" aria-hidden />
              </span>
              <div className="space-y-1.5">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{eyebrow}</p>
                <h1 className="font-heading text-3xl tracking-tight">{title}</h1>
              </div>
            </header>
            {children}
          </div>
        </FadeIn>
      </div>
    </main>
  );
}
