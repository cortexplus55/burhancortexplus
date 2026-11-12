import { MIME_BY_EXTENSION, uploadSizeProblem } from "@/lib/documents/upload-accept";

/**
 * Misafirin ana sayfada bıraktığı dosyanın kayıttan sonraki kuruluma taşınması (11 Kasım 2026, kokpit).
 *
 * Ziyaretçi ana sayfanın tarama çekirdeğine kendi notunu bırakabilir. Hesabı yokken dosya sunucuya GÖNDERİLMEZ:
 * tarayıcıda bekler ve kayıt bitince kurulumun materyal adımında "Bu dosyayı ekle" diye sunulur. Böylece ana
 * sayfadaki "taramaya hazır" sözü gerçek olur: öğrenci dosyasını ikinci kez aramaz.
 *
 * Nerede durur:
 * - Dosyanın kendisi IndexedDB'de (`cp-guest-doc`); kayda yalnız işaretindeki kimlikle ulaşılır.
 * - İşaret (kimlik, adlar, boyutlar, an) sekme oturumunda (`sessionStorage`). Google ile kayıt aynı sekmede gidip
 *   döndüğü için işaret kaybolmaz; başka bir sekme ya da başka bir kullanıcı işareti görmez. Ortak bilgisayarda
 *   (okul laboratuvarı) sonraki öğrenciye başkasının dosyası sunulmaz.
 * - Süre iki saat: kayıt için yeter, unutulan dosya cihazda kalmaz. Süresi geçen kayıt ilk okumada silinir.
 *
 * Tarayıcı saklamaya izin vermezse (gizli sekme, kota) işaret `stored: false` taşır; ekran bunu söyler ve öğrenci
 * kurulumda dosyayı yeniden seçer. Bu dosya ağ isteği atmaz.
 */

export const GUEST_HANDOFF_TTL_MS = 2 * 60 * 60 * 1000;
export const GUEST_HANDOFF_MAX_FILES = 10;
export const GUEST_HANDOFF_MAX_BYTES = 100 * 1024 * 1024;

const MARKER_KEY = "cp:guest-doc";
const DB_NAME = "cp-guest-doc";
const STORE = "held";

export type GuestMarker = {
  id: string;
  names: string[];
  sizes: number[];
  savedAt: number;
  /** Dosyalar tarayıcıda saklanabildi mi; saklanamadıysa kurulumda yeniden seçilir. */
  stored: boolean;
};

type HeldRecord = { id: string; savedAt: number; files: { name: string; type: string; lastModified: number; blob: Blob }[] };

/** Sekme oturumu yoksa (kapalı depolama) işaret yalnız bu sayfa açıkken yaşar. */
let memoryMarker: GuestMarker | null = null;

const EXTENSIONS = Object.keys(MIME_BY_EXTENSION);
const MIMES = new Set([...Object.values(MIME_BY_EXTENSION), "image/heic", "image/heif"]);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLocaleLowerCase("en");
}

/** Dosya kabul edilmiyorsa ziyaretçiye söylenecek cümle; kabul ediliyorsa null. */
export function guestFileProblem(file: Pick<File, "name" | "type" | "size">): string | null {
  const known = EXTENSIONS.includes(extensionOf(file.name)) || MIMES.has(file.type);
  if (!known) return `${file.name} bu türde okunamıyor. PDF, Word, slayt, metin ya da fotoğraf bırakabilirsin.`;
  if (file.size <= 0) return `${file.name} boş görünüyor.`;
  return uploadSizeProblem(file as File);
}

/** Seçilenlerden alınacak dosyalar ve alınamayanların nedenleri (sayı ve toplam boyut sınırı dahil). */
export function pickGuestFiles(list: readonly File[]): { accepted: File[]; problems: string[] } {
  const accepted: File[] = [];
  const problems: string[] = [];
  let total = 0;
  for (const file of list) {
    const problem = guestFileProblem(file);
    if (problem) {
      problems.push(problem);
      continue;
    }
    if (accepted.length >= GUEST_HANDOFF_MAX_FILES) {
      problems.push(`Burada en çok ${GUEST_HANDOFF_MAX_FILES} dosya bekletilir; kalanını hesabını açınca eklersin.`);
      break;
    }
    if (total + file.size > GUEST_HANDOFF_MAX_BYTES) {
      problems.push(`${file.name} sığmadı; kalanını hesabını açınca eklersin.`);
      continue;
    }
    total += file.size;
    accepted.push(file);
  }
  return { accepted, problems };
}

