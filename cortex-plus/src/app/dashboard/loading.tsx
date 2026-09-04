import { AppShell } from "@/components/layout/app-shell";
import { AppPageSkeleton } from "@/components/ui-kit/app-page-skeleton";

export default async function DashboardLoading() {
  return (
    <AppShell title="Panel">
      <AppPageSkeleton variant="dashboard" />
    </AppShell>
  );
}
