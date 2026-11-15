import type { LessonBlock, LessonV3 } from "@/lib/learning/lesson-v3";
import { formulaRelationKeys } from "@/lib/text/math-normalize";
import { unresolvedVisualReference } from "@/lib/learning/answer-consistency";

/**
 * Sınav sabahı kâğıdı (31 Ekim 2026, Paket J3 #14, ürün sahibinin isteği): hazırlığın kayıtlı derslerinden,
 * öğretmen analizinin "Sınavda sorulur" maddelerinden ve öğrencinin en çok yanıldığı noktalardan tek sayfalık
 * son tekrar. **Model çağrısı yok**: her satır zaten kayıtlı ve denetlenmiş bir içeriğin kopyası; kod metin yazmaz,
 * yalnız seçer, tekrarı atar ve kırpar. Konular yolun sırasıyla; kâğıt yazdırılınca yaklaşık bir A4 sayfasına
 * sığsın diye sayı sınırlı (`CRAM_LIMITS`). Yükleyici `cram-sheet-load.ts`; bu dosya saf (istemci de okur).
 */

export const CRAM_SHEET_TITLE = "⚡ Sınav Sabahı 15 Dakikalık Son Tekrar & Formül Kağıdı";
/** Kısa ad: Plus kapısının cümlesi ve rozetin okunuşu (11 Kasım 2026: kâğıt ücretsiz hesapta açılmaz). */
export const CRAM_SHEET_NAME = "Sınav sabahı kâğıdı";
export const CRAM_PRINT_LABEL = "Yazdır / PDF olarak kaydet";
export const CRAM_EMPTY_TEXT =
  "Önce birkaç ders bitir: formüller, sınav tuzakları, hafıza çivileri ve en çok yanıldığın noktalar burada tek sayfada toplanır.";
export const CRAM_WEAK_HEADING = "🎯 En çok yanıldığın noktalar";

export function examPrepCramSheetHref(prepId: string): string {
  return `/deneme-sinavlari/${prepId}/sinav-sabahi`;
}

export type CramKind =
  | "formula"
  | "teacher"
  | "exam"
  | "trap"
  | "mnemonic"
  | "hook"
  | "remember"
  | "warn"
  | "definition"
  | "point"
  | "procedure";

/** Kâğıtta satırın önündeki küçük etiket. */
export const CRAM_KIND_LABEL: Record<CramKind, string> = {
  formula: "Formül",
  teacher: "Hoca uyarısı",
  exam: "Sınav ipucu",
  trap: "Sınav tuzağı",
  mnemonic: "Ezber kodu",
  hook: "Hafıza çivisi",
  remember: "Akılda tut",
  warn: "Dikkat",
  definition: "Tanım",
  point: "Sınavda sorulur",
  procedure: "Adımlar",
};

/** Konunun payı dolunca önce bunlar kalır: formül ve sınav ipucu, sonra tuzak ve hafıza, en son adım listesi. */
const KIND_ORDER: readonly CramKind[] = [
  "formula",
  "teacher",
  "exam",
  "trap",
  "mnemonic",
  "hook",
  "remember",
  "warn",
  "definition",
  "point",
  "procedure",
];

/** Filtre çiplerinde "Sınav tuzakları" altında görünen türler (15 Kasım 2026). */
export const CRAM_TRAP_KINDS: ReadonlySet<CramKind> = new Set<CramKind>(["trap", "warn", "teacher"]);

export const CRAM_LIMITS = {
  /** Bütün konuların toplam satırı (iki sütunlu A4). */
  total: 36,
  perTopicMax: 6,
  perTopicMin: 2,
  weakSpots: 8,
  focusTopics: 3,
  /** Tam cümleyle biten satırın üst sınırı (15 Kasım 2026'dan beri satır cümle ortasında kesilmez). */
  text: 220,
  /** Tuzak satırı iki parçalıdır ("Sakın … · Doğrusu …"); ikisi birlikte kalır. */
  trap: 320,
  /** Formül özeti en çok bu kadar formül. */
  formulas: 18,
  /** Notun kendi kuralları ("Hoca uyarısı"). */
  teacherRules: 6,
  title: 70,
} as const;

export type CramItem = { kind: CramKind; title: string | null; text: string };
/**
 * Bölüm rozeti: `low` = ölçülmüş ve %75'in altında ("Zayıf · %X"), `wrongs` = başarısı yeterli ama açık
 * yanlışı / yanılgısı var ("Dikkat · N açık yanlış"). Yüzde yalnız `low`da yazılır (6 Kasım 2026: %100 ölçülen
 * konu açık bir yanılgısı yüzünden "Zayıf · %100" diye çıkıyordu).
 */
