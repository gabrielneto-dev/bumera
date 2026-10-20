import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
}

export function EmptyState({ icon: Icon, title, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card/60 px-6 py-14 text-center">
      <span className="mb-4 flex size-11 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="font-heading text-xl">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground text-pretty">{children}</p>}
    </div>
  );
}
