import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { DocumentRetryButton } from "@/components/documents/document-retry-button";
import { DocumentDeleteButton } from "@/components/documents/document-delete-button";
import { DocumentStatusPoller } from "@/components/documents/document-status-poller";
import { EmptyState } from "@/components/ui-kit/empty-state";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  isFeatureEnabled,
  PDF_LEARNING_V2_FLAG,
} from "@/lib/admin/feature-flags";
import { createServiceClient } from "@/lib/supabase/server";
import {
  processErrorLabel,
  topicMapErrorLabel,
} from "@/lib/documents/error-labels";
import { DOCUMENT_EMPTY_DESCRIPTION } from "@/lib/documents/upload-labels";
import { isProcessingStale } from "@/lib/documents/processing-stale";

export const metadata = { title: "Belgelerim" };

const statusLabels: Record<string, string> = {
  pending: "Bekliyor",
  processing: "İşleniyor",
  completed: "Hazır",
  failed: "Başarısız",
};

const processingHints: Record<string, string> = {
  pending: "Dosya yükleniyor; yarıda kaldıysa yeniden yükle",
  processing: "Belgen okunuyor",
  completed: "Belgen hazır",
  failed: "İşlem başarısız",
};

const topicMapLabels: Record<string, string> = {
  none: "Harita yok",
  pending: "Harita çıkarılıyor",
  ready: "Harita hazır",
  reviewed: "Harita gözden geçirildi",
  failed: "Harita hazır değil",
};

function mapReady(status: string | null | undefined) {
  return status === "ready" || status === "reviewed";
}