export type CramWeakReason = "low" | "wrongs";
export type CramSection = {
  topic: string;
  percent: number | null;
  weak: boolean;
  reason: CramWeakReason | null;
  openWrongs: number;
  items: CramItem[];
};
export type CramWeakSpot = { text: string; topic: string | null };
export type CramFocusTopic = { label: string; percent: number | null; openWrongs?: number; reason?: CramWeakReason };

/** Bu yüzdenin altındaki ölçülmüş konu zayıftır (hedef puandan bağımsız sabit taban). */
export const CRAM_WEAK_BELOW = 75;

/** Konu gerçekten dikkat istiyor mu: ölçülmüş ve %75'in altında ya da açık yanlışı var. Değilse null. */
export function cramWeakReason(topic: { percent: number | null; openWrongs?: number | null }): CramWeakReason | null {
  if (topic.percent != null && topic.percent < CRAM_WEAK_BELOW) return "low";
  if ((topic.openWrongs ?? 0) > 0) return "wrongs";
  return null;
}

/** "Önce bunlara bak" satırındaki konunun notu: "%40" ya da "2 açık yanlış". */
export function cramFocusNote(topic: CramFocusTopic): string | null {
  if (topic.reason === "low" && topic.percent != null) return `%${topic.percent}`;
  if (topic.reason === "wrongs" && (topic.openWrongs ?? 0) > 0) return `${topic.openWrongs} açık yanlış`;
  return null;
}

/** Bölüm başlığındaki rozet; zayıf değilse null. */
export function cramSectionBadge(section: Pick<CramSection, "reason" | "percent" | "openWrongs">): string | null {
  if (section.reason === "low") return section.percent != null ? `Zayıf · %${section.percent}` : "Zayıf";
  if (section.reason === "wrongs") return `Dikkat · ${section.openWrongs} açık yanlış`;
  return null;
}

/** Formül özetinin satırı: hangi konudan geldiği yazılır. */
export type CramFormula = { topic: string; title: string | null; text: string };

export type CramSheet = {
  sections: CramSection[];
  weakSpots: CramWeakSpot[];
  focusTopics: CramFocusTopic[];
  /** Hazırlığın bütün formülleri, kâğıdın başında toplu (15 Kasım 2026). Bölümlerde de geçer. */
  formulas: CramFormula[];
  /** Notun kendi kuralları ("… alınız", "… kabul edilir"): kâğıdın başında "Hoca uyarısı" (15 Kasım 2026). */
  teacherRules: string[];
  itemCount: number;
  empty: boolean;
};

export type CramSheetInput = {
  /** Yolun sırasıyla konular; `key` derslerin ve maddelerin bağlandığı anahtar. */
  topics: readonly { key: string; label: string }[];
  /** Kayıtlı dersler (eskiden yeniye). `topicKey` yoksa ya da hiçbir konuya uymuyorsa dersin adıyla ayrı bölüm. */
  lessons: readonly { topicKey: string | null; lesson: LessonV3 }[];
  examPoints?: readonly { topicKey: string; points: readonly string[] }[];
  /** Öncelik sırasıyla (en çok yanılınan önce). Metin kavramsal derstir (`missLesson`), soru kökü değil. */
  weakSpots?: readonly CramWeakSpot[];
  /** En zayıf konular (tek seçici `rankFinalStepTopics`). */
  focusTopics?: readonly CramFocusTopic[];
  /** Notun kendi kural satırları (`loadSourceRules`). */
  teacherRules?: readonly string[];
};

/** Öğretmen analizinin "Sınavda sorulur" maddesi kayıtta bu uzunlukta kesilir (`teacher-brain.ts` textList). */
export const EXAM_POINT_STORED_MAX = 220;

const SENTENCE_END = /[.!?](?=\s|$)/g;
const CLAUSE_END = /\s(?:·|;|–|—)\s|;\s/g;
const ENDS_WHOLE = /[.!?)\]»"”']$/u;
const CUT_MARK = /\s*(?:\.\.\.|…)$/u;

/**
 * `max` içindeki son sınır (`pattern`). Sonuç en az 25 karakter; `minRatio` verilirse sınırın o kadarı da (uzun metnin
 * ilk birkaç sözcüğü tek başına satır olmasın). Kayıtta kesilmiş metinde oran yok: tam cümle ne kadarsa o kalır.
 */
