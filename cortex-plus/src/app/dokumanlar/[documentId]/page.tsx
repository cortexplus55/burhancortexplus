import Link from "next/link";
import { notFound } from "next/navigation";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { TopicMapEditor } from "@/components/documents/topic-map-editor";
import { DocumentDeleteButton } from "@/components/documents/document-delete-button";
import { DocumentRetryButton } from "@/components/documents/document-retry-button";
import { processErrorLabel } from "@/lib/documents/error-labels";
import { isProcessingStale } from "@/lib/documents/processing-stale";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import {
  isFeatureEnabled,
  PDF_LEARNING_V2_FLAG,
} from "@/lib/admin/feature-flags";
import { loadTopicMapSnapshot } from "@/lib/documents/pdf-learning-v2";
import { createServiceClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { DocumentPdfPreview } from "@/components/documents/document-pdf-preview";

export const metadata = { title: "Belge" };
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ documentId: string }>;
  searchParams: Promise<{ page?: string }>;
};

const statusLabels: Record<string, string> = {
  pending: "Bekliyor",
  processing: "İşleniyor",
  completed: "Hazır",
  failed: "Başarısız",
};

export default async function DocumentDetailPage({ params, searchParams }: PageProps) {
  const { documentId } = await params;
  const { page: pageParam } = await searchParams;
  const initialPage = Math.max(1, Number(pageParam) || 1);
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);
  const service = createServiceClient();
  const pdfLearningV2 = await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG);

  const { data: doc } = await service
    .from("documents")
    .select(
      "id, user_id, file_name, status, page_count, mime_type, storage_path, error_message, created_at, updated_at, topic_map_status, topic_map_updated_at, deleted_at",
    )
    .eq("id", documentId)
    .maybeSingle();

  if (!doc || doc.deleted_at || doc.user_id !== user.id) notFound();

  const completed = doc.status === "completed";
  const isPdf = doc.mime_type === "application/pdf";
  let pdfSignedUrl: string | null = null;
  if (completed && isPdf && doc.storage_path) {
    const { data: signed } = await service.storage
      .from("documents")
      .createSignedUrl(doc.storage_path as string, 600);
    pdfSignedUrl = signed?.signedUrl ?? null;
  }
  const mapReady =
    doc.topic_map_status === "ready" || doc.topic_map_status === "reviewed";
  const canGenerate = completed && (!pdfLearningV2 || mapReady);

  const snapshot =
    pdfLearningV2 && completed
      ? await loadTopicMapSnapshot(service, documentId)
      : null;

  const topicCount = snapshot?.topics.length ?? 0;
  const estMinutes = Math.max(30, topicCount * 22);
  const estHours = Math.floor(estMinutes / 60);
  const estRem = estMinutes % 60;
  const estLabel =
    estHours > 0
      ? `${estHours} saat${estRem ? ` ${estRem} dakika` : ""}`
      : `${estMinutes} dakika`;

  // Bu belgeye bağlı üretilenler ve varsa bu belgeden kurulmuş çalışma planı.
  const [{ data: quizzes }, { data: sets }, { data: podcasts }, { data: prep }] =
    await Promise.all([
      supabase
        .from("quizzes")
        .select("id, title, created_at")
        .eq("user_id", user.id)
        .eq("document_id", documentId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("flashcard_sets")
        .select("id, title, created_at")
        .eq("user_id", user.id)
        .eq("document_id", documentId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("podcasts")
        .select("id, title, created_at")
        .eq("user_id", user.id)
        .eq("document_id", documentId)
        .order("created_at", { ascending: false })
        .limit(5),
      service
        .from("exam_preps")
        .select("id, title")
        .eq("user_id", user.id)
        .eq("document_id", documentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const artifacts = [
    ...(quizzes ?? []).map((q) => ({
      id: `quiz-${q.id}`,
      label: `Quiz · ${q.title}`,
      href: "/quizler",
      at: q.created_at as string,
    })),
    ...(sets ?? []).map((s) => ({
      id: `set-${s.id}`,
      label: `Flashcard · ${s.title}`,
      href: "/flashcardlar",
      at: s.created_at as string,
    })),
    ...(podcasts ?? []).map((p) => ({
      id: `pod-${p.id}`,
      label: `Podcast · ${p.title}`,
      href: `/studio/podcast?podcastId=${p.id}`,
      at: p.created_at as string,
    })),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 6);

  const planHref = prep
    ? `/deneme-sinavlari/${prep.id}`
    : `/deneme-sinavlari/olustur?documentId=${documentId}`;
  const planLabel = prep ? "Çalışmaya devam et" : "Çalışma planımı oluştur";
  const failedLabel =
    processErrorLabel(doc.error_message as string | null) ??
    "Belge işlenemedi. Yeniden işlemeyi veya tekrar yüklemeyi dene.";

  return (
    <ParitySorShell {...shell}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 pb-24">
        <div className="space-y-1">
          <Link
            href="/dokumanlar"
            className="text-xs text-[var(--cs-muted)] underline"
          >
            ← Belgeler
          </Link>
          <h1 className="truncate text-xl font-semibold text-[var(--cs-text)]">
            {doc.file_name}
          </h1>
          <p className="text-sm text-[var(--cs-muted)]">
            {statusLabels[doc.status] ?? doc.status}
            {doc.page_count ? ` · ${doc.page_count} sayfa` : ""}
            {doc.updated_at ? ` · Son işlem ${formatDate(doc.updated_at)}` : ""}
          </p>
        </div>

        {completed ? (
          <section className="cs-pay-card space-y-3 p-5">
            <p className="text-lg font-semibold text-[var(--cs-text)]">
              Belgen hazır.
            </p>
            {topicCount > 0 ? (
              <p className="text-sm text-[var(--cs-muted)]">
                {topicCount} konu bulduk. Yaklaşık çalışma süresi: {estLabel}.
              </p>
            ) : (
              <p className="text-sm text-[var(--cs-muted)]">
                Konu haritası hazırlanınca çalışma planını oluşturabilirsin.
              </p>
            )}
            {canGenerate ? (
              <Link
                href={planHref}
                className="inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-amber-500 px-5 py-3 text-sm font-bold text-black hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 sm:w-auto"
              >
                {planLabel}
              </Link>
            ) : (
              <p className="text-sm text-[var(--cs-muted)]">
                Üretim araçları konu haritası hazır olunca açılır.
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <ActionChip
                href={`/ogretmen?belge=${documentId}`}
                label="Belgeye soru sor"
                enabled={completed}
              />
              <ActionChip
                href={`/studio/quiz?documentId=${documentId}`}
                label="Quiz"
                enabled={canGenerate}
              />
              <ActionChip
                href={`/studio/flashcard?documentId=${documentId}`}
                label="Flashcard"
                enabled={canGenerate}
              />
              <ActionChip
                href={`/studio/podcast?documentId=${documentId}`}
                label="Podcast"
                enabled={canGenerate}
              />
            </div>
          </section>
        ) : doc.status === "failed" ? (
          <section className="cs-pay-card space-y-3 p-5">
            <p className="text-sm text-red-300" role="alert">
              {failedLabel}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <DocumentRetryButton documentId={documentId} />
              <Link
                href="/dokumanlar"
                className="text-xs text-[var(--cs-muted)] underline underline-offset-2"
              >
                Yeni belge yükle
              </Link>
            </div>
          </section>
        ) : isProcessingStale(doc.status, doc.updated_at as string | null) ? (
          <section className="cs-pay-card space-y-3 p-5">
            <p className="text-sm text-amber-200" role="status">
              İşleme takıldı — belge yarım saatten uzun süredir hazırlanamadı.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <DocumentRetryButton documentId={documentId} />
              <Link
                href="/dokumanlar"
                className="text-xs text-[var(--cs-muted)] underline underline-offset-2"
              >
                Yeni belge yükle
              </Link>
            </div>
          </section>
        ) : (
          <section className="cs-pay-card p-5 text-sm text-[var(--cs-muted)]" role="status">
            {doc.status === "processing"
              ? "Belgen okunuyor ve içerik hazırlanıyor…"
              : "Belge bekliyor…"}
          </section>
        )}

        {pdfSignedUrl ? (
          <DocumentPdfPreview signedUrl={pdfSignedUrl} initialPage={initialPage} />
        ) : null}

        {snapshot?.topics?.length ? (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-[var(--cs-text)]">
              Çıkarılan konular
            </h2>
            <ul className="space-y-1 text-sm text-[var(--cs-muted)]">
              {snapshot.topics.slice(0, 12).map((t) => (
                <li key={t.id}>· {t.title}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {artifacts.length ? (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-[var(--cs-muted)]">
              Bu belgeden üretilenler
            </h2>
            <ul className="space-y-1 text-sm">
              {artifacts.map((a) => (
                <li key={a.id}>
                  <Link
                    href={a.href}
                    className="text-[var(--cs-text)] underline-offset-2 hover:underline"
                  >
                    {a.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="flex items-center gap-3">
          <DocumentDeleteButton documentId={documentId} />
        </div>

        {pdfLearningV2 && snapshot ? (
          <section className="space-y-3 border-t border-white/10 pt-6">
            <h2 className="text-sm font-semibold text-[var(--cs-text)]">
              Konu haritası
            </h2>
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
              mapUpdatedAt={
                (doc.topic_map_updated_at as string | null) ?? null
              }
              mapReady={mapReady}
              hidePlanLink
              coverage={
                snapshot.coverage
                  ? {
                      status: snapshot.coverage.status,
                      summary: snapshot.coverage.summary,
                      contentPages: snapshot.coverage.contentPages,
                      coveredPages: snapshot.coverage.coveredPages,
                      skippedPages: snapshot.coverage.skippedPages,
                      unreadablePages: snapshot.coverage.unreadablePages,
                      uncoveredContentPages:
                        snapshot.coverage.uncoveredContentPages,
                    }
                  : null
              }
            />
          </section>
        ) : null}
      </div>
    </ParitySorShell>
  );
}

function ActionChip({
  href,
  label,
  enabled,
}: {
  href: string;
  label: string;
  enabled: boolean;
}) {
  if (!enabled) {
    return (
      <span
        className="cursor-not-allowed rounded-full border border-white/10 px-3 py-1.5 text-xs text-[var(--cs-muted)] opacity-50"
        title="Belge hazır değil"
        aria-disabled="true"
      >
        {label}
        <span className="sr-only"> (belge hazır olunca açılır)</span>
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-[var(--cs-text)] hover:border-amber-500/40"
    >
      {label}
    </Link>
  );
}
