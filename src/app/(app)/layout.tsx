import { AppShell } from "@/components/layout/AppShell";
import { api } from "@/lib/api";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [searchIndex, matches] = await Promise.all([api.getSearchIndex(), api.getMatches()]);
  return (
    <AppShell searchIndex={searchIndex} feedMeta={matches.meta}>
      {children}
    </AppShell>
  );
}
