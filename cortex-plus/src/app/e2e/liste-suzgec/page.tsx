import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { PageShell } from "@/components/parity/page-shell";
import { DocumentsBrowser } from "@/components/documents/documents-browser";
import { DocumentDeleteButton } from "@/components/documents/document-delete-button";
import { MyPrepsView } from "@/components/parity/my-preps-view";
import { documentKind } from "@/lib/documents/document-filter";
import { toPrepCard } from "@/lib/learning/prep-cards";
import { MAIN_CONTENT_ID } from "@/lib/ui/main-content";
import "@/styles/parity-shell.css";
import "@/styles/cx-shell.css";
import "@/styles/cx-pages.css";

export const dynamic = "force-dynamic";

/**
 * Uçtan uca fikstür (20 Kasım 2026, Faz 3): Belgelerim'in arama/süzgeç çubuğu ve silme penceresi, Sınav
 * hazırlıklarım'ın araması. Gerçek bileşenler, veritabanısız; adlar yer tutucu biçiminde.
 */
export default async function E2eListFilterPage({ searchParams }: { searchParams: Promise<{ ekran?: string }> }) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const { ekran } = await searchParams;

  if (ekran === "hazirliklar") {
    const card = (id: string, title: string, examType: string, examDate: string) =>
      toPrepCard({ id, title, exam_type: examType, target_score: 75, exam_date: examDate, view_count: 0 }, [], [{ status: "ready" }], "2026-11-20");
    const cards = [
      card("a", "Birinci hazırlık", "Birinci ders", "2026-12-10"),
      card("b", "İkinci hazırlık", "İKİNCİ DERS", "2026-12-20"),
      card("c", "Üçüncü hazırlık", "ikinci ders", "2026-10-01"),
    ];
    return (
      <div className="dark cp-sor-root">
        <main id={MAIN_CONTENT_ID} className="cp-sor-main">
          <MyPrepsView cards={cards} userInitial="A" />
        </main>
      </div>
    );
  }

  const docs = [
    { id: "d1", fileName: "Birinci belge.pdf", status: "ready" as const },
    { id: "d2", fileName: "Tahta fotoğrafı.jpg", status: "processing" as const },
    { id: "d3", fileName: "Üçüncü sunum.pptx", status: "error" as const },
  ];
  return (
    <div className="dark cp-sor-root">
      <main id={MAIN_CONTENT_ID} className="cp-sor-main cx-app-main">
        <PageShell title="Belgelerim">
          <div className="cp-docs">
            <DocumentsBrowser
              items={docs.map((doc) => ({
                id: doc.id,
                fileName: doc.fileName,
                status: doc.status,
                kind: documentKind(doc.fileName),
                card: (
                  <li key={doc.id} className="cp-docs-card">
                    <div className="cp-docs-head">
                      <span className="cp-docs-icon" aria-hidden>
                        <FileText className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="cp-docs-name">{doc.fileName}</p>
                      </div>
                    </div>
                    <div className="cp-docs-actions">
                      <span className="cp-docs-tools">
                        <DocumentDeleteButton documentId={doc.id} />
                      </span>
                    </div>
                  </li>
                ),
              }))}
            />
          </div>
        </PageShell>
      </main>
    </div>
  );
}
