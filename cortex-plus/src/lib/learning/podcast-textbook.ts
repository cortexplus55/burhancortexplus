/*
  Ders kitabı nedeni (23 Ekim 2026, ürün sahibinin kararı: "podcast'i Astra seviyesine taşımak için ne gerekiyorsa").
  Altıncı kör ölçümde öğrenci gözü 48 / 74: Astra nedenini ve tipik örneği ders kitabından, etiketsiz ekliyordu; bizim
  ağır etiketimizi ("Belgende geçmiyor ama bilmen iyi olur:") yazar neredeyse hiç kullanmıyordu. Sayı, eşik, tanı,
  tedavi ve sınıflandırma yine yalnız kaynaktan; neden cümlesi hafif etiketle, tipik örnek etiketsiz. Denetçi F
  ikisinin de doğruluğuna bakar. Eski etiket kayıtlı podcast'lerde duruyor; okuyucular ikisini de tanır.

  Saf modül: dinleme kontrolü (istemci de okur) ve podcast motoru aynı etiketi kullanır.
*/
export const TEXTBOOK_MARK = "Kitaplarda şöyle anlatılır:";
/**
 * Aynı etiket art arda üç kez "kalıp gibi" duyuldu (23 Ekim 2026, sekizinci ölçüm). Yazar bu üç açılıştan birini seçer;
 * okuyucular (dinleme kontrolü, denetçi) üçünü de tanır.
 */
export const TEXTBOOK_MARKS = [TEXTBOOK_MARK, "Ders kitapları bunu şöyle açıklar:", "Genel olarak şöyle açıklanır:"] as const;
export const TEXTBOOK_LIMIT = 5;
/** Kaynakta olmayan, etiketli neden cümlesi (yeni ve eski etiket). */
export const TEXTBOOK_LINE =
  /^(?:Kitaplarda şöyle anlatılır|Ders kitapları bunu şöyle açıklar|Genel olarak şöyle açıklanır|Belgende geçmiyor ama)/i;
/**
 * Etiket ekranda kalır, seste okunmaz (23 Ekim 2026, dokuzuncu ölçüm): yargıçlar üç açılışı da "kulakta yapay,
 * akışı bölüyor" buldu. Bilgi yine işaretli: dökümde ve oynatıcının alt yazısında görünür.
 */
export const TEXTBOOK_SPOKEN_PREFIX =
  /^(?:Kitaplarda şöyle anlatılır|Ders kitapları bunu şöyle açıklar|Genel olarak şöyle açıklanır|Belgende geçmiyor ama bilmen iyi olur)\s*:\s*/i;

/** Sese giden metinden etiketi çıkarır; etiket yoksa metin aynen. */
export function withoutTextbookLabel(spoken: string): string {
  const rest = spoken.replace(TEXTBOOK_SPOKEN_PREFIX, "");
  if (rest === spoken || !rest) return spoken;
  return rest.charAt(0).toLocaleUpperCase("tr-TR") + rest.slice(1);
}

/** İstemlerde etiket listesi: 'A', 'B' ya da 'C'. */
export const TEXTBOOK_MARKS_TEXT = TEXTBOOK_MARKS.map((mark) => `'${mark}'`).join(", ");
