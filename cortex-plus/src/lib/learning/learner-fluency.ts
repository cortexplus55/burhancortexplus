/**
 * Ortak Türkçe yüzey kontrolü — ders, quiz, sözlü ve podcast aynı kapıyı kullanır.
 *
 * Kaynak cümlesi kopyalanırken iyelik eki yönelme ekine dönüyor:
 * "ürün miktarı" yerine "ürün miktara". Bu bir kelime listesi değil;
 * izafet konumundaki yönelme eki iyelik ekine çevrilir.
 */

const VOWELS = "aeıioöuü";

const FUNCTION_WORDS = new Set([
  "ve",
  "ile",
  "için",
  "icin",
  "gibi",
  "kadar",
  "göre",
  "gore",
  "sonra",
  "önce",
  "once",
  "ama",
  "fakat",
  "veya",
  "ya",
  "da",
  "de",
  "ki",
  "bu",
  "şu",
  "su",
  "bir",
  "her",
  "çok",
  "cok",
  "daha",
  "en",
  "mi",
  "mı",
  "mu",
  "mü",
  "ne",
  "nasıl",
  "nasil",
  "neden",
  "diğer",
  "diger",
  "öteki",
  "ise",
  "ancak",
  "çünkü",
  "cunku",
  "olarak",
  "üzere",
  "uzere",
]);

/** Yönelme ekini meşru kılan fiil veya edat. "okula gitti" durur. */
const LICENSES_DATIVE =
  /^(git|gid|gel|bak|koy|ulaş|ulas|dön|don|çık|cik|gir|otur|yaz|söyle|soyle|anlat|ver|al|gönder|gonder|yönel|yonel|dayan|bağlı|bagli|ait|rağmen|ragmen|karşı|karsi|doğru|dogru|kadar|göre|gore|dek|değin|degin|yönelik|yonelik|dair|kadar|doğru)/i;

const SLOT_FRAGMENT =
  /ters\s+çevrilirse\s+cümle|cümlede\s+kurulduğu\s+anlama|kurulduğu\s+anlama\s+uyuyor|kaynağın\s+kurduğu\s+tanımdan\s+kopar/i;

function lower(word: string): string {
  return word.toLocaleLowerCase("tr-TR");
}

function lastVowel(stem: string): string {
  for (let i = stem.length - 1; i >= 0; i -= 1) {
    if (VOWELS.includes(stem[i])) return stem[i];
  }
  return "e";
}

function harmonyVowel(vowel: string): string {
  if (vowel === "a" || vowel === "ı") return "ı";
  if (vowel === "o" || vowel === "u") return "u";
  if (vowel === "ö" || vowel === "ü") return "ü";
  return "i";
}

/** Yönelme biçimindeki adın gövdesi; değilse null. */
export function dativeStem(word: string): string | null {
  const w = lower(word).replace(/[.,;:!?]+$/g, "");
  if (w.length < 5 || FUNCTION_WORDS.has(w)) return null;
  if (/(ma|me)$/.test(w)) return null;

  if (/(da|de|ta|te)$/.test(w)) {
    const locativeStem = w.slice(0, -2);
    if (locativeStem && !VOWELS.includes(locativeStem.at(-1) ?? "")) return null;
  }

  let stem: string | null = null;
  if (/(ya|ye)$/.test(w)) {
    const candidate = w.slice(0, -2);
    if (candidate.length >= 4 && VOWELS.includes(candidate.at(-1) ?? "")) stem = candidate;
  } else if (/(a|e)$/.test(w)) {
    const candidate = w.slice(0, -1);
    if (candidate.length >= 4 && !VOWELS.includes(candidate.at(-1) ?? "")) stem = candidate;
  }
  return stem;
}

function toPossessive(stem: string): string {
  const vowel = harmonyVowel(lastVowel(stem));
  const bridge = VOWELS.includes(stem.at(-1) ?? "") ? "s" : "";
  return stem + bridge + vowel;
}

function matchCase(original: string, next: string): string {
  if (original[0] && original[0] === original[0].toLocaleUpperCase("tr-TR") && original[0] !== original[0].toLocaleLowerCase("tr-TR")) {
    return next[0].toLocaleUpperCase("tr-TR") + next.slice(1);
  }
  return next;
}

function isFunctionOrVerb(word: string): boolean {
  const bare = lower(word).replace(/[.,;:!?]+$/g, "");
  if (!bare || FUNCTION_WORDS.has(bare)) return true;
  return LICENSES_DATIVE.test(bare);
}

type Token = { raw: string; index: number };

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const re = /\p{L}[\p{L}'’]*|[^\s]/gu;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    tokens.push({ raw: match[0], index: match.index });
  }
  return tokens;
}

/**
 * İzafet konumundaki yönelme ekini iyelik ekine çevirir.
 * "ürün miktara ile" → "ürün miktarı ile".
 * "fermanın maddeye" → "fermanın maddesi".
 * "akım şiddete" (cümle sonu) → "akım şiddeti".
 */
