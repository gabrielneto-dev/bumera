import { Suspense } from "react";
import { safeNextPath } from "@/lib/safe-redirect";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Entrar" };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-muted" />}>
      <SignInContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SignInContent({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  const params = await searchParams;
  return <SignInForm next={safeNextPath(params.next)} />;
}
