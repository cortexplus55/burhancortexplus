import { formatDateShort } from "@/lib/format";

/**
 * Bildirim zamanı (Faz 6, 20 Kasım 2026): "az önce", "12 dakika önce", "3 saat önce", "2 gün önce"; bir haftadan
 * eskisi tarih ("12 Kas 2026"). `now` sunucuda çizilen listede sunucudan gelir: tarayıcı aynı metni çizsin.
 */
export function relativeTimeTr(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const minutes = Math.max(0, Math.floor((now - then) / 60_000));
  if (minutes < 1) return "az önce";
  if (minutes < 60) return `${minutes} dakika önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} gün önce`;
  return formatDateShort(iso);
}

/**
 * Bildirimin bağlantısı yalnız sitenin kendi yolu olabilir (sunucu da `safeActionUrl` ile süzer; burası ikinci kapı).
 * Şemalı adres, "//" ile başlayan ya da ters bölülü yol `null` döner.
 */
export function sameOriginPath(url: string | null | undefined, origin?: string): string | null {
  const value = String(url ?? "").trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "https://cortexplus.app");
  try {
    const parsed = new URL(value, base);
    if (parsed.origin !== new URL(base).origin) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}
