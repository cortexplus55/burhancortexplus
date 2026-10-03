

/** Belgede karşılık bulunamadığında modelin vereceği cevabın işareti. */
export const NO_SOURCE_MARKER = "[KAYNAKTA_YOK]";
export const NO_SOURCE_MESSAGE =
  "Bu bilgi yüklediğin belgede yer almıyor. Başka bir belge ekleyebilir veya Belgem + Genel Bilgi moduna geçebilirsin.";

/**
 * "Notunda yok" cevabının altına düşen satır.
 *
 * Kredinin geri verilmesi öğrenci görmezse güvence değil, sessiz bir
 * muhasebe hareketi. Yanıtın kendi içinde yazıyor çünkü başlıklar gövdeden
 * önce gidiyor: `X-Credits-Used` akış başlamadan yazıldığı için iadeyi
 * bilemez ve "1 kredi" der.
 */
export const NO_SOURCE_CREDIT_NOTE =
  "\n\n_Bu soru notunda geçmediği için hakkından düşmedi._";

/** Model "belgede yok" dedi mi? */
export function saidNoSource(answer: string): boolean {
  const text = answer.trim();
  return text.toUpperCase().startsWith(NO_SOURCE_MARKER) || text === NO_SOURCE_MESSAGE;
}

/** İşareti öğrenciye göstermeden metni temizle. */
export function stripNoSourceMarker(answer: string): string {
  const trimmed = answer.trimStart();
  if (!trimmed.toUpperCase().startsWith(NO_SOURCE_MARKER)) return answer;
  return trimmed.slice(NO_SOURCE_MARKER.length).trimStart();
}
