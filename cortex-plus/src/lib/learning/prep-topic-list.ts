
/** Bir hazırlığa bağlanan belge sayısı. Depolama ve sayfa kotası ayrıca durur. */
export const PREP_SOURCE_DOCUMENT_CAP = 8;

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

