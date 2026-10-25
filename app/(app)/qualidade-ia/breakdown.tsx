import type { ReactNode } from "react";

export interface BreakdownRow {
  label: string;
  value: number;
  /** Tailwind background for the bar, chosen by meaning (good, neutral, worth a look). */
  tone: "good" | "neutral" | "attention";
  hint?: string;
}

const TONE: Record<BreakdownRow["tone"], string> = {
  good: "bg-primary",
  neutral: "bg-muted-foreground/40",
  attention: "bg-destructive/70",
};

interface BreakdownProps {
  title: string;
  description: ReactNode;
  rows: readonly BreakdownRow[];
  empty: string;
}

/** A short list of counts drawn as bars on a shared scale, with the share each one has of the total. */
export function Breakdown({ title, description, rows, empty }: BreakdownProps) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <section aria-labelledby={`${title}-heading`} className="space-y-3 rounded-2xl border bg-card p-5">
      <div className="space-y-1">
        <h2 id={`${title}-heading`} className="font-heading text-lg tracking-tight">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.label} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span>{row.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  <span className="font-medium text-foreground">{row.value}</span> · {Math.round((row.value / total) * 100)}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
                <div className={`h-full rounded-full ${TONE[row.tone]}`} style={{ width: `${(row.value / max) * 100}%` }} />
              </div>
              {row.hint ? <p className="text-xs text-muted-foreground">{row.hint}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