function lastBoundary(text: string, max: number, pattern: RegExp, keepMark: boolean, minRatio = 0.35): string | null {
  const window = text.slice(0, max);
  let end = -1;
  for (const match of window.matchAll(pattern)) {
    end = keepMark ? match.index! + match[0].length : match.index!;
  }
  if (end < 0) return null;
  const cut = window.slice(0, end).trim();
  return cut.length >= Math.max(25, Math.min(max, text.length) * minRatio) ? cut : null;
}

/**
 * Kâğıt satırı TAM biter (15 Kasım 2026, ürün sahibi: "her madde tam cümle olarak bitsin"). Canlıda satırlar kelime
 * ortasında kesiliyordu ("…daha büyük olduğ"): öğretmen analizinin maddesi kayıtta 220 karakterde kesilmiş, kâğıt da
 * 170'te "…" ile kesiyordu. Şimdi:
 * - kayıtta kesilmiş metin (sonu "…"/"..." ya da `storedMax` uzunluğunda ve cümle sonu yok) son tam cümlesine çekilir;
 *   tam cümle yoksa satır hiç basılmaz;
 * - sınırı aşan metin son cümle (yoksa son yan cümle: "·", ";") sınırında biter; o da yoksa satır basılmaz.
 * Kod cümle yazmaz, yalnız keser ya da atar.
 */
export function fitCramText(text: string, options: { max?: number; storedMax?: number } = {}): string | null {
  const max = options.max ?? CRAM_LIMITS.text;
  const value = clean(text);
  if (value.length < 2) return null;
  const cutInStore =
    CUT_MARK.test(value) || (options.storedMax != null && value.length >= options.storedMax - 4 && !ENDS_WHOLE.test(value));
  if (cutInStore) {
    const body = value.replace(CUT_MARK, "");
    return lastBoundary(body, Math.min(max, body.length), SENTENCE_END, true, 0);
  }
  if (value.length <= max) return value;
  return lastBoundary(value, max, SENTENCE_END, true) ?? lastBoundary(value, max, CLAUSE_END, false);
}

const FORMULA_SHAPE = /\$[^$]+\$|[\p{L}\p{N})\]²³]\s*(?:=|≈|∝)\s*[\p{L}\p{N}(√±\-−]/u;
const WARN_CUE = /(?<![\p{L}])(?:dikkat\p{L}*|karıştır\p{L}*|sanıl\p{L}*|unutma\p{L}*|tuzak\p{L}*|asla|yanılg\p{L}*|hata\p{L}*)(?![\p{L}])/iu;
const DEFINITION_CUE = /(?<![\p{L}])(?:denir|adı verilir|olarak tanımlanır|tanımlanır)(?![\p{L}])/iu;

/**
 * "Sınavda sorulur" maddesinin türü (15 Kasım 2026, ürün sahibi: 32 maddenin 29'u aynı etiketi taşıyordu). Kod metne
 * dokunmaz; yalnız biçiminden okur: eşitlik/formül → Formül, uyarı sözcüğü → Dikkat, tanım kalıbı → Tanım.
 */
export function classifyPoint(text: string): CramKind {
  if (FORMULA_SHAPE.test(text)) return "formula";
  if (WARN_CUE.test(text)) return "warn";
  if (DEFINITION_CUE.test(text)) return "definition";
  return "point";
}

/** Şekil, tablo ya da şıkka bağlı soru kökü: kâğıtta tek başına anlamsız (15 Kasım 2026). */
const BOUND_PATTERNS: RegExp[] = [
  /\?/u,
  /(?:\.\.\.|…|_{2,})/u,
  // Öncül numarası: "III numaralı", "I. ve II.", "II ve III"
  /(?<![\p{L}])(?:I{1,3}|IV|VI{0,3})(?:\s*numaral\p{L}*|\s*nolu|\s+(?:ve|ile)\s+(?:I{1,3}|IV|VI{0,3})(?![\p{L}.]))/u,
  // Harfle adlandırılmış noktalar: "K, L ve M noktaları", "X noktası"
  /(?<![\p{L}])\p{Lu}(?:\s*(?:,|ve)\s*\p{Lu})*\s+noktas?\p{L}*/u,
  // Soru dili ve şık/seçenek gönderimi
  /(?<![\p{L}])(?:hangisi\p{L}*|hangileri\p{L}*|kaçtır|kaçıncı\p{L}*|buna göre|doğru cevap|yanlış cevap|seçenek\p{L}*|şıkk?\p{L}*)(?![\p{L}])/iu,
  /(?<![\p{L}])[A-E]\)|(?<![\p{L}])[A-E]\s+şıkk\p{L}*/u,
];

