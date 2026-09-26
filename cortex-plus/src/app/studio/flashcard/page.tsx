import { FlashcardStudio } from "@/components/learning/studio/flashcard-studio";
import { getCreditCost } from "@/lib/credits/rules";
import { requireStudentArea } from "@/lib/auth/session";
import { loadCompletedDocumentOptions } from "@/lib/documents/document-options";

export const metadata = { title: "Flashcard stüdyosu" };
export const dynamic = "force-dynamic";

export default async function FlashcardStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; documentId?: string }>;
}) {
  const { supabase, user } = await requireStudentArea();
  const [creditCost, documents, params] = await Promise.all([
    getCreditCost("FLASHCARD_GENERATE"),
    loadCompletedDocumentOptions(supabase, user.id),
    searchParams,
  ]);
  const doc = documents.find((d) => d.id === params.documentId) ?? null;
  return (
    <FlashcardStudio
      creditCost={creditCost}
      initialTopic={params.topic ?? ""}
      sourceDocument={doc}
    />
  );
}
