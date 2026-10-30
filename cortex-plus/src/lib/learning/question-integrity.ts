import { exponentKeyWrong } from "@/lib/learning/exponent-key";
import { mathKeyWrong, mathNoOptionMatches, mathOptionsAmbiguous } from "@/lib/learning/math-key";
import { equivalentOptionPair } from "@/lib/learning/option-equivalence";

/*
  Soru bütünlüğü (30 Ekim 2026, Paket I #6). Canlı stres testinde:
  - Ders içi soruda iki şık aynıydı ("D ve E aynı") ve hiçbir şık doğru değildi.
  - Yazılı denemede kök tek cevap istiyordu ("hangisidir"), anahtarda iki doğru vardı: kod modelin işaretlediği
    iki doğruyu sessizce çok cevaplıya çeviriyor, kökle uyumuna bakmıyordu.
  - Kök "dört işlev" deyip beş öğe sayıyordu.
  Ders içi soru (teacher-lesson `checkIssues`) testin hesap ve eşdeğer şık denetimlerini hiç almıyordu.
  Bu dosya hepsini tek yerde toplar. Hiçbiri metni değiştirmez: sorun yazılır, soru düzeltme turuna ya da yedeğe gider.
  Ders adına ya da konuya bağlı kelime yok; yalnız soru biçimi.
*/