export function repairTurkishSurface(text: string): string {
  const tokens = tokenize(text);
  if (tokens.length < 2) return text;

  const replacements: { start: number; end: number; next: string }[] = [];

  for (let i = 1; i < tokens.length; i += 1) {
    const prev = tokens[i - 1];
    const current = tokens[i];
    if (!/\p{L}/u.test(prev.raw) || !/\p{L}/u.test(current.raw)) continue;
    if (isFunctionOrVerb(prev.raw)) continue;

    const stem = dativeStem(current.raw);
    if (!stem) continue;

    const next = tokens[i + 1];
    const nextBare = next ? lower(next.raw).replace(/[.,;:!?]+$/g, "") : "";
    const followedByIle = nextBare === "ile";
    const atSentenceEnd = !next || /^[.!?]$/.test(next.raw);
    const prevBare = lower(prev.raw);
    const prevIsGenitive = /(nın|nin|nun|nün)$/.test(prevBare);
    const nextLicenses = Boolean(next && /\p{L}/u.test(next.raw) && LICENSES_DATIVE.test(nextBare) && nextBare !== "ile");

    if (nextLicenses) continue;
    // Virgül emir kipini ("belirle,") yönelme sanmasın. Cümle sonu ve "ile" yeter.
    if (!followedByIle && !prevIsGenitive && !atSentenceEnd) continue;
    if (!followedByIle && !prevIsGenitive && next && /\p{L}/u.test(next.raw)) continue;

    const end = current.index + current.raw.length;
    replacements.push({
      start: current.index,
      end,
      next: matchCase(current.raw, toPossessive(stem)),
    });
  }

  if (!replacements.length) return text;
  let out = text;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, replacement.start) + replacement.next + out.slice(replacement.end);
  }
  return out;
}

/**
 * Şablon artığı. Kısa başlık ve fiilsiz formül burada yargılanmaz;
 * yakalanan şey "hangi X'in … cümle" gibi doldurulmamış kalıptır.
 */
export function isWellFormedTurkishSentence(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return !SLOT_FRAGMENT.test(trimmed);
}

/** Onarılmamış hal eki ve şablon artığı. Onarım kimliği bozmaz. */
export function turkishSurfaceIssues(text: string): string[] {
  const issues: string[] = [];
  if (repairTurkishSurface(text) !== text) {
    issues.push("Hal eki bozulmuş; iyelik eki bekleniyor.");
  }
  if (!isWellFormedTurkishSentence(text)) {
    issues.push("Cümle yarım veya şablon artığı.");
  }
  return issues;
}

/** Onarılabileni onarır; kalan bozukluk issue olarak döner. */
export function scanFluencyIssues(text: string): { text: string; issues: string[] } {
  const repaired = repairTurkishSurface(text);
  const issues: string[] = [];
  if (!isWellFormedTurkishSentence(repaired)) {
    issues.push("Cümle yarım veya şablon artığı.");
  }
  return { text: repaired, issues };
}

/** Ders ağacındaki her metin alanını aynı onarımdan geçirir. */
export function repairLessonSurface<T>(value: T): T {
  if (typeof value === "string") return repairTurkishSurface(value) as T;
  if (Array.isArray(value)) return value.map((item) => repairLessonSurface(item)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = repairLessonSurface(child);
    }
    return out as T;
  }
  return value;
}

const STOP_STEMS = new Set([
  "olan",
  "olarak",
  "için",
  "ile",
  "gibi",
  "kadar",
  "daha",
  "çok",
  "her",
  "bir",
  "bu",
  "şu",
  "ve",
  "veya",
  "ama",
  "ise",
  "değil",
  "diğer",
  "öteki",
]);

/** Karşılaştırma için kaba gövde. Ek listesi geneldir, derse özel değildir. */
export function contentStems(text: string): string[] {
  const words = text
    .toLocaleLowerCase("tr-TR")
    .split(/[^a-zçğıöşü0-9]+/i)
    .filter((word) => word.length >= 4 && !STOP_STEMS.has(word));
  return [...new Set(words.map(stemWord))];
}

const STRIP_SUFFIXES = [
  "lerinden",
  "larından",
  "lerinden",
  "ların",
  "lerin",
  "ları",
  "leri",
  "ından",
  "inden",
  "mekte",
  "makta",
  "iyor",
  "ıyor",
  "uyor",
  "üyor",
  "dır",
  "dir",
  "dur",
  "dür",
  "tır",
  "tir",
  "tur",
  "tür",
  "mek",
  "mak",
  "mış",
  "miş",
  "muş",
  "müş",
  "dan",
  "den",
  "tan",
  "ten",
  "nın",
  "nin",
  "nun",
  "nün",
  "lar",
  "ler",
  "sı",
  "si",
  "su",
  "sü",
  "ır",
  "ir",
  "ur",
  "ür",
  "ı",
  "i",
  "u",
  "ü",
];

function stemWord(word: string): string {
  let stem = word;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = STRIP_SUFFIXES.find(
      (suffix) => stem.endsWith(suffix) && stem.length - suffix.length >= 4,
    );
    if (!next) break;
    stem = stem.slice(0, -next.length);
  }
  return stem;
}

export function stemsOverlap(left: string[], right: string[]): boolean {
  return left.some((a) =>
    right.some((b) => a === b || (a.length >= 5 && b.length >= 5 && (a.startsWith(b) || b.startsWith(a)))),
  );
}

/** Önceki metnin birebir kopyası mı? Kısa formül tekrarları kopya sayılmaz. */
export function isCopiedFromPrior(point: string, priorTexts: string[]): boolean {
  const folded = point.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
  if (folded.split(" ").length < 5) return false;
  const prior = priorTexts.join("\n").toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
  return prior.includes(folded);
}

/**
 * Doğru/yanlış sorusu ekrandaki cümlenin aynısı mı?
 * Eşik yüksek: kavramı tersine çeviren kısa yanılgı elenmez.
 */
export function isEchoOfPriorText(prompt: string, priorTexts: string[]): boolean {
  const folded = prompt.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
  if (folded.length < 24) return false;
  return priorTexts.some((prior) =>
    prior.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").includes(folded),
  );
}

/** "Diğer madde ise artar" tek başına anlaşılmaz. */
export function isContextlessFragment(point: string): boolean {
  const folded = point.trim().toLocaleLowerCase("tr-TR");
  return /^(diğer|öteki|o ise|bu ise)\b/.test(folded);
}
