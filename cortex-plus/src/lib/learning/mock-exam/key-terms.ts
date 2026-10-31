/**
 * "🎯 Sınavda Hocanın Puan Verdiği Anahtar Terimler & Birimler" (31 Ekim 2026, Paket J3 #11).
 *
 * Açık uçlu deneme sorusunun inceleme ekranında, öğrencinin kâğıdında mutlaka geçmesi gereken 3-4 kilit terim ve
 * birim. Modelsiz ve yalnız sorunun kendi notlandırma verisinden: örnek cevaptaki **koyu** terimler, ölçütlerde ve örnek
 * cevapta birlikte geçen içerik sözcükleri (puan getiren noktalar) ve örnek cevaptaki sayı + birim. Kod terim uydurmaz;
 * ikiden az bulunursa şerit gösterilmez.
 */

export const KEY_TERMS_TITLE = "🎯 Sınavda Hocanın Puan Verdiği Anahtar Terimler & Birimler";
const MAX_TERMS = 4;

const UNIT =
  /(\d+(?:[.,]\d+)?)\s*(m\/s²|m\/s2|m\/s|km\/sa|km\/h|kg|mg|g|mol\/L|mol|mL|L|kN|N|kJ|J|kW|W|kPa|Pa|atm|°C|K|mV|V|mA|A|Ω|Hz|cm³|cm²|cm|mm|km|m²|m³|m|sn|s|dk|TL|%)(?![a-zçğıöşü])/gi;

const STOP = new Set(
  (
    "olarak nedeni sonucu açıklama açıklar belirtir belirtilir yazar doğru şekilde arasındaki ilişkisi ilişki kavramı " +
    "kavram tanımı tanım örnek örneği verir gösterir cevap öğrenci ifade ifadesi eder edilir olan olduğu olduğunu olur " +
    "için gibi daha kadar sonra önce sebebi etkisi vurgular değinir söyler bahseder tanımlar kullanır hesaplar bulur " +
    "eksik tam doğruluğu yanlış yanlıştır gerekir gereken hangi neden nasıl şunu bunu şöyle bunun onun bunlar şunlar " +
    "ayrıca ancak çünkü yani hem veya ile ve de da mi bir iki üç değer değeri sonuç sonucunu hesabı hesaplama birimi"
  ).split(" "),
);

function fold(word: string): string {
  return word.toLocaleLowerCase("tr-TR");
}

function stem(word: string): string {
  return fold(word).slice(0, 5);
}

function words(text: string): string[] {
  return text.match(/[A-Za-zÇĞİÖŞÜçğıöşü][A-Za-zÇĞİÖŞÜçğıöşü'’-]*/g) ?? [];
}

export function scoringKeyTerms(input: { rubric: string[]; modelAnswer: string | null; questionText?: string }): string[] {
  const answer = input.modelAnswer ?? "";
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (term: string) => {
    const clean = term.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
    if (clean.length < 2 || clean.length > 40) return;
    const key = fold(clean).split(" ").map((part) => part.slice(0, 5)).join(" ");
    if (seen.has(key)) return;
    seen.add(key);
    out.push(clean);
  };

  // 1) Örnek cevabın koyu terimleri: yazar kilit sözcüğü zaten işaretlemiş.
  for (const match of answer.matchAll(/\*\*([^*]{2,40})\*\*/g)) add(match[1]);

  // 2) Her ölçütün puan getiren öbeği: ölçütte ve örnek cevapta ART ARDA geçen en uzun sözcük dizisi (en çok 4 sözcük;
  //    baştaki ve sondaki sözcük içerik sözcüğü). Tek sözcük ("üstünlüğü") öğrenciye bir şey söylemez, öbek söyler
  //    ("kanun üstünlüğü"). Kökte zaten yazan tek sözcük alınmaz.
  const answerTokens = words(answer);
  const answerStems = answerTokens.map(stem);
  const questionStems = new Set(words(input.questionText ?? "").map(stem));
  const content = (word: string) => {
    const clean = word.replace(/['’].*$/, "");
    return clean.length >= 4 && !STOP.has(fold(clean));
  };
  const phrases: Array<{ text: string; size: number }> = [];
  for (const criterion of input.rubric) {
    const tokens = words(criterion);
    const stems = tokens.map(stem);
    let best: { text: string; size: number } | null = null;
    for (let size = Math.min(4, tokens.length); size >= 1 && !best; size -= 1) {
      for (let from = 0; from + size <= tokens.length && !best; from += 1) {
        if (!content(tokens[from]) || !content(tokens[from + size - 1])) continue;
        const want = stems.slice(from, from + size);
        if (size === 1 && questionStems.has(want[0])) continue;
        for (let at = 0; at + size <= answerStems.length; at += 1) {
          if (want.every((value, offset) => answerStems[at + offset] === value)) {
            best = { text: answerTokens.slice(at, at + size).join(" "), size };
            break;
          }
        }
      }
    }
    if (best) phrases.push(best);
  }
  phrases.sort((a, b) => b.size - a.size);
  for (const phrase of phrases) {
    if (out.length >= MAX_TERMS - 1) break;
    add(phrase.text);
  }

  // 3) Sayı + birim: hesap sorusunda birimsiz sonuç puan kaybettirir.
  const units: string[] = [];
  // Sondan başa: sonucun birimi (son eşitlik) önce gelir.
  for (const match of [...answer.matchAll(UNIT)].reverse()) {
    const unit = match[2];
    if (units.some((item) => item.endsWith(` ${unit}`))) continue;
    units.push(`${match[1]} ${unit}`);
    if (units.length >= 2) break;
  }
  for (const unit of units) {
    if (out.length >= MAX_TERMS) break;
    add(unit);
  }
  return out.length >= 2 ? out.slice(0, MAX_TERMS) : [];
}
