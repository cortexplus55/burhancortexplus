/**
 * Türkçe metinde "aynı bilgi" ölçüsünün ortak parçaları (30 Ekim 2026, canlı tur: Makroekonomi notu).
 *
 * Eski ölçüler sözcüğün ilk beş ya da altı harfini anahtar alıyordu. Türkçe eklerde bu iki yönde yanılıyor:
 * fiil kökü üç harfli olunca ("sürerken" / "sürmesi", "artış" / "artırır", "arzı" / "arzındaki") aynı sözcük iki
 * ayrı anahtar oluyor; bu yüzden kökteki "tarımsal verimsizlik sürerken" ifadesi doğru şıkta ("tarımsal
 * verimsizliğin … sürmesi") görülmüyordu. Burada iki sözcük aynı köktendir: ortak önek en az beş harf, ya da kısa
 * sözcük uzunun önekidir, ya da en az üç harflik ortak önekten sonra kısa sözcükte en çok dört harf (ek) kalır.
 * Ölçü kaba ve tek başına karar vermez: kullanan yer her zaman birden çok sözcüğe ve karşılaştırmaya bakar.
 * Ders adı ya da konu kelimesi yok; yalnız biçim.
 */

/** Bilgi taşımayan sözcükler: bağlaç, soru kalıbı, gösterme. */
const FUNCTION_WORDS = new Set([
  "bir", "bu", "şu", "o", "ve", "ile", "veya", "ya", "da", "de", "ki", "için", "gibi", "daha", "en", "çok", "az",
  "olan", "olarak", "olur", "olması", "olmaz", "ise", "iken", "her", "tüm", "bütün", "bazı", "hangi", "hangisi",
  "hangisidir", "hangileri", "hangisinde", "aşağıdakilerden", "aşağıdaki", "yukarıdaki", "nedir", "neyi", "ne",
  "nasıl", "neden", "niçin", "kaç", "kaçtır", "kadar", "sonra", "önce", "göre", "karşı", "ait", "dair", "yani",
  "ancak", "fakat", "ama", "çünkü", "doğru", "yanlış", "doğrudur", "yanlıştır", "değildir", "değil", "durum",
  "durumda", "durumu", "ifade", "eder", "edilir", "verilir", "denir", "ad", "adı", "adlandırılır", "kavram",
  "kavramı", "kavramla", "açıklanır", "gösterir", "göstermektedir", "belirtir", "hangisiyle", "aşağıda", "kim",
  "kime", "kimdir", "kimin", "nerede", "nereye", "zaman",
]);

/** Metnin içerik sözcükleri (sırayla): küçük harf, en az üç harf ya da rakamlı belirteç; bağlaç ve kalıp yok. */
export function contentTokens(text: string): string[] {
  return text
    .toLocaleLowerCase("tr")
    .replace(/==|\*\*/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => (/\d/u.test(word) ? word.length >= 1 : word.length >= 3))
    .filter((word) => !FUNCTION_WORDS.has(word));
}

/** İki sözcük aynı kökten mi (ek farkı yok sayılır). Rakamlı belirteç yalnız birebir eşleşir. */
export function sameRoot(a: string, b: string): boolean {
  if (a === b) return true;
  if (/\d/u.test(a) || /\d/u.test(b)) return false;
  let shared = 0;
  while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared += 1;
  if (shared >= 5) return true;
  const shorter = Math.min(a.length, b.length);
  if (shared < 3) return false;
  // Kısa sözcük uzunun öneki ("ceza" / "cezada", "arzı" / "arzındaki").
  if (shared === shorter) return true;
  // Dört harflik kök + ek zinciri ("azaldığında" / "azalmasıyla").
  if (shared >= 4 && shorter >= 6) return true;
  // Üç harflik kök + kısa ek ("sürerken" / "sürmesi", "artış" / "artırır").
  return shorter >= 5 && shorter - shared <= 4;
}

/** `part` sözcüklerinin kaçta kaçı `whole` içinde aynı kökle geçiyor (0-1). Boş `part` 0. */
export function rootCoverage(part: readonly string[], whole: readonly string[]): number {
  const unique = [...new Set(part)];
  if (!unique.length) return 0;
  const hits = unique.filter((word) => whole.some((other) => sameRoot(word, other))).length;
  return hits / unique.length;
}

/**
 * Kökte art arda geçen `size` içerik sözcüğü doğru şıkta aynı sırayla geçiyor ve hiçbir çeldirici bu sözcüklerin
 * hepsini taşımıyorsa, kök doğru şıkkı kendisi kuruyor demektir (30 Ekim 2026, yazılı deneme S4: kök "tarımsal
 * verimsizlik sürerken …", doğru şık "Tarımsal verimsizliğin … sürmesi"; çeldiricide "Tarımsal verimsizliğin
 * azalması" iki sözcüğü taşıdığı için tek sözcük denetimi bu ikisinde susuyordu). Tek bir genel sözcüğün tesadüfen
 * eşleşmesi ("ekonomide" / "ekonomideki") ölçünün dayanağı değildir: üç sözcük ve sıra şart. Eşleşen kök ifadesi
 * döner, yoksa null.
 */
export function stemPhraseInAnswer(stem: string, answer: string, distractors: readonly string[], size = 3): string | null {
  const stemWords = contentTokens(stem);
  const answerWords = contentTokens(answer);
  if (stemWords.length < size || answerWords.length < size) return null;
  const others = distractors.map(contentTokens);
  for (let start = 0; start + size <= stemWords.length; start += 1) {
    const window = stemWords.slice(start, start + size);
    if (new Set(window).size < size) continue;
    let at = -1;
    let inOrder = true;
    for (const word of window) {
      const next = answerWords.findIndex((other, index) => index > at && sameRoot(word, other));
      if (next < 0) {
        inOrder = false;
        break;
      }
      at = next;
    }
    if (!inOrder) continue;
    const shared = others.some((option) => window.every((word) => option.some((other) => sameRoot(word, other))));
    if (shared) continue;
    return window.join(" ");
  }
  return null;
}
