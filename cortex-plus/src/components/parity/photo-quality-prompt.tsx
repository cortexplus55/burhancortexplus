"use client";

import {
  PHOTO_QUALITY_RETAKE,
  PHOTO_QUALITY_USE,
  photoQualityPrompt,
  photoQualityRetakeHint,
  type PhotoQualityChoice,
} from "@/lib/documents/photo-quality";
import type { PhotoQualityRequest } from "@/lib/documents/use-universal-upload";

/**
 * Bulanık / karanlık fotoğraf sorusu (31 Ekim 2026, Paket J3 #13). Yükleme bu cevabı bekler; engellemez: "Yine de
 * kullan" seçimi olduğu gibi yükler, "Yeniden çek" yalnız işaretlenen fotoğrafları bu seçimden çıkarır.
 * Kurulum sihirbazı, telefondan yükleme ve materyal ekle aynı bileşeni çizer (`useUniversalDocumentUpload`).
 */
export function PhotoQualityPrompt({
  request,
  onAnswer,
}: {
  request: PhotoQualityRequest | null;
  onAnswer: (choice: PhotoQualityChoice) => void;
}) {
  if (!request || !request.flagged.length) return null;
  const count = request.flagged.length;
  const names = request.flagged.slice(0, 3).join(", ") + (count > 3 ? ` ve ${count - 3} fotoğraf daha` : "");
  return (
    <section
      className="cp-photo-quality mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-left text-sm text-amber-50"
      aria-label="Fotoğraf netliği"
      data-photo-quality
    >
      <p role="alert" className="font-medium">
        {photoQualityPrompt(count)}
      </p>
      {request.total > 1 ? <p className="mt-1 text-xs opacity-80">{names}</p> : null}
      <p className="mt-1 text-xs opacity-80">{photoQualityRetakeHint(count, request.total)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="min-h-[36px] rounded-full border border-amber-400/60 bg-amber-500/20 px-4 text-xs font-semibold"
          onClick={() => onAnswer("retake")}
        >
          {PHOTO_QUALITY_RETAKE}
        </button>
        <button
          type="button"
          className="min-h-[36px] rounded-full border border-white/20 px-4 text-xs font-semibold"
          onClick={() => onAnswer("use")}
        >
          {PHOTO_QUALITY_USE}
        </button>
      </div>
    </section>
  );
}
