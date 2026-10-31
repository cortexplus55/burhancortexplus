/*
  Satır başındaki liste/adım numarasını güvenle atar (31 Ekim 2026).
  "12.000 + 38.000 = 50.000 TL." ve "1.250,50 TL" gibi binlik ayraçlı sayılar numara değildir:
  numara ancak ardından boşluk geliyorsa ve boşluktan sonra "000" gibi bir rakam grubu
  (binlik devamı) gelmiyorsa atılır. "Adım 2:", "3. adım:" gibi açık önekler de atılır.
  Tüm dersler için geneldir; konuya özgü hiçbir şey içermez.
*/

const WORD_PREFIX = /^\s*(?:adım|step)\s*\d{1,2}\s*[).:\-–]?\s+/i;
const NUMBER_WORD_PREFIX = /^\s*\d{1,2}\s*[.)]\s*(?:adım|step)\s*[:\-–)]\s*/i;
const BARE_PREFIX = /^\s*\d{1,3}[.)]\s+(?!\d{3}(?!\d))/;

/** Satır gerçek bir liste numarasıyla başlıyorsa numarayı atar; sayı ise dokunmaz. */
export function stripListMarker(line: string): string {
  for (const pattern of [NUMBER_WORD_PREFIX, WORD_PREFIX, BARE_PREFIX]) {
    if (pattern.test(line)) return line.replace(pattern, "");
  }
  return line;
}
