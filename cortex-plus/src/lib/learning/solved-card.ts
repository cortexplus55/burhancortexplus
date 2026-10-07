/**
 * Sohbetteki "Problem N saniyede çözüldü" kartı (saf).
 *
 * Astra hesap sorusunda cevabın üstünde bu kartı gösteriyor; ürün sahibi
 * eklenmesini seçti (1 Ekim 2026). Süre tarayıcıda ölçülür: soru gönderildiği
 * andan cevabın tamamı gelene kadar. Model çağrısı ya da maliyet yok.
 */

const OPERATOR = /[+\-−×*/÷=^√%²³]/;
// "\b" Türkçe harfte çalışmıyor ("kaç" sonunda ç); harf sınırı Unicode ile.
const ASKS_RESULT = /(?<!\p{L})(kaç|kaçtır|hesapla|bul|çöz|sonucu|değeri)(?!\p{L})/iu;

/** Hesap ya da formül isteyen soru mu? Rakam ve işlem ya da "kaç/hesapla". */
export function isProblemQuestion(text: string): boolean {
  const clean = text.replace(/^\[[^\]]{1,40}\]\s*/, "").trim();
  if (!/\d/.test(clean)) return false;
  return OPERATOR.test(clean) || ASKS_RESULT.test(clean.toLocaleLowerCase("tr"));
}

export function solvedLabel(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return `Problem ${seconds} saniyede çözüldü`;
}
