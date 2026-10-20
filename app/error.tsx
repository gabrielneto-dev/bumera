"use client";

import { TriangleAlert } from "lucide-react";
import { CenteredCard } from "@/components/auth/centered-card";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <CenteredCard icon={TriangleAlert} eyebrow="Algo deu errado" title="Não foi possível carregar">
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground text-pretty">
          Houve um problema inesperado. Tente de novo; se continuar, avise quem cuida do sistema.
        </p>
        <Button type="button" size="lg" className="h-10 w-full text-sm" onClick={reset}>
          Tentar novamente
        </Button>
      </div>
    </CenteredCard>
  );
}
