import { formatDocumentProcessProgress } from "@/lib/documents/process-progress-label";
import { messageFromProcessBody } from "@/lib/documents/process-user-message";
import { postDocumentProcess, requestDocumentProcessing } from "@/lib/documents/process-session";

/**
 * Okunmuş belgeleri var olan hazırlığa ekler (31 Ekim 2026): önce yeni belgelerin TEK konu haritası (hazırlığın konu
 * adları yön verir, `prepId`), sonra tek add-source isteği. "Materyal ekle" ve hızlı başlatmanın hazırlık sayfasındaki
 * şeridi aynı yoldan geçer.
 */

export type AttachOutcome =
  | {
      ok: true;
      addedDocuments: number;
      addedTopics: number;
      mergedTopics: number;
      warnings: string[];
    }
  | {
      ok: false;
      /** 402: hak doldu (ödeme penceresi). */
      paywall: boolean;
      error: string;
      /** Harita denemeleri bitti; öğrenci "Tekrar dene" ile yeniden başlatır (hata bildirimi gerekmez). */
      canRetry: boolean;
    };

export async function mapAndAttach(input: {
  prepId: string;
  documentIds: string[];
  onProgress?: (line: string) => void;
}): Promise<AttachOutcome> {
  const { prepId, documentIds } = input;
  if (!documentIds.length) return { ok: true, addedDocuments: 0, addedTopics: 0, mergedTopics: 0, warnings: [] };
  const mapped = await requestDocumentProcessing({
    documentId: documentIds[0]!,
    post: (body) => postDocumentProcess({ ...body, courseDocumentIds: documentIds, prepId, retryMap: true }),
    onProgress: (progress) => {
      const line = formatDocumentProcessProgress(progress);
      if (line) input.onProgress?.(line);
    },
  });
  // İşleme ucunun insufficient_credits / free_page_limit cevabı (yalnız okunur, burada üretilmez): ödeme penceresi.
  if (mapped.status === 402) {
    return { ok: false, paywall: true, error: "Materyali işlemek için kullanım hakkın doldu.", canRetry: false };
  }
  if (!mapped.ok) {
    return {
      ok: false,
      paywall: false,
      error: messageFromProcessBody(mapped.body),
      canRetry: mapped.body.canRetry === true,
    };
  }
  const res = await fetch("/api/learning/exam-prep/add-source", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prepId, documentIds }),
  }).catch(() => null);
  const payload = ((await res?.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  if (!res?.ok) {
    return {
      ok: false,
      paywall: false,
      error: typeof payload.error === "string" ? payload.error : "Dosyalar hazırlığa eklenemedi.",
      canRetry: false,
    };
  }
  return {
    ok: true,
    addedDocuments: Number(payload.addedDocuments ?? documentIds.length),
    addedTopics: Number(payload.addedTopics ?? 0),
    mergedTopics: Number(payload.mergedTopics ?? 0),
    warnings: Array.isArray(payload.warnings) ? payload.warnings.map(String).filter(Boolean) : [],
  };
}

/** Eklemenin öğrenciye söylenen satırı ("İlerlemen duruyor": bitmiş adım ve puan korunur). */
export function attachedLine(outcome: { addedDocuments: number; addedTopics: number; mergedTopics: number }): string {
  const lead = outcome.addedDocuments > 1 ? `${outcome.addedDocuments} dosya eklendi.` : "Eklendi.";
  return outcome.addedTopics || outcome.mergedTopics
    ? `${lead} ${outcome.addedTopics} yeni konu, ${outcome.mergedTopics} konuda yeni kaynak. İlerlemen duruyor.`
    : `${lead} İlerlemen duruyor.`;
}
