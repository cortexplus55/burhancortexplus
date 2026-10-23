/*
  Kayıtlı podcast'lerdeki eski "kaynak dışı bilgi" etiketleri (23 Ekim 2026).

  Sıra: önce ağır etiket ("Belgende geçmiyor ama bilmen iyi olur:"; yazar neredeyse hiç kullanmadı), sonra üç hafif
  açılış (yargıçlar kulakta "kalıp gibi" buldu), sonra ekranda kalıp seste okunmayan açılış. Aynı gece ürün sahibinin
  kararıyla yazar etiket koymayı bıraktı: ders kitabı bilgisi etiketsiz (`teacher-podcast.ts` RULE_DOCUMENT).

  Bu modül önbellekte ve kayıtlarda duran eski podcast'ler için kalıyor: dinleme kontrolü etiketli satırı sormaz,
  seslendirme etiketi okumaz. Saf modül: dinleme kontrolü istemcide de çalışır.
*/
export const TEXTBOOK_MARKS = [
  "Kitaplarda şöyle anlatılır:",
  "Ders kitapları bunu şöyle açıklar:",
  "Genel olarak şöyle açıklanır:",
] as const;

/** Etiketli satır (üç açılış ve en eski etiket). */
export const TEXTBOOK_LINE =
  /^(?:Kitaplarda şöyle anlatılır|Ders kitapları bunu şöyle açıklar|Genel olarak şöyle açıklanır|Belgende geçmiyor ama)/i;

const TEXTBOOK_SPOKEN_PREFIX =
  /^(?:Kitaplarda şöyle anlatılır|Ders kitapları bunu şöyle açıklar|Genel olarak şöyle açıklanır|Belgende geçmiyor ama bilmen iyi olur)\s*:\s*/i;

/** Sese giden metinden etiketi çıkarır; etiket yoksa metin aynen. */
export function withoutTextbookLabel(spoken: string): string {
  const rest = spoken.replace(TEXTBOOK_SPOKEN_PREFIX, "");
  if (rest === spoken || !rest) return spoken;
  return rest.charAt(0).toLocaleUpperCase("tr-TR") + rest.slice(1);
}
