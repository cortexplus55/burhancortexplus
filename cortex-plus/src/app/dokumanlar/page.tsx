import { FileText } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { DocumentUpload } from "@/components/documents/document-upload";
import { DocumentRetryButton } from "@/components/documents/document-retry-button";
import { DocumentDeleteButton } from "@/components/documents/document-delete-button";
import { DocumentStatusPoller } from "@/components/documents/document-status-poller";
import { EmptyState, SectionCard } from "@/components/ui-kit/empty-state";
import { requireUser } from "@/lib/auth/session";
import { getCreditCost } from "@/lib/credits/rules";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  isFeatureEnabled,
  PDF_LEARNING_V2_FLAG,
} from "@/lib/admin/feature-flags";
import { createServiceClient } from "@/lib/supabase/server";
import {
  DOCUMENT_EMPTY_DESCRIPTION,
  DOCUMENT_TYPE_REJECTED,
} from "@/lib/documents/upload-labels";

export const metadata = { title: "Belgeler" };

const statusLabels: Record<string, string> = {
  pending: "Bekliyor",
  processing: "İşleniyor",
  completed: "Hazır",
  failed: "Başarısız",
};

const processingHints: Record<string, string> = {
  pending: "Dosyan yükleniyor",
  processing: "Belgen okunuyor",
  completed: "Belgen hazır",
  failed: "İşlem başarısız",
};

const topicMapLabels: Record<string, string> = {
  none: "Harita yok",
  pending: "Harita çıkarılıyor",
  ready: "Harita hazır",
  reviewed: "Harita gözden geçirildi",
  failed: "Harita başarısız",
};

const topicMapErrorLabels: Record<string, string> = {
  topic_map_unavailable: "Konular çıkarılamadı — belgeyi tekrar yüklemeyi dene",
  document_status_update_failed: "Kaydedilemedi — tekrar dene",
};

const processErrorLabels: Record<string, string> = {
  download_failed: "Dosya depodan okunamadı — tekrar dene",
  processing_failed: "Belge işlenemedi — tekrar dene",
  encrypted_pdf: "Bu PDF şifreli olduğu için okunamıyor.",
  password_protected: "Bu PDF şifreli olduğu için okunamıyor.",
  too_large: "Bu dosya izin verilen maksimum boyuttan büyük.",
  unsupported_type: DOCUMENT_TYPE_REJECTED,
  unreadable_document: "Belgenin bazı sayfalarında okunabilir metin bulunamadı.",
  no_text: "Belgenin bazı sayfalarında okunabilir metin bulunamadı.",
  openai_missing: "Metin hazırlama servisi şu an kapalı — biraz sonra dene",
  embed_failed: "İçerik hazırlanamadı — tekrar dene",
};

function topicMapErrorLabel(code: string) {
  return topicMapErrorLabels[code] ?? "Belge işlenemedi — tekrar dene";
}

function processErrorLabel(code: string | null) {
  if (!code) return null;
  if (processErrorLabels[code]) return processErrorLabels[code];
  if (/^[a-z_]+$/i.test(code) && !code.includes(" ")) {
    return "Belge işlenemedi — tekrar dene";
  }
  return code;
}

function statusClass(status: string) {
  if (status === "completed") return "bg-amber-500/20 text-amber-200";
  if (status === "failed") return "bg-red-500/15 text-red-300";
  if (status === "processing") return "bg-white/10 text-[var(--cs-text)]";
  return "bg-white/5 text-[var(--cs-muted)]";
}

function mapReady(status: string | null | undefined) {
  return status === "ready" || status === "reviewed";
}

