/**
 * Düğüm açılış ölçümü (3 Kasım 2026): yol ekranında son tıklamanın zamanı sessionStorage'a yazılır, düğüm sayfası
 * ilk ekranı çizince bir kez okur. Sayfa geçişi Next istemci yönlendirmesi olduğundan tıklama zamanı kaybolmaz.
 * Kaldırmak kolay: bu dosya + iki çağrı yeri.
 */
const KEY = "cortex:node-click";
const MAX_AGE_MS = 30_000;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function store(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function markNodeClick(at = Date.now(), s: Store | null = store()): void {
  try {
    s?.setItem(KEY, String(at));
  } catch {
    /* depolama kapalıysa ölçüm yok */
  }
}

/** Taze tıklama zamanını (epoch ms) döndürür ve siler. */
export function takeNodeClick(now = Date.now(), s: Store | null = store()): number | null {
  try {
    const raw = s?.getItem(KEY);
    if (!raw) return null;
    s?.removeItem(KEY);
    const at = Number(raw);
    return Number.isFinite(at) && now - at >= 0 && now - at <= MAX_AGE_MS ? at : null;
  } catch {
    return null;
  }
}

/** Tıklama kaydı yoksa (yol dışından gelen geçiş) yükleniyor kabuğunun çizildiği an başlangıç sayılır. */
export function markNodeClickIfMissing(at = Date.now(), s: Store | null = store()): void {
  try {
    const raw = s?.getItem(KEY);
    if (raw && at - Number(raw) <= MAX_AGE_MS) return;
    s?.setItem(KEY, String(at));
  } catch {
    /* depolama kapalıysa ölçüm yok */
  }
}
