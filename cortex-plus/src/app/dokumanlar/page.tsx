import { FileText } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { DocumentUpload } from "@/components/documents/document-upload";
import { DocumentRetryButton } from "@/components/documents/document-retry-button";
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

export const metadata = { title: "Dokümanlar" };

const statusLabels: Record<string, string> = {
  pending: "Bekliyor",
  processing: "İşleniyor",
  completed: "Hazır",
  failed: "Başarısız",
};

const topicMapLabels: Record<string, string> = {
  none: "Harita yok",
  pending: "Harita çıkarılıyor",
  ready: "Harita hazır",
  reviewed: "Harita gözden geçirildi",
  failed: "Harita başarısız",
};

/**
 * Hata kodu öğrenciye ham gösterilmemeli — "topic_map_unavailable"
 * kimseye ne yapacağını söylemiyor. Bilinmeyen kod da sızmasın diye
 * eşleşmeyen her şey tek bir genel cümleye düşüyor.
 */
const topicMapErrorLabels: Record<string, string> = {
  topic_map_unavailable: "Konular çıkarılamadı — belgeyi tekrar yüklemeyi dene",
  document_status_update_failed: "Kaydedilemedi — tekrar dene",
};

function topicMapErrorLabel(code: string) {
  return topicMapErrorLabels[code] ?? "Belge işlenemedi — tekrar dene";
}

function statusClass(status: string) {
  if (status === "completed") return "bg-amber-500/20 text-amber-200";
  if (status === "failed") return "bg-red-500/15 text-red-300";
  if (status === "processing") return "bg-white/10 text-[var(--astra-text)]";
  return "bg-white/5 text-[var(--astra-muted)]";
}

export default async function DokumanlarPage() {
  const { supabase, user } = await requireUser();
  const cost = await getCreditCost("DOCUMENT_PAGE_PROCESS");
  const service = createServiceClient();
  const pdfLearningV2 = await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG);

  const { data: documents } = await supabase
    .from("documents")
    .select(
      "id, file_name, status, size_bytes, created_at, error_message, topic_map_status, topic_map_error",
    )
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <AppShell
      title="Dokümanlar"
      creditHint={`PDF işleme: sayfa başına ${cost} kredi.`}
    >
      <div className="space-y-6">
        <SectionCard
          variant="astra"
          title="Doküman yükle"
          description="Yüklediğin kaynaklar yalnızca senin hesabına bağlıdır ve özel depolamada tutulur."
        >
          <DocumentUpload
            creditCost={cost}
            variant="astra"
            learningV2={pdfLearningV2}
          />
        </SectionCard>

        {documents?.length ? (
          <ul className="space-y-2">
            {documents.map((document) => (
              <li
                key={document.id}
                className="astra-pay-card flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--astra-text)]">
                    {document.file_name}
                  </p>
                  <p className="text-xs text-[var(--astra-muted)]">
                    {Math.round(document.size_bytes / 1024)} KB ·{" "}
                    {formatDate(document.created_at)}
                    {document.error_message ? ` · ${document.error_message}` : ""}
                    {pdfLearningV2 && document.topic_map_status
                      ? ` · ${topicMapLabels[document.topic_map_status] ?? `harita: ${document.topic_map_status}`}`
                      : ""}
                    {pdfLearningV2 && document.topic_map_error
                      ? ` · ${topicMapErrorLabel(document.topic_map_error)}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {document.status === "completed" ? (
                    <Link
                      href={`/ogretmen?belge=${document.id}`}
                      className="text-xs underline"
                    >
                      Bu belgeyle sohbet et
                    </Link>
                  ) : null}
                  {pdfLearningV2 && document.status === "completed" ? (
                    <Link
                      href={`/dokumanlar/${document.id}`}
                      className="text-xs underline"
                    >
                      Konu haritası
                    </Link>
                  ) : null}
                  {pdfLearningV2 &&
                  document.status === "completed" &&
                  (document.topic_map_status === "ready" ||
                    document.topic_map_status === "reviewed") ? (
                    <Link
                      href={`/deneme-sinavlari/olustur?documentId=${document.id}`}
                      className="text-xs font-medium underline"
                    >
                      Sınav hazırlığı başlat
                    </Link>
                  ) : null}
                  {document.status === "processing" ||
                  document.status === "failed" ||
                  document.status === "pending" ? (
                    <DocumentRetryButton documentId={document.id} />
                  ) : null}
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                      statusClass(document.status),
                    )}
                  >
                    {statusLabels[document.status] ?? document.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            variant="astra"
            icon={FileText}
            title="Henüz doküman yüklemedin"
            description="Ders notunu yükle, AI öğretmen yanıtlarında kaynak olarak kullansın."
            actionHref="/ogretmen"
            actionLabel="Sor ekranına git"
          />
        )}
      </div>
    </AppShell>
  );
}