/** Şıkların karşılaştırma anahtarı: büyük/küçük harf, boşluk, sondaki noktalama, ok/tire/tırnak biçimi yok sayılır. */
export function optionKey(option: string): string {
  return option
    .normalize("NFKC")
    .toLocaleLowerCase("tr")
    .replace(/[→⇒⟶➝]|-+>|=>/gu, ">")
    .replace(/[−–—]/gu, "-")
    .replace(/[“”„«»"]/gu, "'")
    .replace(/[’‘`´]/gu, "'")
    .replace(/[.!?;:,]+$/u, "")
    .replace(/\s+/gu, "")
    .trim();
}

/** Yazım farkıyla da olsa aynı iki şık; yoksa null. */
export function duplicateOptionPair(options: readonly string[]): [string, string] | null {
  const seen = new Map<string, string>();
  for (const option of options) {
    const key = optionKey(option);
    if (!key) continue;
    const before = seen.get(key);
    if (before !== undefined) return [before, option];
    seen.set(key, option);
  }
  return null;
}

const NUMBER_WORDS: Record<string, number> = {
  iki: 2,
  üç: 3,
  dört: 4,
  dörd: 4,
  beş: 5,
  altı: 6,
  yedi: 7,
  sekiz: 8,
  dokuz: 9,
  on: 10,
};

function countWord(word: string): number | null {
  const lowered = word.toLocaleLowerCase("tr");
  if (/^\d+$/.test(lowered)) {
    const value = Number(lowered);
    return value >= 2 && value <= 12 ? value : null;
  }
  return NUMBER_WORDS[lowered] ?? null;
}

/** Kök tek bir cevap mı soruyor ("hangisidir", "nedir", "kaçtır")? Çok cevap işareti ("hangileri") varsa hayır. */
function stemAsksSingle(stem: string): boolean {
  const text = stem.toLocaleLowerCase("tr");
  if (/hangiler|tümünü|hepsini|birden\s+(?:fazla|çok)|doğru\s+olanların\s+(?:tümü|hepsi)/u.test(text)) return false;
  return /(?:^|[^\p{L}])(?:hangisi(?:dir|nde|ne|nin|yle|ni)?|nedir|kaçtır)(?=[^\p{L}]|$)/u.test(text);
}

/** "Hangi ikisi", "iki tanesi", "üç doğru": kökün istediği doğru sayısı. */
function stemWantedCount(stem: string): number | null {
  const text = stem.toLocaleLowerCase("tr");
  const match =
    /(?:^|[^\p{L}])hangi\s+(\p{L}+|\d+)(?:si|sı|ü|i)?(?=[^\p{L}]|$)/u.exec(text) ??
    /(?:^|[^\p{L}])(\p{L}+|\d+)\s+(?:tanesi|tanesini|doğru(?:yu)?\s+(?:seç|işaretle))/u.exec(text);
  if (!match) return null;
  const root = match[1].replace(/(?:sini|sını|si|sı|ü|i|u)$/u, "");
  return countWord(root) ?? countWord(match[1]);
}

/**
 * Kök ile doğru sayısı uyuşuyor mu. Yalnız açık çelişki yazılır: çok cevaplı (ya da birden çok doğru işaretli) soruda
 * kök tek cevap istiyor, ya da kök "hangi ikisi" deyip başka sayıda doğru var. "Hangileri doğrudur? A) I ve II"
 * kalıbı tek doğrulu Türkçe sınav sorusudur; o yüzden "çoğul kök + tek doğru" sorun sayılmaz.
 */
export function answerCountIssue(stem: string, correctCount: number): string | null {
  if (correctCount > 1 && stemAsksSingle(stem)) {
    return `Kök tek cevap istiyor ama ${correctCount} doğru işaretli; ya tek doğru bırak ya da kökü 'Aşağıdakilerden hangileri …?' diye yaz.`;
  }
  const wanted = stemWantedCount(stem);
  if (wanted !== null && correctCount > 1 && wanted !== correctCount) {
    return `Kök ${wanted} doğru istiyor, ${correctCount} doğru işaretli.`;
  }
  return null;
}

/** Kökte sıralanan öğeler: "I. … II. … III. …" ya da satır başı madde işaretleri. */
function listedItems(text: string): number {
  const roman = text.match(/(?:^|[\s(])(?:I|II|III|IV|V|VI|VII|VIII)[.)](?=\s)/gu)?.length ?? 0;
  const bullets = text.match(/(?:^|\n)\s*(?:[-•*]|\d+[.)]|[a-eA-E][.)])\s+\S/gu)?.length ?? 0;
  return Math.max(roman, bullets);
}

/**
 * Metin "N öğe" deyip başka sayıda öğe sıralıyor mu ("dört işlevi vardır: a, b, c, d ve e"; ya da kök "aşağıdaki üç
 * ifade" deyip dört madde veriyor). Liste yalnız iki noktadan sonra, kısa öğelerle sayılır; düz yazı sayılmaz.
 */
export function enumeratedCountIssue(text: string): string | null {
  if (!text.trim()) return null;
  // Yalnız sayı kelimesine bağlanır (önündeki kelime eşleşmeyi yutmasın); arkasında bir ad gelmeli ("dört temel işlevi").
  const claims = [
    ...text.matchAll(/(?:^|[^\p{L}\d])(iki|İki|üç|dört|beş|altı|yedi|sekiz|dokuz|on|\d{1,2})\s+(?=(?:temel\s+|ana\s+|farklı\s+)?\p{L}{3,})/giu),
  ];
  for (const claim of claims) {
    const claimed = countWord(claim[1]);
    if (claimed === null) continue;
    const before = text.slice(0, claim.index ?? 0).trimEnd();
    const after = text.slice((claim.index ?? 0) + claim[0].length);
    // "Aşağıdaki üç ifade" + "I. … II. … III. …" (ya da maddeler önce, "Yukarıdaki üç ifade" sonra).
    const lead = /(?:^|[^\p{L}])(aşağıdaki|yukarıdaki|verilen|şu)$/iu.exec(before)?.[1]?.toLocaleLowerCase("tr");
    if (lead) {
      const items = listedItems(lead === "yukarıdaki" ? before : after);
      if (items >= 2 && items !== claimed) return `Metin ${claimed} öğe diyor, ${items} öğe sıralıyor.`;
      if (items >= 2) continue;
    }
    // "… dört işlevi vardır: a, b, c, d ve e."
    const colon = /^[^:.\n]{0,40}:\s*([^.\n]+)/u.exec(after);
    if (!colon) continue;
    const parts = colon[1]
      .replace(/\([^)]*\)/gu, " ")
      .split(/\s*(?:,|;|\sve\s|\sile\s)\s*/u)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length < 2 || parts.some((part) => part.split(/\s+/u).length > 6)) continue;
    if (parts.length !== claimed) return `Metin ${claimed} öğe diyor, ${parts.length} öğe sayıyor.`;
  }
  return null;
}

/*
  Eşik şıkları (30 Ekim 2026, canlı tur, düello S7): kök "aylık %50'yi aşması" derken "Aylık %50" ve "Aylık %50'nin
  üzeri" iki ayrı şıktı. Aynı sayılar, aynı geri kalan sözcükler; biri yalın, öbürü yönlü (ya da iki farklı yönlü söz:
  "en az %50" / "%50'nin üzeri") → iki şık da savunulur. Zıt yönler ("üzeri" / "altı") ayrı cevaptır.
*/
const THRESHOLD_PHRASES: { pattern: RegExp; direction: "up" | "down" }[] = [
  { pattern: /(?:^|\s)ve\s+(?:üzeri|üstü|fazlası)(?=\s|$)/gu, direction: "up" },
  { pattern: /(?:^|\s)ve\s+(?:altı|aşağısı)(?=\s|$)/gu, direction: "down" },
  { pattern: /(?:^|\s)en\s+az(?=\s|$)/gu, direction: "up" },
  { pattern: /(?:^|\s)en\s+(?:çok|fazla)(?=\s|$)/gu, direction: "down" },
  {
    pattern:
      /(?:^|\s)(?:üzeri|üzerinde|üzerindeki|üstü|üstünde|fazla|fazlası|aşan|aşkın|aşması|büyük|yüksek|uzun|sonra|geç|çok)(?=\s|$)/gu,
    direction: "up",
  },
  { pattern: /(?:^|\s)(?:altı|altında|altındaki|az|azı|düşük|küçük|kısa|önce|erken|aşmayan)(?=\s|$)/gu, direction: "down" },
];

type ThresholdShape = { numbers: string; rest: string; qualifiers: string[]; directions: Set<"up" | "down"> };

function thresholdShape(option: string): ThresholdShape | null {
  // Simgeli eşitsizlik ("x > 5" / "x ≥ 5") kesin yazımdır; matematik sorusu kapsayıcılığı bilerek sorar.
  if (/[<>≤≥=]/u.test(option)) return null;
  const numbers = (option.match(/\d+(?:[.,]\d+)?/gu) ?? []).map((value) => value.replace(",", ".")).sort();
  if (!numbers.length) return null;
  let text = ` ${option
    .normalize("NFKC")
    .toLocaleLowerCase("tr")
    // Sayıya ya da kısaltmaya bitişik ek: "%50'nin", "12 aydan", "2 SD'nin".
    .replace(/\d+(?:[.,]\d+)?\s*%?|%\s*\d+(?:[.,]\d+)?/gu, " # ")
    .replace(/['’]\p{L}{1,4}/gu, " ")
    .replace(/[(),.;:!?"“”]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()} `;
  const qualifiers: string[] = [];
  const directions = new Set<"up" | "down">();
  for (const phrase of THRESHOLD_PHRASES) {
    text = text.replace(phrase.pattern, (hit) => {
      qualifiers.push(hit.trim());
      directions.add(phrase.direction);
      return " ";
    });
  }
  // Durum eki ("aydan sonra" → "ay", "yaşın üzeri" → "yaş"): ekin kendisi soruyu ayırmaz. İki şıkka aynı kural.
  const rest = text
    .split(/\s+/u)
    .filter((word) => word && word !== "#")
    .map((word) => {
      const suffix = /(?:ndan|nden|nın|nin|nun|nün|dan|den|tan|ten|da|de|ta|te|yı|yi|yu|yü|ya|ye|ın|in|un|ün|ı|i|u|ü|a|e)$/u.exec(word);
      return suffix && word.length - suffix[0].length >= 2 ? word.slice(0, word.length - suffix[0].length) : word;
    })
    .filter(Boolean)
    .join(" ");
  return { numbers: numbers.join("|"), rest, qualifiers: qualifiers.sort(), directions };
}

/** Aynı eşiği bir şıkta yalın, öbüründe yönüyle (ya da iki farklı yönlü sözle) taşıyan iki şık; yoksa null. */
export function thresholdTwinOptions(options: readonly string[]): [string, string] | null {
  const shapes = options.map((option) => ({ option, shape: thresholdShape(option) }));
  for (let i = 0; i < shapes.length; i += 1) {
    const left = shapes[i]!;
    if (!left.shape) continue;
    for (let j = i + 1; j < shapes.length; j += 1) {
      const right = shapes[j]!;
      if (!right.shape) continue;
      if (left.shape.numbers !== right.shape.numbers || left.shape.rest !== right.shape.rest) continue;
      if (left.shape.qualifiers.join("|") === right.shape.qualifiers.join("|")) continue;
      // Zıt yön ayrı cevaptır ("%50'nin üzeri" / "%50'nin altı").
      const opposite =
        (left.shape.directions.has("up") && right.shape.directions.has("down")) ||
        (left.shape.directions.has("down") && right.shape.directions.has("up"));
      if (opposite) continue;
      return [left.option, right.option];
    }
  }
  return null;
}

/** Eşik ikizinin sorun metni; `UNSALVAGEABLE_PROBLEM` bu başlangıcı tanır. */
export const THRESHOLD_TWIN_PREFIX = "İki şık aynı eşiği söylüyor";

type IntegrityCheck = {
  type: string;
  prompt: string;
  options?: string[];
  answerIndex?: number;
  explanation?: string;
};

/**
 * Tek doğrulu çoktan seçmeli sorunun kod denetimi (ders içi soru ve test aynı listeye bakar): aynı şık, eşdeğer şık,
 * hesapla çelişen anahtar, hiçbir şıkkın tutmaması, iki şıkkın aynı değere çıkması, sayı tutarsızlığı.
 */
export function singleAnswerIntegrityIssues(check: IntegrityCheck): string[] {
  const issues: string[] = [];
  const options = check.options ?? [];
  const twin = duplicateOptionPair(options);
  if (twin) issues.push(`Aynı şık iki kez yazılmış ('${twin[0]}' = '${twin[1]}').`);
  if (check.type === "mcq" && options.length >= 2) {
    const keyed = { type: check.type, prompt: check.prompt, options, answerIndex: check.answerIndex };
    if (exponentKeyWrong(keyed) === true || mathKeyWrong(keyed) === true) {
      issues.push("Cevap anahtarı hesapla çelişiyor.");
    } else if (mathNoOptionMatches(keyed)) {
      issues.push("Hiçbir şık kökteki hesabın sonucunu vermiyor.");
    } else if (!twin && mathOptionsAmbiguous(keyed)) {
      issues.push("İki şık aynı cevap: aynı değer ya da aynı öğeler farklı sırayla.");
    }
    if (!twin) {
      const equivalent = equivalentOptionPair(options, check.prompt);
      if (equivalent) {
        issues.push(`İki şık eşdeğer ('${equivalent[0]}' = '${equivalent[1]}'); tek doğrulu soruda biri doğruysa öteki de doğru olur.`);
      }
      const threshold = thresholdTwinOptions(options);
      if (threshold) {
        issues.push(
          `${THRESHOLD_TWIN_PREFIX} ('${threshold[0]}' / '${threshold[1]}'); eşiğin yönünü kökte bir kez yaz, şıklar farklı sayılar olsun.`,
        );
      }
    }
  }
  const counted = enumeratedCountIssue(check.prompt) ?? enumeratedCountIssue(check.explanation ?? "");
  if (counted) issues.push(counted);
  return issues;
}
