/**
 * Şıklara sırayla gönderme (18 Ekim 2026).
 *
 * Model doğru cevabı neredeyse hep ilk şıkka yazdığı için şıklar öğrenciye karışık sırayla
 * gösteriliyor (ders kontrolü ve öğretmen testi). Açıklama ise yazıldığı sıraya gönderme
 * yapıyordu: altın kıyasta Termodinamik dersi "İlk seçenek sabit basınçta, ikinci seçenek
 * sabit hacimde…", Pediatri dersi "Diğer seçenekler sırasıyla bronşiolit, astım ve pnömoni"
 * dedi — karıştırmadan sonra ikisi de yanlış şıkkı gösteriyordu. Yazar ve denetçi kuralı
 * aynı cümleyle bilir; kod yalnız yakalar.
 */
export const OPTION_ORDER_RULE =
  "Şıklar öğrenciye karışık sırayla gösterilir: explanation ve optionWhy hiçbir şıkka sırasıyla ya da harfiyle " +
  "gönderme yapmaz ('ilk seçenek', 'A şıkkı', 'diğer seçenekler sırasıyla …' yok); her şıkkı kendi içeriğiyle an.";

const ORDINAL = "(?:ilk|birinci|ikinci|üçüncü|dördüncü|beşinci|son|sonuncu)";
const OPTION = "(?:seçenek|şık)";

const PATTERNS = [
  // "ilk seçenek", "ilk iki seçenek", "son şık"
  new RegExp(`(?:^|[^\\p{L}])${ORDINAL}\\s+(?:(?:iki|üç)\\s+)?${OPTION}`, "iu"),
  // "A şıkkı", "B seçeneği"
  new RegExp(`(?:^|[^\\p{L}])[A-E]\\s+(?:şıkk|seçene[kğ])`, "u"),
  // "2. seçenek", "3. şık"
  new RegExp(`(?:^|[^\\p{L}\\d])[1-6]\\.\\s*${OPTION}`, "iu"),
  // "diğer seçenekler sırasıyla", "sırasıyla … şıklar"
  new RegExp(`${OPTION}\\p{L}*\\s+sırasıyla|sırasıyla[^.]{0,40}${OPTION}`, "iu"),
];

/** Metin şıklara konumla mı gönderme yapıyor. */
export function refersToOptionOrder(text: string | undefined | null): boolean {
  const value = (text ?? "").trim();
  return Boolean(value) && PATTERNS.some((pattern) => pattern.test(value));
}
