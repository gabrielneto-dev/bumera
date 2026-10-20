/** Instant fallback while a signed-in page loads its request-time data. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Carregando" className="space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-72 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
