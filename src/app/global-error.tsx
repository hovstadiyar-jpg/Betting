"use client";

/** Last-resort boundary for errors in the root layout itself. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#090c11", color: "#e7eaf0", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: 420, margin: "20vh auto", textAlign: "center", padding: 16 }}>
          <h1 style={{ fontSize: 18 }}>BettingValue is temporarily unavailable</h1>
          <p style={{ color: "#aab3c2", fontSize: 14 }}>Something went wrong while loading the application.</p>
          <button type="button" onClick={reset} style={{ marginTop: 12, padding: "6px 14px", borderRadius: 6 }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