export function questionBound(text: string): boolean {
  const value = clean(text);
  if (!value) return true;
  if (BOUND_PATTERNS.some((pattern) => pattern.test(value))) return true;
  return unresolvedVisualReference(value) != null;
}

function sentencesOf(text: string): string[] {
  return clean(text)
    .split(/(?<=[.!?])\s+(?=\p{Lu}|\d)/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Yanlıştan çıkan kavramsal ders (15 Kasım 2026, ürün sahibi: "test sorusu köklerini kural yapma"). Kâğıda soru kökü
 * basılmaz; sorunun açıklamasındaki ilk bağımsız cümle (şekle, öncül numarasına ya da şıkka bağlı olmayan, 25-220
 * karakter) basılır. Doğru/yanlışta yanlış önermenin doğru hâli zaten bir kuraldır. Kart (ön/arka) kavramdır. Hiçbiri
 * yoksa satır yok: kod yeni cümle yazmaz.
 */
export function missLesson(input: {
  mode?: unknown;
  prompt?: unknown;
  explanation?: unknown;
  corrected?: unknown;
  trueFalse?: unknown;
  front?: unknown;
  back?: unknown;
}): string | null {
  if (input.mode === "recall") {
    const front = clean(input.front);
    const back = clean(input.back);
    if (!front || !back) return null;
    if (back.length >= 25 && !questionBound(back)) return fitCramText(back);
    return questionBound(front) ? null : fitCramText(`${front} → ${back}`);
  }
  const corrected = clean(input.corrected);
  if (input.trueFalse === true && corrected && !questionBound(corrected)) return fitCramText(corrected);
  for (const sentence of sentencesOf(String(input.explanation ?? "")).slice(0, 4)) {
    if (sentence.length < 25 || sentence.length > CRAM_LIMITS.text) continue;
    if (!ENDS_WHOLE.test(sentence) || questionBound(sentence)) continue;
    return sentence;
  }
  return null;
}

/** WhatsApp metni (15 Kasım 2026): bağlantı hazırlığın davetidir; arkadaş aynı konu sırasıyla kendi kopyasını alır. */
export function cramShareText(title: string | null | undefined): string {
  const name = clean(title) || "Sınav hazırlığı";
  return `⚡ “${name}” sınavına Cortex Plus'la hazırlanıyorum; sınav sabahı kâğıdımı da oradan çıkardım. Aynı hazırlığa katıl, aynı konu sırasıyla birlikte çalışalım:`;
}

export const CRAM_SIGNATURE = "Cortex Plus · cortexplus.app";

/**
 * Formül satırının çizimi: dersteki formül bloğu TeX olarak saklanır ("A = B \cdot C"); `$…$` içinde değilse kâğıtta ham
 * görünüyordu (15 Kasım 2026, fikstürde görüldü). Yalnız TeX işareti taşıyan ifade sarılır; düz yazılı madde aynen.
 */
export function cramFormulaMarkup(text: string): string {
  if (text.includes("$")) return text;
  const [expression, ...rest] = text.split(" — ");
  if (!/\\[a-zA-Z]+|[\^_]\{/.test(expression ?? "")) return text;
  return [`$${expression}$`, ...rest].join(" — ");
}

const clean = (value: unknown): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

/**
 * Eski "…" ile kırpma sınırı. 15 Kasım 2026'dan beri kâğıt satırları `fitCramText` ile tam cümlede biter; bu iki
 * yardımcı yalnız başlık kırpmasında ve eski çağıranlarda.
 */
const LEGACY_CLIP = 170;

/** Tekrar anahtarı: vurgu ve matematik işaretleri, noktalama ve büyük harf yok sayılır. */
export function cramKey(text: string): string {
  return text
    .replace(/\*\*|==|\$/g, " ")
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}=+\-*/^<>≤≥≠%]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Uzun metni kelime sınırında kırpar. Kırpılan yerde açık kalan `$…$` matematiği ve `**`/`==` vurgusu
 * yarım bırakılmaz (yarım işaret ekranda ham karakter olarak görünürdü).
 */
export function clipCramText(text: string, max: number = LEGACY_CLIP): string {
  const value = clean(text);
  if (value.length <= max) return value;
  let cut = value.slice(0, max);
  const space = cut.lastIndexOf(" ");
  if (space > max * 0.6) cut = cut.slice(0, space);
  if ((cut.match(/\$/g)?.length ?? 0) % 2 === 1) cut = cut.slice(0, cut.lastIndexOf("$"));
  for (const mark of ["**", "=="]) {
    if (cut.split(mark).length % 2 === 0) cut = cut.slice(0, cut.lastIndexOf(mark));
  }
  return `${cut.replace(/[\s,;:.–-]+$/u, "")}…`;
}

/**
 * Zayıf nokta satırını kırparken düzeltme kısmı korunur (31 Ekim 2026): uzun soru metni sınırı
 * doldurunca "→ Doğrusu: …" kesilip "→ Doğru" gibi yarım kalıyordu. Kırpılan soru tarafıdır.
 */
export function clipWeakSpotText(text: string, max: number = LEGACY_CLIP): string {
  const value = clean(text);
  if (value.length <= max) return value;
  // Düzeltmenin kendisi "a → b → c" zinciri olabilir; ayrım ilk "→ Doğrusu:" (yoksa ilk "→") noktasından yapılır.
  const marked = value.indexOf(" → Doğrusu: ");
  const at = marked > 0 ? marked : value.indexOf(" → ");
  if (at <= 0) return clipCramText(value, max);
  const correction = value.slice(at + 3);
  // Kısa düzeltme hep tam gösterilir; uzunsa ancak tam bir zincir halkasında / cümlede / kelimede biter.
  const tail = correction.length <= WEAK_SPOT_CORRECTION_MAX ? correction : clipAtBoundary(correction, WEAK_SPOT_CORRECTION_MAX);
  const head = clipCramText(value.slice(0, at), Math.max(40, max - tail.length - 3));
  return `${head} → ${tail}`;
}

/** Zayıf nokta düzeltmesinin tam gösterildiği üst sınır (karakter). */
export const WEAK_SPOT_CORRECTION_MAX = 120;

/** Metni sınırdan önceki son temiz noktada keser: zincir halkası ("→"), cümle, virgül, kelime; sona tek "…". */
function clipAtBoundary(text: string, max: number): string {
  const window = text.slice(0, max);
  for (const pattern of [/ → /g, /[.!?] /g, /[,;] /g, / /g]) {
    let last = -1;
    for (const match of window.matchAll(pattern)) last = match.index! + (pattern.source === " → " ? 0 : 1);
    if (last > max * 0.4) return `${window.slice(0, last).replace(/[\s,;:→–-]+$/u, "")} …`;
  }
  return clipCramText(text, max);
}

function item(kind: CramKind, title: unknown, text: unknown): CramItem | null {
  const body = clean(text);
  if (body.length < 2) return null;
  // Ders notunun başlığı çoğu zaman türün adıyla başlıyor ("Sınav ipucu: Terim A ile Terim B"); kâğıtta tür zaten
  // etiket olarak duruyor, başlık onu ikinci kez yazmasın (31 Ekim 2026 canlı deneme: "Sınav ipucu Sınav ipucu: …").
  const label = CRAM_KIND_LABEL[kind].toLocaleLowerCase("tr-TR");
  let head = clean(title);
  if (head.toLocaleLowerCase("tr-TR").startsWith(label)) head = head.slice(label.length).replace(/^[\s:·–-]+/u, "");
  return { kind, title: head ? clipCramText(head, CRAM_LIMITS.title) : null, text: body };
}

function blockItems(block: LessonBlock, fallbackTitle: string): CramItem[] {
  switch (block.type) {
    case "formula": {
      const symbols = block.formula.symbols?.length
        ? block.formula.symbols.map((entry) => `${entry.symbol}: ${entry.meaning}`).join("; ")
        : clean(block.formula.note);
      const row = item("formula", block.formula.title, block.formula.expression);
      return row ? [{ ...row, text: symbols ? `${row.text} — ${symbols}` : row.text }] : [];
    }
    case "procedure": {
      const steps = block.procedure.steps.map((step) => clean(step.label)).filter(Boolean);
      const row = steps.length >= 2 ? item("procedure", block.procedure.title ?? fallbackTitle, steps.join(" → ")) : null;
      return row ? [row] : [];
    }
    case "note": {
      const tone = block.note.tone;
      const kind: CramKind | null =
        tone === "exam" ? "exam" : tone === "remember" ? "remember" : tone === "mnemonic" ? "mnemonic" : tone === "warn" ? "warn" : null;
      // Genel bilgi, birim ve düz bilgi kutusu sabah kâğıdına girmez: kâğıt sınavın vurduğu yeri taşır.
      const row = kind ? item(kind, block.note.title, block.note.body) : null;
      return row ? [row] : [];
    }
    case "exam_trap_card": {
      const { title, wrong, right } = block.trap;
      const row = item("trap", title, `Sakın: ${clean(wrong)} · Doğrusu: ${clean(right)}`);
      return row ? [row] : [];
    }
    case "memory_hook_card": {
      const row = item("hook", block.hook.title, block.hook.body);
      return row ? [row] : [];
    }
    default:
      return [];
  }
}

/** Bir dersin kâğıda girebilecek satırları (ekran sırasıyla) ve dersin "sık yapılan hata"sı. */
export function collectLessonCram(lesson: LessonV3): CramItem[] {
  const rows: CramItem[] = [];
  for (const screen of lesson.screens) {
    const fallback = clean(screen.concept) || clean(screen.heading);
    for (const block of screen.blocks) rows.push(...blockItems(block, fallback));
  }
  if (lesson.commonMistake) {
    const row = item(
      "trap",
      "Sık yapılan hata",
      `Sakın: ${clean(lesson.commonMistake.claim)} · Doğrusu: ${clean(lesson.commonMistake.correction)}`,
    );
    if (row) rows.push(row);
  }
  return rows;
}

function rankOf(kind: CramKind): number {
  const index = KIND_ORDER.indexOf(kind);
  return index < 0 ? KIND_ORDER.length : index;
}

type Bucket = { topic: string; key: string | null; candidates: CramItem[] };

/**
 * Aynı satır iki kez yazılmaz: birebir anahtar ya da ilk 60 karakteri aynı. Formülde anahtar matematiksel
 * normalizasyondan (6 Kasım 2026): `×` / `·`, `ₖ` / `k` / `_k`, boşluk ve büyük harf aynı formülü iki kez
 * yazdırıyordu. Satır birden çok bağıntı taşıyorsa her biri ayrı anahtar; bütün bağıntıları zaten kâğıtta olan
 * formül satırı düşer, yeni bağıntı getiren kalır.
 */
/** Kök kümesi (4+ harfli sözcüklerin ilk 5 harfi): aynı bilginin başka sözcüklerle yazılışını yakalar. */
function stemSet(text: string): Set<string> {
  return new Set(
    cramKey(text.replace(/(?:Sakın|Doğrusu)\s*:/gu, " "))
      .split(" ")
      .filter((word) => word.length >= 4)
      .map((word) => word.slice(0, 5)),
  );
}

/** Ortak kök / bütün kökler (Jaccard). Tek sözcükle ayrılan iki ayrı bilgi ("Birinci …" / "İkinci …") ayrı kalır. */
function overlap(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / Math.max(1, a.size + b.size - shared);
}

/** İki satır aynı bilgiyi mi taşıyor (15 Kasım 2026: aynı tuzak başka sözcüklerle iki kez basılıyordu). */
const NEAR_SAME = 0.75;

function makeDeduper() {
  const seen = new Set<string>();
  const prefixes = new Set<string>();
  const relations = new Set<string>();
  const stems: { set: Set<string>; digits: string }[] = [];
  const near = (text: string): boolean => {
    const set = stemSet(text);
    if (set.size < 4) return false;
    // Sayısı farklı satır ayrı bilgidir ("10 m'de 1 atm" ile "20 m'de 2 atm").
    const digits = (text.match(/\d+/g) ?? []).join(",");
    if (stems.some((have) => have.digits === digits && have.set.size >= 4 && overlap(set, have.set) >= NEAR_SAME)) return true;
    stems.push({ set, digits });
    return false;
  };
  return (row: { kind?: CramKind; text: string }): boolean => {
    const base = cramKey(row.text);
    if (!base) return false;
    if (row.kind === "formula") {
      const keys = formulaRelationKeys(row.text.split(" — ")[0] ?? row.text);
      if (keys.length) {
        if (keys.every((key) => relations.has(key))) return false;
        for (const key of keys) relations.add(key);
        return true;
      }
    }
    const key = row.kind === "formula" ? `f:${cramKey(row.text.split(" — ")[0] ?? row.text)}` : base;
    const prefix = base.length >= 40 ? base.slice(0, 60) : null;
    if (seen.has(key) || (prefix && prefixes.has(prefix))) return false;
    if (row.kind !== "formula" && near(row.text)) return false;
    seen.add(key);
    if (prefix) prefixes.add(prefix);
    return true;
  };
}

/** Türüne göre tam biten satır; sığmıyorsa null. */
function fitItem(row: CramItem, storedMax?: number): CramItem | null {
  const text = fitCramText(row.text, { max: row.kind === "trap" ? CRAM_LIMITS.trap : CRAM_LIMITS.text, storedMax });
  return text ? { ...row, text } : null;
}

/**
 * Kâğıdı kurar. Her konu önce adil payını alır (toplam ÷ konu, 2 ile 6 arası); kalan yer yolun sırasıyla
 * dolar. Bölümde satırlar türe göre (formül önce), türün içinde dersteki sırayla.
 */
export function buildCramSheet(input: CramSheetInput): CramSheet {
  const fresh = makeDeduper();
  const buckets: Bucket[] = input.topics.map((topic) => ({ topic: clean(topic.label), key: topic.key, candidates: [] }));
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket] as const));
  const extra = new Map<string, Bucket>();

  for (const { topicKey, lesson } of input.lessons) {
    let bucket = topicKey ? byKey.get(topicKey) : undefined;
    if (!bucket) {
      const name = clean(lesson.title) || "Diğer";
      bucket = extra.get(name.toLocaleLowerCase("tr"));
      if (!bucket) {
        bucket = { topic: name, key: null, candidates: [] };
        extra.set(name.toLocaleLowerCase("tr"), bucket);
      }
    }
    for (const row of collectLessonCram(lesson)) {
      const fitted = fitItem(row);
      if (fitted) bucket.candidates.push(fitted);
    }
  }
  for (const { topicKey, points } of input.examPoints ?? []) {
    const bucket = byKey.get(topicKey);
    if (!bucket) continue;
    for (const point of points) {
      // Madde kayıtta 220 karakterde kesilmiş olabilir: son tam cümlesine çekilir, yoksa basılmaz.
      const row = item(classifyPoint(point), null, point);
      const fitted = row ? fitItem(row, EXAM_POINT_STORED_MAX) : null;
      if (fitted) bucket.candidates.push(fitted);
    }
  }

  const ordered = [...buckets, ...extra.values()];
  // Tekrarı baştan at: aynı formül iki konuda varsa yolun ilk konusunda kalır.
  for (const bucket of ordered) {
    bucket.candidates = bucket.candidates
      .map((row, index) => ({ row, index }))
      .sort((a, b) => rankOf(a.row.kind) - rankOf(b.row.kind) || a.index - b.index)
      .map(({ row }) => row)
      .filter((row) => fresh(row));
  }

  const filled = ordered.filter((bucket) => bucket.candidates.length > 0);
  const share = Math.max(
    CRAM_LIMITS.perTopicMin,
    Math.min(CRAM_LIMITS.perTopicMax, Math.floor(CRAM_LIMITS.total / Math.max(1, filled.length))),
  );
  const taken = new Map<Bucket, number>();
  let budget: number = CRAM_LIMITS.total;
  for (const bucket of filled) {
    const count = Math.min(share, bucket.candidates.length, budget);
    taken.set(bucket, count);
    budget -= count;
  }
  for (const bucket of filled) {
    if (budget <= 0) break;
    const now = taken.get(bucket) ?? 0;
    const more = Math.min(CRAM_LIMITS.perTopicMax - now, bucket.candidates.length - now, budget);
    if (more > 0) {
      taken.set(bucket, now + more);
      budget -= more;
    }
  }

  // Yalnız gerçekten dikkat isteyen konu (6 Kasım 2026): ölçülmüş ve %75'in altında ya da açık yanlışı var.
  const focusTopics: CramFocusTopic[] = [];
  for (const topic of input.focusTopics ?? []) {
    if (focusTopics.length >= CRAM_LIMITS.focusTopics) break;
    const label = clean(topic.label);
    const percent = topic.percent ?? null;
    const openWrongs = Math.max(0, Math.floor(topic.openWrongs ?? 0));
    const reason = label ? cramWeakReason({ percent, openWrongs }) : null;
    if (reason) focusTopics.push({ label, percent, openWrongs, reason });
  }
  const focusByKey = new Map(focusTopics.map((topic) => [topic.label.toLocaleLowerCase("tr"), topic] as const));

  const sections: CramSection[] = filled
    .map((bucket) => {
      const focus = focusByKey.get(bucket.topic.toLocaleLowerCase("tr"));
      return {
        topic: bucket.topic,
        percent: focus?.reason === "low" ? (focus.percent ?? null) : null,
        weak: Boolean(focus),
        reason: focus?.reason ?? null,
        openWrongs: focus?.openWrongs ?? 0,
        items: bucket.candidates.slice(0, taken.get(bucket) ?? 0),
      };
    })
    .filter((section) => section.items.length > 0);

  // Formül özeti (15 Kasım 2026): bölüme sığmayanlar dahil hazırlığın bütün formülleri, yolun sırasıyla.
  const formulas: CramFormula[] = filled
    .flatMap((bucket) =>
      bucket.candidates
        .filter((row) => row.kind === "formula")
        .map((row) => ({ topic: bucket.topic, title: row.title, text: row.text })),
    )
    .slice(0, CRAM_LIMITS.formulas);

  // Notun kendi kuralları: kâğıdın başında "Hoca uyarısı". Tam cümle değilse basılmaz.
  const freshRule = makeDeduper();
  const teacherRules: string[] = [];
  for (const rule of input.teacherRules ?? []) {
    if (teacherRules.length >= CRAM_LIMITS.teacherRules) break;
    const text = fitCramText(rule);
    if (text && freshRule({ text })) teacherRules.push(text);
  }

  // Yanıldığın noktalar: kavramsal ders (soru kökü değil). Şekle, öncüle ya da şıkka bağlı satır basılmaz.
  const freshSpot = makeDeduper();
  const weakSpots: CramWeakSpot[] = [];
  for (const spot of input.weakSpots ?? []) {
    if (weakSpots.length >= CRAM_LIMITS.weakSpots) break;
    const raw = clean(spot.text);
    if (raw.length < 4 || /(?:→|Doğrusu:)\s*$/u.test(raw) || questionBound(raw)) continue;
    const text = fitCramText(raw);
    if (!text || !freshSpot({ text })) continue;
    weakSpots.push({ text, topic: clean(spot.topic) || null });
  }

  const itemCount = sections.reduce((sum, section) => sum + section.items.length, 0);
  return {
    sections,
    weakSpots,
    focusTopics,
    formulas,
    teacherRules,
    itemCount,
    empty: itemCount === 0 && weakSpots.length === 0 && teacherRules.length === 0,
  };
}

