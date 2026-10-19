/**
 * Araçlar > Yazılı deneme bir geçici hazırlık satırı açar (deneme motoru hazırlığa bağlı çalışıyor).
 * 19 Ekim 2026'ya kadar bu satır öğrencinin Sınavlar listesinde ayrı bir "hazırlık" gibi görünüyor,
 * ücretsiz hesabın tek hazırlık hakkını yiyor ve ana sayfadaki "İlk hazırlığını kur" kartını
 * kapatıyordu. Bu tür listelerde, sayımlarda ve sınırda yok sayılır.
 */
export const STUDIO_EXAM_TYPE = "deneme";

/** PostgREST `or` filtresi: türü boş olanlar da kalsın (`neq` boş değeri de eler). */
export const NOT_STUDIO_EXAM_FILTER = `exam_type.is.null,exam_type.neq.${STUDIO_EXAM_TYPE}`;
