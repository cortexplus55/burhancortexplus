/**
 * Cevap anahtarı ↔ açıklama tutarlılığı ve kökün kendi içinde tamlığı (29 Ekim 2026, Paket H).
 *
 * Neden: anahtar (`answerIndex` / `correct`) ile `explanation` / `optionWhy` / `steps` / `hint` aynı model
 * çağrısının bağımsız alanları; kod yalnız `steps` → anahtar bağını kuruyordu. Canlıda "%70'i: 200 × 0,70 =
 * 140 TL" diyen ders sorusunun anahtarı 160 TL'yi gösterdi; çok cevaplıda "f(A) = {4, 5, 6}" diyen gerekçe
 * "7 ∈ f(A)" şıkkını çürütürken şık doğru listesindeydi; "haritada işaretli bölge" kökü veri taşımadan çıktı.
 *
 * Bu modül ders içi check, konu testi, yazılı deneme, çok cevaplı soru ve ikinci soru (review) için ORTAKTIR;
 * yalnız `result-values` ve `option-reference`'a bakar (ders/test motorlarından bağımsız). Ders kelimesi yok:
 * yalnız sayı, işaret ve Türkçe kalıp sözcükleri. Kod metin yazmaz; yalnız değer okur ve karşılaştırır.
 *
 * Yanlış alarm kapıları: bir cümle iki farklı şık değeri taşıyorsa ("3² + 4² = 25, karekökü 5") okunmaz; sayının
 * yakınında olumsuzluk ("değil", "yanlış", "olmaz") varsa okunmaz; değer tam olarak BİR şıkta yoksa sorun yazılmaz.
 */

import { chainsOf, firstResultSentence, normalizeNumberText, numbersIn, optionValueIndexes, optionValues, sameNumber } from "@/lib/learning/result-values";

export type ConsistencyFields = {
  options: readonly string[];
  /** Anahtarlı şık indeksleri: tek doğruda bir öğe, çok cevaplıda küme. */
  keyed: readonly number[];
  steps?: readonly string[] | null;
  optionWhy?: readonly string[] | null;
  whyRight?: string | null;
  explanation?: string | null;
  hint?: string | null;
};

export type FinalValueSource = "steps" | "optionWhy" | "whyRight" | "explanation" | "hint";

export type FinalValue = {
  value: number;
  source: FinalValueSource;
  /** Değerin okunduğu cümle (kayıt ve mesaj için). */
  sentence: string;
  /** Eşitlik zincirinden ya da çözüm adımından okundu (hesaplanmış sonuç). */
  computed: boolean;
};

export type AnswerMismatch = {
  value: number;
  /** Değeri taşıyan tek şık. */
  expected: string;
  expectedIndex: number;
  /** Anahtarın gösterdiği şık(lar). */
  keyed: string[];
  source: FinalValueSource;
};

const NEGATION = /(?:^|[^\p{L}])(?:değil(?:dir)?|yanlış(?:tır)?|olmaz|olamaz|hatalı(?:dır)?)(?=[^\p{L}]|$)/iu;
/** Cümle çeldiriciyi anlatarak başlıyorsa ilk sonuç cümlesi değildir. */
const DISTRACTOR_OPENER = /^\s*(?:öteki|diğer|yanlış|hatalı|çeldirici|oysa|ancak)\b/iu;

const fold = (text: string) => text.toLocaleLowerCase("tr");

function distinctOptionHits(sentence: string, allValues: readonly number[]): number[] {
  const hits: number[] = [];
  for (const value of numbersIn(sentence)) {
    if (!allValues.some((item) => sameNumber(item, value))) continue;
    if (!hits.some((item) => sameNumber(item, value))) hits.push(value);
  }
  return hits;
}

/** Değerin geçtiği her yerde 10 karakter öncesi ve 16 karakter sonrasında olumsuzluk var mı. */
function negatedNear(sentence: string, value: number): boolean {
  const normalized = normalizeNumberText(sentence);
  for (const match of normalized.matchAll(/-?\d+(?:\.\d+)?/g)) {
    const at = match.index ?? 0;
    let raw = match[0];
    if (raw.startsWith("-") && /[\d\p{L}]/u.test(normalized[at - 1] ?? "")) raw = raw.slice(1);
    if (!sameNumber(Number(raw), value)) continue;
    const before = normalized.slice(Math.max(0, at - 10), at);
    const after = normalized.slice(at + match[0].length, at + match[0].length + 16);
    if (NEGATION.test(fold(before)) || NEGATION.test(fold(after))) return true;
  }
  return false;
}

