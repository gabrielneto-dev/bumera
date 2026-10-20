"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function SignInForm({ next }: { next?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);
    const form = new FormData(event.currentTarget);
    const { error: signInError } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setIsPending(false);
    if (signInError) {
      setError("E-mail ou senha incorretos.");
      return;
    }
    router.push(next ?? "/agenda");
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h2 className="font-heading text-3xl tracking-tight">Entrar</h2>
        <p className="text-sm text-muted-foreground">Acesse a agenda da sua clínica.</p>
      </header>
      <form onSubmit={onSubmit} className="space-y-5">
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
            autoComplete="current-password"
            required
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Entrando…" : "Entrar"}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Ainda não tem conta?{" "}
        <Link href={next ? `/sign-up?next=${encodeURIComponent(next)}` : "/sign-up"} className="font-medium text-primary underline-offset-4 hover:underline">
          Criar conta
        </Link>
      </p>
    </div>
  );
}
