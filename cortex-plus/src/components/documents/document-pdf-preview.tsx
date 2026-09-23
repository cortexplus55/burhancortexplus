"use client";

import { useEffect, useRef, useState } from "react";

export function DocumentPdfPreview({
  signedUrl,
  initialPage = 1,
}: {
  signedUrl: string;
  initialPage?: number;
}) {
  const canvasHost = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(Math.max(1, initialPage));
  const [numPages, setNumPages] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      setError(null);
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        /*
          Tarayıcıda pdf.js ayrıştırmayı bir Web Worker'da yapar ve worker
          dosyasının adresi verilmemişse `getDocument` daha ağ isteği bile
          atmadan fırlatır. Yerelde build geçti, canlıda "PDF önizlemesi
          açılamadı" göründü — sebep tam olarak buydu (23 Eylül 2026).
          Dosyayı `scripts/copy-pdf-worker.mjs` kurulumda public/'e koyar;
          aynı origin olduğu için CSP `worker-src 'self'` ile uyumlu.
        */
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        }
        if (typeof Promise.withResolvers !== "function") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (Promise as any).withResolvers = function withResolvers<T = unknown>() {
            let resolve!: (value: T | PromiseLike<T>) => void;
            let reject!: (reason?: unknown) => void;
            const promise = new Promise<T>((res, rej) => {
              resolve = res;
              reject = rej;
            });
            return { promise, resolve, reject };
          };
        }
        // İmzalı URL yetkiyi kendi içinde taşır; `withCredentials` eklenirse
        // Supabase'in `Access-Control-Allow-Origin: *` cevabı CORS'ta düşer
        // (istek status 0 ile ölür, hata mesajı boş kalır).
        const task = pdfjs.getDocument({ url: signedUrl });
        const pdf = await task.promise;
        if (cancelled) {
          await task.destroy();
          return;
        }
        setNumPages(pdf.numPages);
        const target = Math.min(Math.max(page, 1), pdf.numPages);
        const pdfPage = await pdf.getPage(target);
        const viewport = pdfPage.getViewport({ scale: 1.25 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx || !canvasHost.current) return;
        await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise;
        canvasHost.current.replaceChildren(canvas);
        pdfPage.cleanup();
        await task.destroy();
      } catch (err) {
        // Kullanıcıya Türkçe tek cümle; konsola gerçek sebep (worker yolu,
        // CSP, süresi dolan imzalı URL) — aksi hâlde canlıda kör kalıyoruz.
        console.error("document_pdf_preview_failed", err);
        if (!cancelled) setError("PDF önizlemesi açılamadı.");
      }
    }
    void render();
    return () => {
      cancelled = true;
    };
  }, [signedUrl, page]);

  useEffect(() => {
    if (initialPage > 0) setPage(initialPage);
  }, [initialPage]);

  return (
    <section
      id="belge-onizleme"
      className="cs-pay-card scroll-mt-24 space-y-3 p-4"
      aria-label="Belge önizleme"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--cs-muted)]">
        <span>PDF önizleme</span>
        {numPages > 0 ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-white/15 px-2 py-1 disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Önceki
            </button>
            <span>
              s.{page} / {numPages}
            </span>
            <button
              type="button"
              className="rounded border border-white/15 px-2 py-1 disabled:opacity-40"
              disabled={page >= numPages}
              onClick={() => setPage((p) => Math.min(numPages, p + 1))}
            >
              Sonraki
            </button>
          </div>
        ) : null}
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <div ref={canvasHost} className="overflow-x-auto rounded-lg bg-black/30" />
    </section>
  );
}