/**
 * Cümlenin vardığı değer. Eşitlik zinciri varsa son zincirin son değeri; yoksa cümledeki şık değerleriyle
 * eşleşen TEK sayı. `computedOnly`: yalnız zincir (şıkkın kendi gerekçesi kendi sayısını anar; o sayı sonuç
 * değildir).
 */
function valueFromSentence(sentence: string, allValues: readonly number[], computedOnly: boolean): { value: number; computed: boolean } | null {
  if (!sentence.trim()) return null;
  const hits = distinctOptionHits(sentence, allValues);
  if (hits.length >= 2) return null;
  let value: number | null = null;
  let computed = false;
  if (sentence.includes("=")) {
    const chain = chainsOf(sentence).filter((item) => item.values.length).at(-1);
    if (chain) {
      value = chain.values.at(-1)!;
      computed = true;
    }
  }
  if (value == null && !computedOnly && hits.length === 1 && !DISTRACTOR_OPENER.test(sentence)) value = hits[0]!;
  if (value == null) return null;
  if (negatedNear(sentence, value)) return null;
  return { value, computed };
}

/**
 * Açıklamanın vardığı sonuç değeri; kaynak sırası steps kuyruğu → optionWhy[anahtar] → whyRight → explanation'ın
 * ilk sonuç cümlesi → hint. İlk okunabilen kazanır. Çok cevaplıda optionWhy ve whyRight okunmaz (anahtar küme).
 */
export function explanationFinalValue(fields: ConsistencyFields): FinalValue | null {
  const allValues = fields.options.flatMap((option) => optionValues(option));
  if (!allValues.length) return null;
  const single = fields.keyed.length === 1 ? fields.keyed[0]! : null;
  const steps = (fields.steps ?? []).map((line) => line.trim()).filter(Boolean);
  const candidates: { source: FinalValueSource; sentence: string; computedOnly: boolean }[] = [];
  if (steps.length) {
    candidates.push({ source: "steps", sentence: steps[steps.length - 1]!, computedOnly: false });
  }
  if (single != null) {
    const why = fields.optionWhy?.[single];
    if (why?.trim()) candidates.push({ source: "optionWhy", sentence: firstResultSentence(why), computedOnly: true });
    if (fields.whyRight?.trim()) candidates.push({ source: "whyRight", sentence: firstResultSentence(fields.whyRight), computedOnly: true });
  }
  if (fields.explanation?.trim()) candidates.push({ source: "explanation", sentence: firstResultSentence(fields.explanation), computedOnly: false });
  if (fields.hint?.trim()) candidates.push({ source: "hint", sentence: firstResultSentence(fields.hint), computedOnly: false });
  for (const candidate of candidates) {
    const found = valueFromSentence(candidate.sentence, allValues, candidate.computedOnly);
    if (found) return { value: found.value, source: candidate.source, sentence: candidate.sentence, computed: found.computed };
  }
  return null;
}

/**
 * Açıklamanın vardığı değer tam olarak BİR şıkta var ve o şık anahtarlı değilse çelişki. Değer hiçbir şıkta ya da
 * birden çok şıkta yoksa null (birim/ölçek farkı yanlış alarm vermez).
 */
export function explanationAnswerMismatch(fields: ConsistencyFields): AnswerMismatch | null {
  if (!fields.options.length || !fields.keyed.length) return null;
  const found = explanationFinalValue(fields);
  if (!found) return null;
  const indexes = optionValueIndexes(fields.options, found.value);
  if (indexes.length !== 1) return null;
  const expectedIndex = indexes[0]!;
  if (fields.keyed.includes(expectedIndex)) return null;
  return {
    value: found.value,
    expected: fields.options[expectedIndex]!,
    expectedIndex,
    keyed: fields.keyed.map((index) => fields.options[index] ?? "").filter(Boolean),
    source: found.source,
  };
}

/** Tek doğrulu çoktan seçmeli: `explanationAnswerMismatch`'in kısa yolu; anahtarsız ya da şıksız soruda null. */
export function mcqAnswerMismatch(check: {
  options?: readonly string[] | null;
  answerIndex?: number | null;
  explanation?: string | null;
  optionWhy?: readonly string[] | null;
  whyRight?: string | null;
  hint?: string | null;
  steps?: readonly string[] | null;
}): AnswerMismatch | null {
  const options = check.options ?? [];
  if (typeof check.answerIndex !== "number" || check.answerIndex < 0 || check.answerIndex >= options.length) return null;
  return explanationAnswerMismatch({
    options,
    keyed: [check.answerIndex],
    steps: check.steps,
    optionWhy: check.optionWhy,
    whyRight: check.whyRight,
    explanation: check.explanation,
    hint: check.hint,
  });
}

