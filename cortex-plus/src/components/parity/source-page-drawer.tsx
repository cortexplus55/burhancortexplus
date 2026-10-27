"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { DocumentPdfPreview } from "@/components/documents/document-pdf-preview";

type Preview = {
  page: number;
  fileName: string;
  signedUrl: string | null;
  text: string | null;
};

/** Kaynak sayfa dersin içinde açılır. Yeni sekme yok. */
export function SourcePageButton({ documentId, page, fileName }: { documentId: string; page: number; fileName: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function show() {
    setOpen(true);
    if (preview?.page === page && preview.fileName) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/page-preview?page=${page}`);
      const data = (await res.json().catch(() => ({}))) as Preview & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Kaynak sayfa açılamadı.");
        return;
      }
      setPreview({
        page: data.page ?? page,
        fileName: data.fileName ?? fileName,
        signedUrl: data.signedUrl ?? null,
        text: data.text ?? null,
      });
    } catch {
      setError("Kaynak sayfa açılamadı.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" className="als-source-page" onClick={() => void show()}>
        Kaynak Sayfayı Gör (Sayfa {page})
      </button>
      {open ? (
        <div className="als-source-drawer-back" role="presentation" onClick={() => setOpen(false)}>
          <div
            className="als-source-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="als-source-drawer-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <h2 id="als-source-drawer-title">
                {fileName} · Sayfa {page}
              </h2>
              <button type="button" aria-label="Kapat" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </header>
            {loading ? <p>Sayfa açılıyor…</p> : null}
            {error ? <p role="alert">{error}</p> : null}
            {preview?.signedUrl ? <DocumentPdfPreview signedUrl={preview.signedUrl} initialPage={preview.page} /> : null}
            {preview && !preview.signedUrl ? (
              <pre className="als-source-drawer-text">{preview.text ?? "Bu sayfanın metni yok."}</pre>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
