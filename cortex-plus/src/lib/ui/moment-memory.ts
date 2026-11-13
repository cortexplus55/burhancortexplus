/**
 * Anların hafızası (13 Kasım 2026): bir anın "önce" değeri yalnız bu sekmenin oturumunda (`sessionStorage`) durur.
 * Sunucuya gitmez, yeni API yok. Depolama kapalıysa (gizli pencere, kota) okuma `null` döner ve an oynamaz: ilk ziyaret
 * gibi davranılır.
 */

export function readMoment<T>(key: string, valid: (value: unknown) => value is T): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return valid(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeMoment(key: string, value: unknown): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* depolama kapalı: bir sonraki ziyarette an oynamaz, başka bir şey değişmez */
  }
}

/** Halka (B1): hazırlığın tamamlama yüzdesi ve biten konuların kimlikleri. */
export type RingMemory = { pct: number; done: string[] };

export function isRingMemory(value: unknown): value is RingMemory {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RingMemory>;
  return (
    typeof candidate.pct === "number" &&
    Number.isFinite(candidate.pct) &&
    Array.isArray(candidate.done) &&
    candidate.done.every((id) => typeof id === "string")
  );
}

export const ringMemoryKey = (prepId: string) => `cx:ring:${prepId}`;

/** Yol (B2): hazırlığın biten adımlarının kimlikleri. */
export type PathMemory = { done: string[] };

export function isPathMemory(value: unknown): value is PathMemory {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PathMemory>;
  return Array.isArray(candidate.done) && candidate.done.every((id) => typeof id === "string");
}

export const pathMemoryKey = (prepId: string) => `cx:path:${prepId}`;