/* ───────────── Çok cevaplı: gerekçenin yönü ───────────── */

const AFFIRM_OPENER = /^\s*(?:doğru|evet|geçerli)\b/iu;
const REFUTE_OPENER = /^\s*(?:yanlış|hatalı|çeldirici|doğru değil|geçersiz)\b/iu;
/** Şıkkın ifadesi hakkında yargı: olgu olarak olumsuz bir içerik ("çekirdek bulunmaz") sayılmaz. */
const REFUTE_TAIL = /(?:^|[^\p{L}])(?:değil(?:dir)?|yanlış(?:tır)?|geçersiz(?:dir)?|doğru değil(?:dir)?|geçerli değil(?:dir)?|uymaz|sağlamaz|söylenemez|ait değil(?:dir)?)[\s.!]*$/iu;
const DOUBLE_NEGATIVE_TAIL = /(?:yanlış|hatalı)\s+değil(?:dir)?[\s.!]*$/iu;
const AFFIRM_TAIL = /(?:^|[^\p{L}])(?:doğrudur|doğru(?: bir)? ifadedir|geçerlidir)[\s.!]*$/iu;

/** Gerekçe şıkkı çürütüyor mu ("… değildir", "Yanlış: …"). */
export function reasonRefutes(reason: string | null | undefined): boolean {
  const sentence = firstResultSentence(reason ?? "");
  if (!sentence) return false;
  const lower = fold(sentence);
  if (AFFIRM_OPENER.test(lower)) return false;
  if (REFUTE_OPENER.test(lower)) return true;
  if (DOUBLE_NEGATIVE_TAIL.test(lower)) return false;
  return REFUTE_TAIL.test(lower);
}

/** Gerekçe şıkkı onaylıyor mu ("Doğru: …", "… doğrudur"). */
export function reasonAffirms(reason: string | null | undefined): boolean {
  const sentence = firstResultSentence(reason ?? "");
  if (!sentence) return false;
  const lower = fold(sentence);
  if (REFUTE_OPENER.test(lower)) return false;
  if (AFFIRM_OPENER.test(lower)) return true;
  if (DOUBLE_NEGATIVE_TAIL.test(lower)) return true;
  return AFFIRM_TAIL.test(lower);
}

type PolarityQuestion = { options: readonly string[]; correct: readonly string[]; optionWhy?: readonly string[] | null };

/** Çok cevaplıda doğru işaretli ama gerekçesi kendisini çürüten şıklar. */
export function refutedCorrectOptions(question: PolarityQuestion): string[] {
  const why = question.optionWhy ?? [];
  if (why.length !== question.options.length) return [];
  return question.options.filter((option, index) => question.correct.includes(option) && reasonRefutes(why[index]));
}

/** Çok cevaplıda doğru dışında bırakılmış ama gerekçesi kendisini onaylayan şıklar. */
export function affirmedWrongOptions(question: PolarityQuestion): string[] {
  const why = question.optionWhy ?? [];
  if (why.length !== question.options.length) return [];
  return question.options.filter((option, index) => !question.correct.includes(option) && reasonAffirms(why[index]));
}

/* ───────────── Kök kendi içinde tam mı ───────────── */

export type InlineCarrier = "equation" | "arrow" | "coordinates" | "table_row" | "data_list";
/** Ekranda duran ve atfı karşılayan bloklar. */
export const CARRIER_BLOCK_TYPES: ReadonlySet<string> = new Set(["table", "diagram", "diagram_card", "formula"]);

/** Kökte (ya da verilen metinde) veriyi taşıyan biçimler: eşitlik, ok, koordinat çifti, tablo satırı, sayı listesi. */
export function inlineCarriers(text: string): InlineCarrier[] {
  const out: InlineCarrier[] = [];
  if (/[\p{L}\p{N})\]°%]\s*=\s*[-−(\p{L}\p{N}√]/u.test(text) || /\d\s*[<>≤≥≈]\s*-?\d/u.test(text)) out.push("equation");
  if (/→|⇒|↔|->|=>/.test(text)) out.push("arrow");
  if (/\(\s*-?\d+(?:[.,]\d+)?\s*[,;]\s*-?\d+(?:[.,]\d+)?\s*\)/.test(text)) out.push("coordinates");
  if (/\|[^|\n]+\|/.test(text) || /[^\t\n]+\t[^\t\n]+\t[^\t\n]+/.test(text)) out.push("table_row");
  if (/:\s*(?:[^.?!\n]*?\d){2}/.test(text) || /(?:-?\d+(?:[.,]\d+)?\s*[,;]\s*){2,}-?\d+/.test(text)) out.push("data_list");
  return out;
}