/** "2,4 MB", "640 KB". */
export function formatFileSize(bytes: number): string {
  const format = (value: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(value);
  if (bytes >= 1024 * 1024) return `${format(bytes / (1024 * 1024))} MB`;
  return `${format(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexeddb_unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_open_failed"));
    request.onblocked = () => reject(new Error("indexeddb_blocked"));
  });
}

function run<T>(db: IDBDatabase, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | null): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = work(tx.objectStore(STORE));
    let value: T | null = null;
    if (request) request.onsuccess = () => (value = request.result);
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error ?? new Error("indexeddb_tx_failed"));
    tx.onabort = () => reject(tx.error ?? new Error("indexeddb_tx_aborted"));
  });
}

function writeMarker(marker: GuestMarker | null) {
  memoryMarker = marker;
  try {
    if (marker) window.sessionStorage.setItem(MARKER_KEY, JSON.stringify(marker));
    else window.sessionStorage.removeItem(MARKER_KEY);
  } catch {
    /* sekme oturumu kapalı: işaret bellekte kalır */
  }
}

function parseMarker(raw: string | null): GuestMarker | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<GuestMarker>;
    if (typeof value.id !== "string" || !Array.isArray(value.names) || !Array.isArray(value.sizes)) return null;
    if (typeof value.savedAt !== "number" || !value.names.length) return null;
    return {
      id: value.id,
      names: value.names.map(String),
      sizes: value.sizes.map(Number),
      savedAt: value.savedAt,
      stored: value.stored === true,
    };
  } catch {
    return null;
  }
}

/** Bu sekmede bekleyen dosyanın işareti; yoksa ya da süresi geçtiyse null. */
export function readGuestMarker(now: number = Date.now()): GuestMarker | null {
  let marker = memoryMarker;
  try {
    marker = parseMarker(window.sessionStorage.getItem(MARKER_KEY)) ?? marker;
  } catch {
    /* sekme oturumu kapalı */
  }
  if (!marker) return null;
  if (now - marker.savedAt > GUEST_HANDOFF_TTL_MS) return null;
  return marker;
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Dosyaları tarayıcıda bekletir ve işareti yazar. Saklama düşerse işaret yine yazılır (`stored: false`): ekran
 * dosyanın seçildiğini gösterir ama kurulumda yeniden seçileceğini söyler.
 */
export async function holdGuestDocuments(files: readonly File[], now: number = Date.now()): Promise<GuestMarker> {
  const id = newId();
  let stored = false;
  try {
    const db = await openDb();
    try {
      const record: HeldRecord = {
        id,
        savedAt: now,
        files: files.map((file) => ({ name: file.name, type: file.type, lastModified: file.lastModified, blob: file })),
      };
      // Bu sekmenin önceki kaydı varsa yerini yenisi alır; başka sekmenin kaydına dokunulmaz.
      const previous = readGuestMarker(now)?.id ?? null;
      await run(db, "readwrite", (store) => {
        if (previous) store.delete(previous);
        return store.put(record);
      });
      stored = true;
    } finally {
      db.close();
    }
  } catch {
    stored = false;
  }
  const marker: GuestMarker = { id, names: files.map((file) => file.name), sizes: files.map((file) => file.size), savedAt: now, stored };
  writeMarker(marker);
  return marker;
}

/** İşaretin gösterdiği dosyalar; işaret yoksa, süresi geçtiyse ya da kayıt bulunamazsa null. */
export async function takeGuestDocuments(now: number = Date.now()): Promise<File[] | null> {
  const marker = readGuestMarker(now);
  if (!marker || !marker.stored) return null;
  try {
    const db = await openDb();
    try {
      const record = (await run<HeldRecord | undefined>(db, "readonly", (store) => store.get(marker.id))) ?? null;
      if (!record || now - record.savedAt > GUEST_HANDOFF_TTL_MS || !record.files.length) return null;
      return record.files.map((item) => new File([item.blob], item.name, { type: item.type, lastModified: item.lastModified }));
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

/** Bu sekmenin bekleyen dosyasını ve işaretini siler (eklendi ya da vazgeçildi). */
export async function clearGuestDocuments(): Promise<void> {
  let id: string | null = memoryMarker?.id ?? null;
  try {
    id = parseMarker(window.sessionStorage.getItem(MARKER_KEY))?.id ?? id;
  } catch {
    /* sekme oturumu kapalı */
  }
  writeMarker(null);
  if (!id) return;
  try {
    const db = await openDb();
    try {
      const target = id;
      await run(db, "readwrite", (store) => store.delete(target));
    } finally {
      db.close();
    }
  } catch {
    /* saklama yoksa silinecek bir şey de yok */
  }
}

/**
 * Süresi geçmiş kayıtları siler (unutulan dosya cihazda kalmasın). Ana sayfa açılırken çağrılır. Süresi geçmemiş
 * kayda dokunmaz: öğrenci ana sayfayı ikinci bir sekmede açarsa kayıt akışındaki sekmenin dosyası silinmez.
 */
export async function purgeStaleGuestDocuments(now: number = Date.now()): Promise<void> {
  try {
    const db = await openDb();
    try {
      const records = (await run<HeldRecord[]>(db, "readonly", (store) => store.getAll())) ?? [];
      const stale = records.filter((record) => now - record.savedAt > GUEST_HANDOFF_TTL_MS).map((record) => record.id);
      if (!stale.length) return;
      await run(db, "readwrite", (store) => {
        for (const id of stale) store.delete(id);
        return null;
      });
    } finally {
      db.close();
    }
  } catch {
    /* saklama yoksa silinecek bir şey de yok */
  }
}
