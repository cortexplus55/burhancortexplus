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
  "gönderme yapmaz ('ilk seçenek', 'ilk iki ifade', 'A şıkkı', 'diğer seçenekler(deki …) sırasıyla …' yok); her " +
  "şıkkı kendi içeriğiyle an.";

const ORDINAL = "(?:ilk|birinci|ikinci|üçüncü|dördüncü|beşinci|son|sonuncu)";
/** Önünde harf olmayan "seçenek/şık": "ışık", "aşık" şık değildir (fizik dersinde "ışıklar sırasıyla …"). */
const OPTION = "(?:^|[^\\p{L}])(?:seçenek|şık)";
/**
 * Sıra sözcüğüyle birlikte şık yerine geçen adlar (20 Ekim 2026, kör kıyas): trigonometri dersinde "ilk iki ifade
 * aynı son kola sahip" karışık şıklarda yanlış ikiliyi gösteriyordu. Soru köklerinde numaralı öncül kullanılmıyor;
 * bu adlar burada yalnız şıkları gösterebilir. "madde" yok: "Anayasanın ilk üç maddesi değiştirilemez" KPSS'in
 * çekirdek bilgisi; itiraz edilemeyen yapı kuralı olarak yazarın o cümleyi kurmasını yasaklıyordu.
 */
const OPTION_LIKE = "(?:seçenek|şık|ifade|cevap)";
/** "sırasıyla" ve "sırayla" ("Diğer şıklar sırayla 6, 12 ve 18 aydır"). */
const ORDER = "sıra(?:sı)?yla";

/**
 * Bu desenler küçük harfe çevrilmiş metinde aranır (`toLocaleLowerCase("tr")`): JS'in `i` bayrağı "İ"yi "i"
 * saymıyor, cümle başındaki "İlk seçenek …", "İkinci şık …" kaçıyordu (20 Ekim 2026).
 */
const LOWER_PATTERNS = [
  // "ilk seçenek", "ilk iki seçenek", "son şık", "ilk iki ifade"
  new RegExp(`(?:^|[^\\p{L}])${ORDINAL}\\s+(?:(?:iki|üç)\\s+)?${OPTION_LIKE}`, "u"),
  // "2. seçenek", "3. şık"
  new RegExp(`(?:^|[^\\p{L}\\d])[1-6]\\.\\s*(?:seçenek|şık)`, "u"),
  // "diğer seçenekler sırasıyla", "diğer seçeneklerdeki bulgular sırasıyla" (Pediatri, 20 Ekim), "sırasıyla … şıklar"
  new RegExp(`${OPTION}\\p{L}*[^.]{0,40}?\\s${ORDER}|${ORDER}[^.]{0,40}${OPTION}`, "u"),
];
/** "A şıkkı", "B seçeneği": büyük harfe bakar, özgün metinde aranır. */
const LETTER_PATTERN = new RegExp(`(?:^|[^\\p{L}])[A-E]\\s+(?:şıkk|seçene[kğ])`, "u");

/** Metin şıklara konumla mı gönderme yapıyor. */
export function refersToOptionOrder(text: string | undefined | null): boolean {
  const value = (text ?? "").trim();
  if (!value) return false;
  if (LETTER_PATTERN.test(value)) return true;
  const lower = value.toLocaleLowerCase("tr");
  return LOWER_PATTERNS.some((pattern) => pattern.test(lower));
}
