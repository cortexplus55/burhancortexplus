import { ExplainStudio } from "@/components/learning/studio/explain-studio";
import { getCreditCost } from "@/lib/credits/rules";
import { requireStudentArea } from "@/lib/auth/session";
import { loadCompletedDocumentOptions } from "@/lib/documents/document-options";

export const metadata = { title: "Anlatarak öğren" };
export const dynamic = "force-dynamic";

/** 24 Ekim 2026: belgeden de çalışır; anlatım öğrencinin kendi notuna göre değerlendirilir. */
export default async function ExplainStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; documentId?: string }>;
}) {
  const { supabase, user } = await requireStudentArea();
  // Sohbetle aynı bütçeden harcıyor: tek model çağrısı, sohbetteki bir
  // soruyla aynı büyüklükte.
  const [creditCost, documents, params] = await Promise.all([
    getCreditCost("AI_CHAT_STANDARD"),
    loadCompletedDocumentOptions(supabase, user.id),
    searchParams,
  ]);
  const initialDocumentId = documents.some((d) => d.id === params.documentId) ? params.documentId ?? null : null;
  return (
    <ExplainStudio
      creditCost={creditCost}
      initialTopic={params.topic ?? ""}
      documents={documents}
      initialDocumentId={initialDocumentId}
    />
  );
}
