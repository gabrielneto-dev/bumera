import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface AuthSubmitProps {
  isPending: boolean;
  pendingLabel: string;
  children: ReactNode;
}

export function AuthSubmit({ isPending, pendingLabel, children }: AuthSubmitProps) {
  return (
    <Button type="submit" size="lg" className="h-10 w-full text-sm" disabled={isPending}>
      {isPending && <Loader2 className="animate-spin" aria-hidden />}
      {isPending ? pendingLabel : children}
    </Button>
  );
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}
