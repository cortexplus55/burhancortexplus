import { AppShell } from "@/components/layout/app-shell";
import { AppPageSkeleton } from "@/components/ui-kit/app-page-skeleton";

export default async function QuizlerLoading() {
  return (
    <AppShell title="Quizler">
      <AppPageSkeleton />
    </AppShell>
  );
}
