import { FileText } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { DocumentUpload } from "@/components/documents/document-upload";
import { EmptyState, SectionCard } from "@/components/ui-kit/empty-state";
import { requireUser } from "@/lib/auth/session";
import { getCreditCost } from "@/lib/credits/rules";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dokümanlar" };

const statusLabels: Record<string, string> = {
  pending: "Bekliyor",
  processing: "İşleniyor",
  completed: "Hazır",
  failed: "Başarısız",
};

function statusClass(status: string) {
  if (status === "completed") return "bg-amber-500/20 text-amber-200";
  if (status === "failed") return "bg-red-500/15 text-red-300";
  if (status === "processing") return "bg-white/10 text-[var(--astra-text)]";
  return "bg-white/5 text-[var(--astra-muted)]";
}

export default async function DokumanlarPage() {
  const { supabase, user } = await requireUser();
  const cost = await getCreditCost("DOCUMENT_PAGE_PROCESS");

  const { data: documents } = await supabase
    .from("documents")
    .select("id, file_name, status, size_bytes, created_at, error_message")
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
          <DocumentUpload creditCost={cost} variant="astra" />
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
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                    statusClass(document.status),
                  )}
                >
                  {statusLabels[document.status] ?? document.status}
                </span>
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
