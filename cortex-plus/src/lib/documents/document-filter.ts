import { matchesSearch } from "@/lib/text/search-fold";
import { photoSetName } from "@/lib/documents/photo-set-pdf";

/*
  Belgelerim'in anlık arama ve süzgeçleri (20 Kasım 2026, Faz 3). Liste sunucuda okunur (en çok 30 belge); arama ve
  süzgeç tarayıcıda, ağ isteği olmadan çalışır. Kurallar saf: sayfa yalnız kovaları hesaplar, bileşen süzer.
*/

export type DocumentStatusBucket = "ready" | "processing" | "error";
export type DocumentKindBucket = "pdf" | "photo" | "office" | "other";

export type DocumentStatusFilter = "all" | DocumentStatusBucket;
export type DocumentKindFilter = "all" | Exclude<DocumentKindBucket, "other">;

export type DocumentFilterItem = {
  id: string;
  fileName: string;
  status: DocumentStatusBucket;
  kind: DocumentKindBucket;
};

export type DocumentFilter = {
  query: string;
  status: DocumentStatusFilter;
  kind: DocumentKindFilter;
};

export const EMPTY_DOCUMENT_FILTER: DocumentFilter = { query: "", status: "all", kind: "all" };

/** Süzgeç çiplerinin adları; kartın kendi durum yazısıyla aynı sözcükler. */
export const DOCUMENT_STATUS_FILTERS: ReadonlyArray<{ id: DocumentStatusFilter; label: string }> = [
  { id: "all", label: "Tümü" },
  { id: "ready", label: "Hazır" },
  { id: "processing", label: "İşleniyor" },
  { id: "error", label: "Hata" },
];

export const DOCUMENT_KIND_FILTERS: ReadonlyArray<{ id: DocumentKindFilter; label: string }> = [
  { id: "all", label: "Tüm türler" },
  { id: "pdf", label: "PDF" },
  { id: "photo", label: "Fotoğraf" },
  { id: "office", label: "Word / sunu" },
];

const PHOTO_EXTENSIONS = /\.(jpe?g|png|heic|heif|webp|gif|bmp|tiff?)$/i;
const OFFICE_EXTENSIONS = /\.(docx?|odt|rtf|pptx?|ppsx?|odp|key)$/i;
/** Birden çok fotoğraf tek taranmış PDF olur (`photo-set-pdf.ts`); adı o dosyanın kendi adlandırmasından okunur. */
const PHOTO_SET_PREFIX = `${photoSetName({ from: 1, to: 1, total: 1 }).split(" (")[0]} (`;

/** Dosya türü yalnız addan: fotoğraf seti PDF olsa da öğrenci onu fotoğraf olarak yükledi. */
export function documentKind(fileName: string | null | undefined): DocumentKindBucket {
  const name = (fileName ?? "").trim();
  if (name.startsWith(PHOTO_SET_PREFIX) || PHOTO_EXTENSIONS.test(name)) return "photo";
  if (/\.pdf$/i.test(name)) return "pdf";
  if (OFFICE_EXTENSIONS.test(name)) return "office";
  return "other";
}

/**
 * Kartın durum hapıyla aynı karar: başarısız belge "Hata"; harita denemeleri biten belge ("Bekliyor") ve okunmayı
 * bekleyen ya da okunan belge "İşleniyor"; geri kalan hazır.
 */
export function documentStatusBucket(input: { status: string; mapStopped: boolean }): DocumentStatusBucket {
  if (input.status === "failed") return "error";
  if (input.mapStopped || input.status !== "completed") return "processing";
  return "ready";
}

export function isDocumentFilterActive(filter: DocumentFilter): boolean {
  return filter.query.trim() !== "" || filter.status !== "all" || filter.kind !== "all";
}

export function filterDocuments<T extends DocumentFilterItem>(items: readonly T[], filter: DocumentFilter): T[] {
  return items.filter(
    (item) =>
      (filter.status === "all" || item.status === filter.status) &&
      (filter.kind === "all" || item.kind === filter.kind) &&
      matchesSearch([item.fileName], filter.query),
  );
}
