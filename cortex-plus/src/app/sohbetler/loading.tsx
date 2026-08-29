import { AppShell } from "@/components/layout/app-shell";
import { AppPageSkeleton } from "@/components/ui-kit/app-page-skeleton";

export default async function SohbetlerLoading() {
  return (
    <AppShell title="Sohbetler">
      <AppPageSkeleton />
    </AppShell>
  );
}
