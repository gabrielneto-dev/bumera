import { Suspense } from "react";
import { safeNextPath } from "@/lib/safe-redirect";
import { SignUpForm } from "./sign-up-form";

export const metadata = { title: "Criar conta" };

export default function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <SignUpContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SignUpContent({ searchParams }: { searchParams: PageProps<"/sign-up">["searchParams"] }) {
  const params = await searchParams;
  return <SignUpForm next={safeNextPath(params.next)} />;
}
