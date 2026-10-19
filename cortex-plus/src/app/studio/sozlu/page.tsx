import { OralStudio } from "@/components/learning/studio/oral-studio";
import { getCreditCost } from "@/lib/credits/rules";
import { requireStudentArea } from "@/lib/auth/session";
import { loadCompletedDocumentOptions } from "@/lib/documents/document-options";

export const metadata = { title: "Sözlü deneme" };
export const dynamic = "force-dynamic";

/** 19 Ekim 2026: belgeden de çalışır (önce yalnız konu yazılıyordu). */
export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; documentId?: string }>;
}) {
  const { supabase, user } = await requireStudentArea();
  const [creditCost, documents, params] = await Promise.all([
    getCreditCost("ORAL_EXAM_GENERATE"),
    loadCompletedDocumentOptions(supabase, user.id),
    searchParams,
  ]);
  const initialDocumentId = documents.some((d) => d.id === params.documentId) ? params.documentId ?? null : null;
  return (
    <OralStudio
      creditCost={creditCost}
      initialTopic={params.topic ?? ""}
      documents={documents}
      initialDocumentId={initialDocumentId}
    />
  );
}
