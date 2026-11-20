/**
 * Velime ödeme linkinin geçerlilik süresi (Faz 5 §2, 19 Kasım 2026, ürün sahibinin kararı: 48 saat). Saf modül: bağlantıyı
 * imzalayan `parent-link.ts` (sunucu, `node:crypto`) ve misafire gösterilen pazarlama metni (istemci) aynı sabiti okur;
 * pazarlama metni sunucu modülünü istemci paketine taşımasın diye ayrı dosyada.
 */
export const PARENT_LINK_TTL_MS = 48 * 60 * 60 * 1000;

/** "48" — metinde "48 saat geçerli" diye yazılır. */
export const PARENT_LINK_TTL_HOURS = Math.round(PARENT_LINK_TTL_MS / 3_600_000);
