"use client";

import { useEffect, useId, useRef, useState } from "react";
import { clampPageRange, type PageRange } from "@/lib/documents/page-coverage";

export type PageRangeRequest = {
  fileName: string;
  total: number;
  initial: PageRange;
  /** Hakkın yettiği sayfa sayısı (ücretsiz kalan hak ya da kredi); bilinmiyorsa null. */
  affordable: number | null;
};

/**
 * Faz 2 (madde 5): büyük PDF'te işlenecek sayfa aralığı. Belge sessizce kırpılmaz: öğrenci hangi sayfaların
 * işleneceğini görür ve değiştirir. "Başlangıç Sayfası [1] — Bitiş Sayfası [100] · Toplam 320 sayfa".
 * Kurulum sihirbazının materyal adımında, fotoğraf sorusuyla aynı yerde çizilir; yükleme bu cevabı bekler.
 */
export function PdfPageRangePrompt({
  request,
  onConfirm,
}: {
  request: PageRangeRequest | null;
  onConfirm: (range: PageRange) => void;
}) {
  const id = useId();
  const startRef = useRef<HTMLInputElement | null>(null);
  const [start, setStart] = useState(String(request?.initial.start ?? 1));
  const [end, setEnd] = useState(String(request?.initial.end ?? 1));

  useEffect(() => {
    if (!request) return;
    setStart(String(request.initial.start));
    setEnd(String(request.initial.end));
    startRef.current?.focus();
  }, [request]);

  if (!request) return null;
  const range = clampPageRange(start, end, request.total);
  const count = range.end - range.start + 1;
  const overBudget = request.affordable != null && count > request.affordable;

  return (
    <section
      className="cp-page-range mt-3 rounded-lg border border-white/25 bg-white/5 px-3 py-3 text-left text-sm"
      aria-labelledby={`${id}-title`}
      data-page-range
    >
      <p id={`${id}-title`} className="font-medium">
        {request.fileName}: işlenecek sayfaları seç
      </p>
      <form
        className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm(range);
        }}
      >
        <label className="flex min-w-[8.5rem] flex-1 flex-col gap-1 text-xs" htmlFor={`${id}-start`}>
          Başlangıç Sayfası
          <input
            ref={startRef}
            id={`${id}-start`}
            type="number"
            inputMode="numeric"
            min={1}
            max={request.total}
            value={start}
            onChange={(event) => setStart(event.target.value)}
            onBlur={() => setStart(String(range.start))}
            className="min-h-[44px] w-full rounded-md border border-white/30 bg-transparent px-3 text-base"
          />
        </label>
        <span aria-hidden className="pb-3 text-xs opacity-80">
          —
        </span>
        <label className="flex min-w-[8.5rem] flex-1 flex-col gap-1 text-xs" htmlFor={`${id}-end`}>
          Bitiş Sayfası
          <input
            id={`${id}-end`}
            type="number"
            inputMode="numeric"
            min={1}
            max={request.total}
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            onBlur={() => setEnd(String(range.end))}
            className="min-h-[44px] w-full rounded-md border border-white/30 bg-transparent px-3 text-base"
          />
        </label>
        <p className="w-full text-xs" aria-live="polite">
          · Toplam {request.total} sayfa · Seçilen: {count} sayfa (Sayfa {range.start}–{range.end})
        </p>
        {overBudget ? (
          <p className="w-full text-xs" role="status">
            Hakkın {request.affordable} sayfaya yetiyor; seçilen aralığın ilk {request.affordable} sayfası işlenir.
          </p>
        ) : null}
        <p className="w-full text-xs opacity-80">Kalan bölümler için sonra yeni sayfa aralığı ekleyebilirsin.</p>
        <button
          type="submit"
          className="min-h-[44px] rounded-full border border-white/40 bg-white/15 px-4 text-sm font-semibold"
        >
          Bu aralığı işle
        </button>
      </form>
    </section>
  );
}