export default async function DokumanlarPage() {
  const { supabase, user } = await requireUser();
  const service = createServiceClient();
  const pdfLearningV2 = await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG);

  const { data: documents } = await supabase
    .from("documents")
    .select(
      "id, file_name, status, size_bytes, created_at, updated_at, error_message, topic_map_status, topic_map_error, page_count, source_page_count, scan_pages_skipped",
    )
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(30);

  // Her belgenin kendi yolu (3 Ekim 2026). Düğme eskiden her basışta yeni
  // hazırlık kuruyordu; aynı trigonometri belgesinin üç ayrı yolu olmuştu.
  const documentIds = (documents ?? []).map((d) => d.id);
  const { data: prepRows } = documentIds.length
    ? await service
        .from("exam_preps")
        .select("id, document_id, created_at")
        .eq("user_id", user.id)
        .in("document_id", documentIds)
        .order("created_at", { ascending: false })
    : { data: [] };
  const prepByDocument = new Map<string, string>();
  for (const row of prepRows ?? []) {
    const documentId = row.document_id as string | null;
    if (documentId && !prepByDocument.has(documentId)) prepByDocument.set(documentId, row.id as string);
  }

  const activeDocumentIds = (documents ?? []).filter(
    (d) =>
      (d.status === "processing" && d.topic_map_status !== "failed") ||
      (pdfLearningV2 && d.status === "completed" && d.topic_map_status === "pending"),
  ).map((d) => d.id);

  return (
    <AppShell title="Belgelerim">
      <DocumentStatusPoller documentIds={activeDocumentIds} />
      {/* 3 Ekim 2026: Belgeler artık "Daha fazla" menüsünde ve sınav sayfalarıyla
          aynı tasarımda. Yeni belge sınav hazırlığı kurulurken o derse
          yüklenir (Astra); burada ayrı yükleme formu yok. */}
      <div className="cp-docs">
        <div className="cp-docs-intro">
          <p>Her belge kendi sınav yoluna bağlı. Yeni belgeyi sınav hazırlığı kurarken yükle.</p>
          <Link href="/deneme-sinavlari/olustur" className="cp-docs-new">
            <Plus className="h-4 w-4" aria-hidden />
            Yeni sınav hazırlığı
          </Link>
        </div>

        {documents?.length ? (
          <ul className="cp-docs-list">
            {documents.map((document) => {
              const ready =
                document.status === "completed" &&
                (!pdfLearningV2 || mapReady(document.topic_map_status));
              const completed = document.status === "completed";
              // Out of map attempts: a calm "Tekrar dene", never an error.
              const mapStopped =
                pdfLearningV2 &&
                (document.status === "processing" || document.status === "completed") &&
                document.topic_map_status === "failed";
              const prepId = prepByDocument.get(document.id);
              const meta = [
                document.page_count
                  ? `${document.page_count} sayfa`
                  : `${Math.round((document.size_bytes ?? 0) / 1024)} KB`,
                formatDate(document.created_at),
                mapStopped
                  ? "Belgen kaydedildi"
                  : document.status !== "completed"
                  ? processingHints[document.status] ?? statusLabels[document.status]
                  : null,
                processErrorLabel(document.error_message),
                pdfLearningV2 && document.topic_map_status && document.topic_map_status !== "ready"
                  ? topicMapLabels[document.topic_map_status] ?? document.topic_map_status
                  : null,
                // Only a stopped map carries a hint, and it has its button.
                mapStopped && document.topic_map_error ? topicMapErrorLabel(document.topic_map_error) : null,
              ].filter(Boolean);

              return (
                <li key={document.id} className="cp-docs-card">
                  <div className="cp-docs-head">
                    <span className="cp-docs-icon" aria-hidden>
                      <FileText className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="cp-docs-name">{document.file_name}</p>
                      <p className="cp-docs-meta">{meta.join(" · ")}</p>
                      {/* Ücretsiz plan: toplam 5 sayfa; resim sayfası hakkı (3 Ekim 2026). */}
                      {document.source_page_count && document.page_count && document.source_page_count > document.page_count ? (
                        <p className="cp-docs-note">
                          Ücretsiz planda {document.source_page_count} sayfanın ilk {document.page_count} sayfası işlendi.{" "}
                          <Link href="/pay?returnTo=%2Fdokumanlar">Tamamı için Plus</Link>
                        </p>
                      ) : null}
                      {document.scan_pages_skipped ? (
                        <p className="cp-docs-note">
                          {document.scan_pages_skipped} resim sayfası okunmadı; bu ayki taranmış sayfa hakkın doldu.
                        </p>
                      ) : null}
                    </div>
                    <span className={cn("cp-docs-status", `cp-docs-status--${document.status}`)}>
                      {mapStopped ? "Bekliyor" : (statusLabels[document.status] ?? document.status)}
                    </span>
                  </div>

                  <div className="cp-docs-actions">
                    {ready ? (
                      <Link
                        href={prepId ? `/deneme-sinavlari/${prepId}` : `/deneme-sinavlari/olustur?documentId=${document.id}`}
                        className="cp-docs-primary"
                      >
                        {prepId ? "Yoluna devam et" : "Sınav hazırlığı kur"}
                      </Link>
                    ) : null}
                    {completed ? (
                      <>
                        <Link href={`/ogretmen?belge=${document.id}`} className="cp-docs-link">
                          Belgeye soru sor
                        </Link>
                        <Link href={`/dokumanlar/${document.id}`} className="cp-docs-link">
                          {ready ? "Belge detayı" : "Konu haritasını aç"}
                        </Link>
                      </>
                    ) : null}
                    <span className="cp-docs-tools">
                      {document.status === "failed" ||
                      mapStopped ||
                      (document.status === "processing" &&
                        isProcessingStale(document.status, document.updated_at)) ? (
                        <DocumentRetryButton documentId={document.id} />
                      ) : null}
                      <DocumentDeleteButton documentId={document.id} />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            variant="parity"
            icon={FileText}
            title="Henüz bir belgen yok."
            description={DOCUMENT_EMPTY_DESCRIPTION}
            actionHref="/deneme-sinavlari/olustur"
            actionLabel="Sınav hazırlığı kur"
          />
        )}
      </div>
    </AppShell>
  );
}
