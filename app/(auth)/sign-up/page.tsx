"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

const MIN_PASSWORD_LENGTH = 10;

export default function SignUpPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);
    const form = new FormData(event.currentTarget);
    const { error: signUpError } = await authClient.signUp.email({
      name: String(form.get("name")),
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setIsPending(false);
    if (signUpError) {
      setError(
        signUpError.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
          ? "Este e-mail já está cadastrado."
          : "Não foi possível criar a conta. Confira os dados e tente novamente.",
      );
      return;
    }
    router.push("/onboarding");
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h2 className="font-heading text-3xl tracking-tight">Criar conta</h2>
        <p className="text-sm text-muted-foreground">
          Em seguida você cadastra a sua clínica.
        </p>
      </header>
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">Seu nome</Label>
          <Input id="name" name="name" autoComplete="name" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            aria-describedby="password-hint"
          />
          <p id="password-hint" className="text-xs text-muted-foreground">
            Mínimo de {MIN_PASSWORD_LENGTH} caracteres.
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Criando…" : "Criar conta"}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link href="/sign-in" className="font-medium text-primary underline-offset-4 hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