const TR_VISUAL = "(?:şekil|grafik|harita|tablo|şema|diyagram|görsel|resim|çizim)";
const EN_VISUAL = "(?:figure|graph|table|map|diagram|circuit|equation|image|picture|chart)s?";
/** "bu şekilde" (tarz), "periyodik tablo", "klinik tablo" görsel atfı değildir. */
const NOT_VISUAL =
  /(?:^|[^\p{L}])(?:bu|şu|ne|aynı|hangi|başka|farklı|doğru|uygun|iyi|bir|en)\s+şekil(?:de|dedir|deki)?(?![\p{L}])|(?:^|[^\p{L}])(?:periyodik|klinik|akut|kronik)\s+tablo\p{L}*/giu;

const VISUAL_PATTERNS: RegExp[] = [
  // "yukarıdaki tabloya göre", "verilen grafikte", "aşağıdaki şekilde", "gösterilen devrede", "derste verilen"
  new RegExp(
    `(?:^|[^\\p{L}])(?:yukarıdaki|aşağıdaki|yandaki|verilen|gösterilen|ekteki|ilişikteki)\\s+(?:\\p{L}+\\s+){0,2}?(?:${TR_VISUAL}|devre|denklem)\\p{L}{0,6}(?![\\p{L}])`,
    "iu",
  ),
  /(?:^|[^\p{L}])derste verilen(?![\p{L}])/iu,
  // "şekildeki", "haritadaki", "grafikteki", "tablodaki", "şemadaki", "görseldeki"
  new RegExp(`(?:^|[^\\p{L}])${TR_VISUAL}(?:lar|ler)?(?:[dt][ae]ki|[ıiuü]nd[ae]ki)(?![\\p{L}])`, "iu"),
  // "haritada işaretli", "grafikte görülen", "tabloda verilen", "şekilde gösterilen", "şemada yer alan"
  new RegExp(
    `(?:^|[^\\p{L}])${TR_VISUAL}(?:lar|ler)?(?:[dt][ae]|[ıiuü]nd[ae])\\s+(?:\\p{L}+\\s+){0,3}?(?:görülen|görüldüğü|gösterilen|verilen|işaretli|işaretlenen|işaretlenmiş|belirtilen|çizilen|okunan|yer alan)(?![\\p{L}])`,
    "iu",
  ),
  // "tabloya göre", "grafiğe göre", "şemaya göre"
  new RegExp(`(?:^|[^\\p{L}])(?:${TR_VISUAL}|grafiğ|şekl)(?:lar|ler)?(?:[yn]?[ae]|[ıiuü]n[ae])\\s+göre(?![\\p{L}])`, "iu"),
  // İngilizce: "the figure above", "in the given table", "figure 2"
  new RegExp(`(?:^|[^\\p{L}])(?:${EN_VISUAL})\\s+(?:above|below|shown|given)(?![\\p{L}])`, "iu"),
  new RegExp(`(?:^|[^\\p{L}])(?:above|below|given|shown)\\s+(?:\\p{L}+\\s+){0,2}?(?:${EN_VISUAL})(?![\\p{L}])`, "iu"),
  new RegExp(`(?:^|[^\\p{L}])(?:${TR_VISUAL}|devre|denklem|${EN_VISUAL})\\s*\\d+(?![\\p{L}\\d])`, "iu"),
];

/**
 * Kök ekranda olmayan bir görsele gönderme yapıyor ve veri ne kökte ne ekranda: atfın metni döner; çözülüyorsa null.
 * `carriers`: ekrandaki blok türleri (`CARRIER_BLOCK_TYPES`) ve/veya `inlineCarriers` çıktısı.
 */
export function unresolvedVisualReference(text: string, carriers: readonly string[] = []): string | null {
  const cleaned = (text ?? "").replace(NOT_VISUAL, " ");
  if (!cleaned.trim()) return null;
  let hit: string | null = null;
  for (const pattern of VISUAL_PATTERNS) {
    const match = pattern.exec(cleaned);
    if (match) {
      hit = match[0].trim().replace(/^[^\p{L}]+/u, "");
      break;
    }
  }
  if (!hit) return null;
  if (carriers.some((carrier) => CARRIER_BLOCK_TYPES.has(carrier))) return null;
  if (carriers.some((carrier) => carrier === "equation" || carrier === "arrow" || carrier === "coordinates" || carrier === "table_row" || carrier === "data_list")) {
    return null;
  }
  return hit;
}
