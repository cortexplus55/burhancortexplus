import { WrittenStudio } from "@/components/learning/studio/written-studio";
import { getCreditCost } from "@/lib/credits/rules";
import { requireStudentArea } from "@/lib/auth/session";
import { loadCompletedDocumentOptions } from "@/lib/documents/document-options";

export const metadata = { title: "Yazılı deneme" };
export const dynamic = "force-dynamic";

export default async function WrittenStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; documentId?: string }>;
}) {
  const { supabase, user } = await requireStudentArea();
  const [creditCost, documents, params] = await Promise.all([
    getCreditCost("PRACTICE_EXAM_GENERATE"),
    loadCompletedDocumentOptions(supabase, user.id),
    searchParams,
  ]);
  const initialDocumentId =
    params.documentId && documents.some((d) => d.id === params.documentId) ? params.documentId : null;
  return (
    <WrittenStudio
      creditCost={creditCost}
      initialTopic={params.topic ?? ""}
      documents={documents}
      initialDocumentId={initialDocumentId}
    />
  );
}
