/**
 * Ünite başlığındaki kaynak sıra numarası (tek ortak yardımcı, 1 Kasım 2026).
 *
 * Kayıt defteri üniteleri kaynaktaki gibi numaralı tutar ("9. Sınıf · 2. Hikâye", "1. ÜNİTE: Basınç", "3) Şiir").
 * Sınavda çıkmayan üniteler atlandığı için numaralar boşluklu görünür; ekranda ve yol konu adlarında atılır.
 * Kodlar ve kayıt verisi değişmez.
 *
 * Korunanlar: "9. Sınıf" sınıf bölümü, "1302-1453" gibi yıl aralıkları (tireden önce boşluk yok), 3+ haneli sayılar,
 * Program düzeyinde (asıl kural): ünitelerin ≥ 2/3'ü numaralıysa numara resmî sıra numarasıdır ve atılır;
 * değilse hiçbirine dokunulmaz ("15. Yüzyıl-17. Yüzyıl Felsefesi" başlığın parçasıdır).
 * Bağlamsız tek başlıkta (eski kayıtlı konu adı eşlemesi) numaradan sonra "Yüzyıl", "Dünya", "Meşrutiyet"
 * gibi sözcük gelirse korunur ("1. Dünya Savaşı").
 */
const GRADE_SEGMENT = /^\d+\s*\.\s*Sınıf\b/u;
const ORDINAL = /^(\d{1,2})\s*(?:[.)]|\s[-–])\s*(?:(?:Ünite|ÜNİTE|ünite|Tema|TEMA|tema)\b\s*[:\-–.]?\s*)?/u;
const KEEP_AFTER = /^(?:Sınıf|Yüzyıl|YÜZYIL|yüzyıl|Yy|Asır|Dünya|DÜNYA|Meşrutiyet|MEŞRUTİYET|Dönem|Binyıl)\b/u;

function lastSegment(title: string): string {
  const parts = title.split(" · ");
  return parts[parts.length - 1] ?? title;
}

/** Ünite adı bölümü sıra numarasıyla mı başlıyor (korunan durumlar hariç)? */
export function hasUnitOrdinal(title: string, sequenced = false): boolean {
  const name = lastSegment(title).trim();
  if (GRADE_SEGMENT.test(name)) return false;
  const m = name.match(ORDINAL);
  if (!m) return false;
  const rest = name.slice(m[0].length).trim();
  // Numaralı programda (sequenced) numara kesin sıra numarasıdır: "5. Dünya Gücü Osmanlı" → "Dünya Gücü Osmanlı".
  return rest.length > 0 && (sequenced ? !/^Sınıf\b/u.test(rest) : !KEEP_AFTER.test(rest));
}

/** Tek başlık: ünite adı bölümündeki sıra numarası atılır; "X. Sınıf · " öneki kalır. */
export function stripUnitOrdinal(title: string, sequenced = false): string {
  if (!hasUnitOrdinal(title, sequenced)) return title;
  const parts = title.split(" · ");
  const last = parts.length - 1;
  parts[last] = parts[last]!.trim().replace(ORDINAL, "").trim();
  return parts.join(" · ");
}

/** Bir programın üniteleri: çoğu (≥ 2/3) numaralıysa numaralar atılır, yoksa başlıklar olduğu gibi kalır. */
export function displayUnitTitles(titles: readonly string[]): string[] {
  const numbered = titles.filter((t) => hasUnitOrdinal(t, true)).length;
  if (!titles.length || numbered * 3 < titles.length * 2) return titles.slice();
  return titles.map((t) => stripUnitOrdinal(t, true));
}
