import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "BettingValue — Sports Betting Analytics",
    template: "%s · BettingValue",
  },
  description:
    "Odds comparison, expected value, props analytics and statistical trends. Phase 1 preview running on synthetic demonstration data.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#090c11",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
