import { SearchX } from "lucide-react";

export function EmptyState({ title = "No results", message }: { title?: string; message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <SearchX aria-hidden className="size-6 text-ink-3" />
      <p className="text-sm font-medium text-ink-2">{title}</p>
      {message ? <p className="max-w-sm text-xs text-ink-3">{message}</p> : null}
    </div>
  );
}
