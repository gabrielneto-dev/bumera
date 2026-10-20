export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando" className="min-h-dvh">
      <div className="h-14 border-b bg-card" />
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-8 sm:px-6">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-72 animate-pulse rounded-md bg-muted" />
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}
