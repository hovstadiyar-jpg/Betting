export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-7 w-56 animate-pulse rounded bg-surface-2" />
      <div className="h-4 w-96 max-w-full animate-pulse rounded bg-surface-2" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg border border-line bg-surface" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-lg border border-line bg-surface" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