export default async function DokumanlarPage() {
  const { supabase, user } = await requireUser();
  const cost = await getCreditCost("DOCUMENT_PAGE_PROCESS");
  const service = createServiceClient();
  const pdfLearningV2 = await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG);

  const { data: documents } = await supabase
    .from("documents")
    .select(
      "id, file_name, status, size_bytes, created_at, error_message, topic_map_status, topic_map_error, page_count",
    )
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(30);

  const anyProcessing = (documents ?? []).some(
    (d) =>
      d.status === "processing" ||
      d.status === "pending" ||
      (pdfLearningV2 && d.status === "completed" && d.topic_map_status === "pending"),
  );

  return (
    <AppShell
      title="Belgeler"
      creditHint={`Belge işleme: sayfa başına ${cost} kredi.`}
    >
      <DocumentStatusPoller active={anyProcessing} />
      <div className="space-y-6">
        <SectionCard
          variant="parity"
          title="Belge yükle"
          description="Yüklediğin kaynaklar yalnızca senin hesabına bağlıdır."
        >
          <DocumentUpload
            creditCost={cost}
            variant="parity"
            learningV2={pdfLearningV2}
          />
        </SectionCard>

        {documents?.length ? (
          <ul className="space-y-4">
            {documents.map((document) => {
              const ready =
                document.status === "completed" &&
                (!pdfLearningV2 || mapReady(document.topic_map_status));
              const completed = document.status === "completed";

              return (
                <li key={document.id} className="cs-pay-card space-y-3 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--cs-text)]">
                        {document.file_name}
                      </p>
                      <p className="text-xs text-[var(--cs-muted)]">
                        {document.page_count
                          ? `${document.page_count} sayfa · `
                          : `${Math.round((document.size_bytes ?? 0) / 1024)} KB · `}
                        {formatDate(document.created_at)}
                        {document.status !== "completed"
                          ? ` · ${processingHints[document.status] ?? statusLabels[document.status]}`
                          : " · Belgen hazır"}
                        {processErrorLabel(document.error_message)
                          ? ` · ${processErrorLabel(document.error_message)}`
                          : ""}
                        {pdfLearningV2 && document.topic_map_status
                          ? ` · ${topicMapLabels[document.topic_map_status] ?? document.topic_map_status}`
                          : ""}
                        {pdfLearningV2 && document.topic_map_error
                          ? ` · ${topicMapErrorLabel(document.topic_map_error)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {document.status === "processing" ||
                      document.status === "failed" ||
                      document.status === "pending" ? (
                        <DocumentRetryButton documentId={document.id} />
                      ) : null}
                      <DocumentDeleteButton documentId={document.id} />
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                          statusClass(document.status),
                        )}
                      >
                        {statusLabels[document.status] ?? document.status}
                      </span>
                    </div>
                  </div>

                  {ready ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                      <Link
                        href={`/deneme-sinavlari/olustur?documentId=${document.id}`}
                        className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400"
                      >
                        Çalışma planımı oluştur
                      </Link>
                      <Link
                        href={`/dokumanlar/${document.id}`}
                        className="text-xs font-medium text-[var(--cs-muted)] underline underline-offset-2"
                      >
                        Belge detayı
                      </Link>
                      <Link
                        href={`/ogretmen?belge=${document.id}`}
                        className="text-xs text-[var(--cs-muted)] underline underline-offset-2"
                      >
                        Belgeye soru sor
                      </Link>
                      <Link
                        href={`/studio/podcast?documentId=${document.id}`}
                        className="text-xs text-[var(--cs-muted)] underline underline-offset-2"
                      >
                        Podcast oluştur
                      </Link>
                      <Link
                        href={`/studio/flashcard?documentId=${document.id}`}
                        className="text-xs text-[var(--cs-muted)] underline underline-offset-2"
                      >
                        Flashcard oluştur
                      </Link>
                      <Link
                        href={`/studio/quiz?documentId=${document.id}`}
                        className="text-xs text-[var(--cs-muted)] underline underline-offset-2"
                      >
                        Quiz oluştur
                      </Link>
                    </div>
                  ) : completed ? (
                    <div className="flex flex-wrap gap-3">
                      <Link
                        href={`/dokumanlar/${document.id}`}
                        className="text-xs font-medium underline"
                      >
                        Konu haritasını aç
                      </Link>
                      <Link
                        href={`/ogretmen?belge=${document.id}`}
                        className="text-xs underline text-[var(--cs-muted)]"
                      >
                        Belgeye soru sor
                      </Link>
                      <span className="text-xs text-[var(--cs-muted)]">
                        Quiz / podcast / plan için konu haritası hazır olmalı
                      </span>
                    </div>
                  ) : null}
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
            actionHref="/dokumanlar"
            actionLabel="Belge yükle"
          />
        )}
      </div>
    </AppShell>
  );
}
