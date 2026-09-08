import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { TopicMapEditor } from "@/components/documents/topic-map-editor";
import { requireUser } from "@/lib/auth/session";
import {
  isFeatureEnabled,
  PDF_LEARNING_V2_FLAG,
} from "@/lib/admin/feature-flags";
import { loadTopicMapSnapshot } from "@/lib/documents/pdf-learning-v2";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Konu haritası" };
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ documentId: string }> };

export default async function DocumentTopicMapPage({ params }: PageProps) {
  const { documentId } = await params;
  const { user } = await requireUser();
  const service = createServiceClient();

  if (!(await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG))) {
    redirect("/dokumanlar");
  }

  const { data: doc } = await service
    .from("documents")
    .select("id, user_id, file_name, status, deleted_at")
    .eq("id", documentId)
    .maybeSingle();

  if (!doc || doc.deleted_at || doc.user_id !== user.id) notFound();

  const snapshot = await loadTopicMapSnapshot(service, documentId);
  if (!snapshot) notFound();

  return (
    <AppShell
      title="Konu haritası"
      creditHint="PDF öğrenme v2 — kapsam ve kaynak sınırı."
    >
      <div className="mb-4 space-y-1">
        <Link
          href="/dokumanlar"
          className="text-xs text-[var(--astra-muted)] underline"
        >
          ← Dokümanlar
        </Link>
        <h1 className="truncate text-lg font-semibold text-[var(--astra-text)]">
          {doc.file_name}
        </h1>
        <p className="text-sm text-[var(--astra-muted)]">
          Belge durumu: {doc.status}. Okunamayan sayfalar genel bilgiyle
          doldurulmaz — aşağıdaki raporda görünür.
        </p>
      </div>

      <TopicMapEditor
        documentId={documentId}
        initialTopics={snapshot.topics.map((topic) => ({
          id: topic.id,
          title: topic.title,
          learningObjective: topic.learningObjective,
          studentNotes: topic.studentNotes,
          pageNumbers: topic.pageNumbers,
          isStudentEdited: topic.isStudentEdited,
        }))}
        initialBoundary={snapshot.sourceBoundaryMode}
        initialStatus={snapshot.topicMapStatus}
        coverage={
          snapshot.coverage
            ? {
                status: snapshot.coverage.status,
                summary: snapshot.coverage.summary,
                contentPages: snapshot.coverage.contentPages,
                coveredPages: snapshot.coverage.coveredPages,
                skippedPages: snapshot.coverage.skippedPages,
                unreadablePages: snapshot.coverage.unreadablePages,
                uncoveredContentPages: snapshot.coverage.uncoveredContentPages,
              }
            : null
        }
      />
    </AppShell>
  );
}
