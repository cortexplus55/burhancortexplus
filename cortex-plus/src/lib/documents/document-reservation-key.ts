/*
  Belgenin sayfa ücreti ayırmasının anahtarı (31 Ekim 2026, pencereli işleme). İlk okuma `document_process_<belge>`;
  duraklayıp kaldığı yerden süren okuma kalan sayfalar için `document_process_<belge>_p<ilk sayfa>`. Takılı ayırma
  temizliği (credits/service.ts) de belgeyi bu ayrıştırıcıyla bulur.
*/

const PREFIX = "document_process_";
const RESUME = /^_p(\d+)$/;

export const DOCUMENT_RESERVATION_PREFIX = PREFIX;

/** Ayırmanın anahtarı; kaldığı yerden süren okumada ilk sayfa ekiyle. */
export function documentReservationKey(documentId: string, firstPage = 1): string {
  return firstPage > 1 ? `${PREFIX}${documentId}_p${firstPage}` : `${PREFIX}${documentId}`;
}

/** Anahtardan belge ve ayırmanın kapsadığı ilk sayfa (eski anahtar: 1). Başka anahtar → null. */
export function parseDocumentReservationKey(key: string): { documentId: string; firstPage: number } | null {
  if (!key.startsWith(PREFIX)) return null;
  const rest = key.slice(PREFIX.length);
  const documentId = rest.slice(0, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId)) return null;
  const suffix = rest.slice(36);
  if (!suffix) return { documentId, firstPage: 1 };
  const resume = RESUME.exec(suffix);
  return resume ? { documentId, firstPage: Number(resume[1]) } : null;
}
