import { AppShell } from "@/components/layout/app-shell";
import { AppPageSkeleton } from "@/components/ui-kit/app-page-skeleton";

export default async function FlashcardlarLoading() {
  return (
    <AppShell title="Flashcard">
      <AppPageSkeleton />
    </AppShell>
  );
}
