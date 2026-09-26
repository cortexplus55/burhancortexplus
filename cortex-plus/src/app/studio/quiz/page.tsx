import { QuizStudio } from "@/components/learning/studio/quiz-studio";
import { getCreditCost } from "@/lib/credits/rules";
import { requireStudentArea } from "@/lib/auth/session";
import { loadCompletedDocumentOptions } from "@/lib/documents/document-options";

export const metadata = { title: "Quiz stüdyosu" };
export const dynamic = "force-dynamic";

export default async function QuizStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; documentId?: string }>;
}) {
  const { supabase, user } = await requireStudentArea();
  const [creditCost, documents, params] = await Promise.all([
    getCreditCost("QUIZ_GENERATE"),
    loadCompletedDocumentOptions(supabase, user.id),
    searchParams,
  ]);
  const initialDocumentId =
    params.documentId && documents.some((d) => d.id === params.documentId)
      ? params.documentId
      : null;
  return (
    <QuizStudio
      creditCost={creditCost}
      initialTopic={params.topic ?? ""}
      documents={documents}
      initialDocumentId={initialDocumentId}
    />
  );
}
