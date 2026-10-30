
/**
 * Bir hazırlığa bağlanan belge sayısında ürün sınırı YOK (31 Ekim 2026, ürün sahibinin kararı: "kullanıcı bir derse kaç
 * döküman yüklemek isterse yükleyebilir, limitimizi kullanana kadar; sonradan da ekleyebilir"). Önce 8'di: 100 fotoğraf
 * seçen öğrencinin 8'i alındı. Belgeyi sayfa, fotoğraf ve kredi hakkı sınırlar (`document-limits.ts`, `photo-quota.ts`).
 * Bu sayı yalnız tek istekte gelebilecek kimlik sayısının teknik tavanı; öğrenciye hiçbir yerde sınır diye gösterilmez.
 */
export const PREP_DOCUMENT_REQUEST_MAX = 1000;

/**
 * Konu tavanı istek boyutunu sınırlar.
 * Öncelik (çekirdek / destek / gözden geçir) konu silmez. Çok büyük bir
 * hazırlıkta istemciye açık hata döner; liste hiçbir zaman sessizce kesilmez.
 */
export const PREP_TOPIC_CAP = 300;

export function prepTopicCapacityError(count: number): string | null {
  return count > PREP_TOPIC_CAP
    ? `Belgelerinde ${count} ayrı konu bulundu. Bir hazırlıkta en fazla ${PREP_TOPIC_CAP} konu olabilir; belgeleri ayrı hazırlıklara böl.`
    : null;
}

