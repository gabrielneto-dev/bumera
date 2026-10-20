import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
  tone?: "light" | "dark";
}

/** Logo tile + wordmark. `tone` is the surface it sits on. */
export function BrandMark({ className, tone = "light" }: BrandMarkProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className="flex size-9 items-center justify-center rounded-xl bg-sidebar-primary font-heading text-xl text-sidebar-primary-foreground"
      >
        B
      </span>
      <span className={cn("font-heading text-xl tracking-tight", tone === "dark" && "text-sidebar-accent-foreground")}>Bumera</span>
    </div>
  );
}
