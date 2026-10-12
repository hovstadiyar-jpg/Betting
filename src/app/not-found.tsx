import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="font-mono text-xs text-ink-3">404</p>
      <h1 className="text-lg font-semibold text-ink">Page not found</h1>
      <p className="max-w-sm text-sm text-ink-3">The page you requested does not exist in this preview.</p>
      <Link href="/dashboard" className={buttonClasses("secondary", "md", "mt-2")}>
        Back to dashboard
      </Link>
    </div>
  );
}
