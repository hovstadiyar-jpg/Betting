import { unstable_rethrow } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { api, dataSource } from "@/lib/api";
import type { DatasetMeta, SearchEntry } from "@/lib/domain/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The shell must render even when the data service is down, so the page's error boundary
  // (app/(app)/error.tsx) can show a useful message inside the normal navigation.
  let searchIndex: SearchEntry[] = [];
  let feedMeta: DatasetMeta | undefined;
  try {
    const [index, matches] = await Promise.all([api.getSearchIndex(), api.getMatches()]);
    searchIndex = index;
    feedMeta = matches.meta;
  } catch (error) {
    unstable_rethrow(error);
    console.error("Layout data unavailable:", error);
  }
  return (
    <AppShell searchIndex={searchIndex} feedMeta={feedMeta} dataMode={dataSource}>
      {children}
    </AppShell>
  );
}
