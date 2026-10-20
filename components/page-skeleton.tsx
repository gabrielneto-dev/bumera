import { Skeleton } from "@/components/ui/skeleton";

/** Page-level placeholder; also used inside the shell while a page loads. */
export function PageContentSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando" className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}

/** Whole-screen placeholder shown while the session resolves. */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando" className="flex min-h-dvh">
      <div className="hidden w-64 shrink-0 bg-sidebar md:block" />
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
        <PageContentSkeleton />
      </div>
    </div>
  );
}
