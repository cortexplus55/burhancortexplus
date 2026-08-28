import { AppShell } from "@/components/layout/app-shell";
import { DocumentUpload } from "@/components/documents/document-upload";
import { EmptyState, SectionCard } from "@/components/ui-kit/empty-state";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/session";
import { getCreditCost } from "@/lib/credits/rules";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Dokümanlar" };

const statusLabels: Record<string, string> = {
  pending: "Bekliyor",
  processing: "İşleniyor",
  completed: "Hazır",
  failed: "Başarısız",
};

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
          title="Doküman yükle"
          description="Yüklediğin kaynaklar yalnızca senin hesabına bağlıdır ve özel depolamada tutulur."
        >
          <DocumentUpload creditCost={cost} />
        </SectionCard>

        {documents?.length ? (
          <ul className="divide-y rounded-lg border">
            {documents.map((document) => (
              <li
                key={document.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{document.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {Math.round(document.size_bytes / 1024)} KB ·{" "}
                    {formatDate(document.created_at)}
                    {document.error_message ? ` · ${document.error_message}` : ""}
                  </p>
                </div>
                <Badge
                  variant={document.status === "completed" ? "default" : "secondary"}
                >
                  {statusLabels[document.status] ?? document.status}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Henüz doküman yüklemedin"
            description="Ders notunu yükle, AI öğretmen yanıtlarında kaynak olarak kullansın."
          />
        )}
      </div>
    </AppShell>
  );
}
