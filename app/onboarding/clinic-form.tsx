"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { AuthError, AuthSubmit } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { clinicSlug } from "@/lib/slug";

export function ClinicForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);
    const name = String(new FormData(event.currentTarget).get("name")).trim();
    const { error: createError } = await authClient.organization.create({
      name,
      slug: clinicSlug(name),
    });
    setIsPending(false);
    if (createError) {
      setError("Não foi possível cadastrar a clínica. Tente novamente.");
      return;
    }
    router.push("/agenda");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name">Nome da clínica</Label>
        <Input id="name" name="name" autoComplete="organization" required minLength={2} className="h-10" />
      </div>
      <AuthError message={error} />
      <AuthSubmit isPending={isPending} pendingLabel="Cadastrando…">Cadastrar clínica</AuthSubmit>
    </form>
  );
}
