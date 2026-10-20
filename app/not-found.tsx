import { Compass } from "lucide-react";
import Link from "next/link";
import { CenteredCard } from "@/components/auth/centered-card";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Página não encontrada" };

export default function NotFound() {
  return (
    <CenteredCard icon={Compass} eyebrow="Erro 404" title="Página não encontrada">
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground text-pretty">
          O endereço pode ter mudado ou nunca ter existido. Volte para a agenda e continue de lá.
        </p>
        <Link href="/agenda" className={buttonVariants({ size: "lg", className: "h-10 w-full text-sm" })}>
          Ir para a agenda
        </Link>
      </div>
    </CenteredCard>
  );
}
