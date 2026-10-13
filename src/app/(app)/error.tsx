"use client";

import { useEffect } from "react";
import { ServerCrash } from "lucide-react";
import { Button } from "@/components/ui/Button";

/** Route-level error boundary, e.g. when the data service (FastAPI backend) is unreachable. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-line bg-surface px-4 py-16 text-center">
      <ServerCrash aria-hidden className="size-7 text-neg" />
      <h1 className="text-lg font-semibold text-ink">Data temporarily unavailable</h1>
      <p className="max-w-md text-sm text-ink-3">
        The odds data service could not be reached. If you are running locally, check that the backend is running (see backend/README.md) and that
        API_BASE_URL points to it.
      </p>
      <Button variant="secondary" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
