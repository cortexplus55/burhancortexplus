import { AppShell } from "@/components/layout/app-shell";
import { AppPageSkeleton } from "@/components/ui-kit/app-page-skeleton";

export default async function CalismaPlaniLoading() {
  return (
    <AppShell title="Çalışma planı">
      <AppPageSkeleton variant="study-plan" />
    </AppShell>
  );
}
