export const PENDING_DOC_PROCESS_KEY = "cortex:pending-doc-process";

export type PendingDocProcessSurface = "exam-wizard" | "prep-add" | "documents";

export type PendingDocProcess = {
  documentId: string;
  fileName: string;
  sizeBytes: number | null;
  startedAt: string;
  surface: PendingDocProcessSurface;
};

/**
 * İşlenmesi süren belgeler: sekme kapanırsa geri gelince kaldığı yerden sürsün.
 *
 * 20 Ekim 2026'ya kadar tek kayıttı: dosyalar sırayla işlenmek zorundaydı (7 dosyalık sınav seti
 * ~76 sn; Astra ~30 sn) ve bir yüzeydeki "temizle" başka bir sekmede süren belgenin kaydını da
 * siliyordu. Artık belge başına kayıt; temizleme belgeye ya da yüzeye göre. Eski tek kayıt da okunur.
 */
function isPending(value: unknown): value is PendingDocProcess {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<PendingDocProcess>;
  return typeof row.documentId === "string" && typeof row.fileName === "string" && typeof row.surface === "string";
}

function readAll(): PendingDocProcess[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PENDING_DOC_PROCESS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.filter(isPending);
  } catch {
    return [];
  }
}

function writeAll(list: PendingDocProcess[]): void {
  if (typeof window === "undefined") return;
  try {
    if (list.length) window.localStorage.setItem(PENDING_DOC_PROCESS_KEY, JSON.stringify(list));
    else window.localStorage.removeItem(PENDING_DOC_PROCESS_KEY);
  } catch {
    // quota / private mode
  }
}

/** Süren belgeler, başlama sırasıyla; yüzey verilirse yalnız o yüzeyinkiler. */
export function readPendingDocProcesses(surface?: PendingDocProcessSurface): PendingDocProcess[] {
  const list = readAll();
  return surface ? list.filter((entry) => entry.surface === surface) : list;
}

/** Belgenin kaydını ekler ya da yeniler. */
export function writePendingDocProcess(entry: PendingDocProcess): void {
  writeAll([...readAll().filter((item) => item.documentId !== entry.documentId), entry]);
}

/** Bir belgenin ya da bir yüzeyin kayıtlarını siler; hiçbiri verilmezse hepsini. */
export function clearPendingDocProcess(filter?: { documentId?: string; surface?: PendingDocProcessSurface }): void {
  if (!filter?.documentId && !filter?.surface) {
    writeAll([]);
    return;
  }
  writeAll(
    readAll().filter(
      (item) =>
        !(
          (filter.documentId === undefined || item.documentId === filter.documentId) &&
          (filter.surface === undefined || item.surface === filter.surface)
        ),
    ),
  );
}