/** Kayıtlı tekrar öğesinin kâğıt satırı: soru → doğrusu. Doğru/yanlışta yanlış önermenin doğru hâli. */
export function reviewItemCramText(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  if (row.mode === "recall") {
    const front = clean(row.front);
    const back = clean(row.back);
    return front && back ? `${front} → ${back}` : null;
  }
  const prompt = clean(row.prompt);
  if (!prompt) return null;
  const correct = Array.isArray(row.correct) ? row.correct.map(clean).filter(Boolean) : [];
  if (row.trueFalse === true) {
    const corrected = clean(row.corrected);
    if (corrected) return `${prompt} → Doğrusu: ${corrected}`;
    const verdict = trueFalseCorrection(correct[0]);
    return verdict ? `${prompt} → Doğrusu: ${verdict}` : null;
  }
  return withCorrection(prompt, correct.join(", "));
}

/** Yanlış defteri satırı: soru → doğru cevap. */
export function mistakeCramText(question: unknown, answer: unknown): string | null {
  const prompt = clean(question);
  const correct = clean(answer);
  if (!prompt) return null;
  return withCorrection(prompt, correct);
}

const TRUE_LABELS = new Set(["doğru", "d", "true", "t", "evet", "yes", "dogru"]);
const FALSE_LABELS = new Set(["yanlış", "y", "false", "f", "hayır", "no", "yanlis", "hayir"]);

/**
 * Doğru/yanlış anahtarını okunur düzeltmeye çevirir (31 Ekim 2026). Anahtar yalnız "Doğru"/"Yanlış"
 * etiketiyse "→ Doğru" diye çıplak kalıyordu; artık ifadenin doğru mu yanlış mı olduğu cümleyle yazılır.
 */
export function trueFalseCorrection(label: unknown): string | null {
  const key = clean(label).toLocaleLowerCase("tr").replace(/[.!)\s]+$/u, "").replace(/^[(\s]+/u, "");
  if (TRUE_LABELS.has(key)) return "Bu ifade doğrudur.";
  if (FALSE_LABELS.has(key)) return "Bu ifade yanlıştır.";
  return null;
}

/** "soru → Doğrusu: X"; X boşsa satır hiç çıkmaz, D/Y etiketiyse cümleye çevrilir. */
function withCorrection(prompt: string, answer: string): string | null {
  const correct = trueFalseCorrection(answer) ?? clean(answer);
  if (!correct || /^[→:·\-\s]*$/u.test(correct)) return null;
  return `${prompt} → Doğrusu: ${correct}`;
}
