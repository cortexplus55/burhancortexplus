import type { LessonBlock, LessonScreen } from "@/lib/learning/lesson-v3";
import { optionKey } from "@/lib/learning/question-integrity";
import { SAME_KIND_DISTRACTOR_RULE } from "@/lib/learning/teaching-rubric";

/**
 * Dersin hafif doğrulayıcısı (30 Ekim 2026, ürün sahibinin kararları: "bütün kavramlara uzat" ve "doğrulayıcı tekrar
 * bloğunu çıkarsın"). Testteki doğrulayıcının (`quiz-sanity.ts`) derse uzanmış hâli; "tek geçiş"in (26 Ekim) dersteki
 * bilinçli istisnası.
 *
 * Astra ile yan yana turda (aynı Makroekonomi notu, kör yargı) dersin öğrenci gözü Astra'nın gerisinde kaldı; iki
 * yargıç da aynı iki kusuru gösterdi: "hangi endeks ölçer?" sorusunun beş şıkkından üçü endeks değildi ve aynı ekranda
 * "%60'tan %40'a" örneği yedi kez (not, kaydırma, örnek vaka, çözümlü örnek, soru…) geçiyordu. Ders yolunda canlıda
 * yapı denetimi yok; kod işaretleri (`lessonTeachingFlags`) yalnız günlüğe yazıyordu.
 *
 * Her kavram yayımlanmadan önce tek hızlı çağrı:
 * - SORU: kavramın çoktan seçmeli sorularında uydurma terimi ve kökün sorduğu türle uymayan şıkkı aynı türden gerçek
 *   çeldiriciyle değiştirir, soruyu kendisi çözüp kesinse anahtarı düzeltir. Kök, şık sayısı ve sırası aynı kalır.
 * - TEKRAR: aynı ekranda aynı bilgiyi üçüncü kez veren kutuyu çıkarır. Yalnız süs kutuları çıkabilir (not, kart ızgarası,
 *   karşılaştırma kaydırması, akılda tutma ve sınav tuzağı kartı); metin, tablo, soru, formül, adım, şema ve çözümlü
 *   örnek hiç silinmez. "Neden böyle", "Genel bilgi", sınav ipucu, ezber kodu, uyarı ve "akılda tut" notları da kalır.
 *
 * Kod metin yazmaz: soru yamasının bütün alanları modelden gelir, eksik ya da tutarsız yama alınmaz. Süre aşılır ya da
 * çağrı düşerse kavram yazıldığı gibi yayımlanır.
 */

export const LESSON_SANITY_TIMEOUT_MS = 9_000;
export const LESSON_SANITY_SOURCE_CHARS = 7_000;
/** Bir ekrandan en çok bu kadar kutu çıkar: ekran boşalmasın. */
export const LESSON_SANITY_MAX_DROPS_PER_SCREEN = 3;

const REMOVABLE_TYPES = new Set<LessonBlock["type"]>([
  "note",
  "cards",
  "comparison_carousel",
  "memory_hook_card",
  "exam_trap_card",
]);
/** Kendine özgü bilgi taşıyan not tonları çıkmaz. */
const PROTECTED_NOTE_TONES = new Set(["general", "exam", "remember", "mnemonic", "warn"]);
const PROTECTED_NOTE_TITLE = /^\s*(neden böyle|genel bilgi)/i;

/** Bu kutu tekrar diye çıkarılabilir mi? */
export function removableBlock(block: LessonBlock): boolean {
  if (!REMOVABLE_TYPES.has(block.type)) return false;
  if (block.type !== "note") return true;
  const note = block.note;
  if (note.tone && PROTECTED_NOTE_TONES.has(note.tone)) return false;
  return !PROTECTED_NOTE_TITLE.test(note.title);
}

export function lessonSanitySystem(mode: "document" | "topic"): string {
  return (
    "Sen hızlı bir ders editörü-denetçisisin. Yazılmış ders ekranlarında yalnız iki iş yaparsın. Metin YAZMAZSIN, ekranı " +
    "ve soruyu SİLMEZSİN.\n" +
    "1) SORU: Çoktan seçmeli her soruda (varsa): bir şık gerçekte olmayan bir terimse (" +
    (mode === "document" ? "KAYNAKTA ve ders kitaplarında" : "ders kitaplarında") +
    " geçmeyen) ya da kökün sorduğu türden değilse ('hangi endeks', 'hangi evre', 'hangi kavram', 'kaç TL'), onu aynı " +
    "türden, öğrencinin gerçekten karıştırdığı gerçek bir çeldiriciyle değiştir. Soruyu anahtara bakmadan kendin çöz; kesin " +
    "olarak başka bir şık doğruysa anahtarı düzelt, emin değilsen dokunma. Kök değişmez; şık sayısı ve sırası aynı kalır; " +
    "değiştirdiğin şık doğru ya da başka bir şıkla eşdeğer olmaz. Kaynakta olmayan sayı, eşik ya da kural uydurma.\n" +
    `${SAME_KIND_DISTRACTOR_RULE}\n` +
    "2) TEKRAR: Aynı ekranda aynı bilgiyi ÜÇÜNCÜ kez (ya da daha fazla) veren kutuları bul. Yalnız [çıkarılabilir] diye " +
    "işaretli kutular çıkarılabilir; bilginin ilk iki verilişi kalır. Yeni bir şey öğreten kutu (başka örnek, başka ayrım, " +
    "başka sayı) tekrar değildir. Emin değilsen çıkarma.\n\n" +
    "Yalnız JSON. Değiştirdiğin her soru için bütün alanları yeniden yaz: options (aynı sayıda, aynı sırada), answerIndex " +
    "(doğru şıkkın 0'dan sıra numarası), optionWhy (her şık için bir cümle, aynı sırada), explanation (doğrunun nedeni; " +
    "şıklara harfle ya da sırayla gönderme yapma), why (neyi neden değiştirdin, kısa). Değişiklik yoksa boş listeler.\n" +
    '{"checks":[{"screen":0,"block":2,"options":["..."],"answerIndex":0,"optionWhy":["..."],"explanation":"...","why":"..."}],' +
    '"drop":[{"screen":0,"block":3,"why":"..."}]}'
  );
}

/** Kutunun isteme giden kısa hâli. */
function blockLine(block: LessonBlock): string {
  if (block.type === "check") {
    const check = block.check;
    const options = check.options?.map((option, index) => `${index}) ${option}`).join(" | ") ?? "";
    return `SORU (${check.type}): ${check.prompt}${options ? ` || ŞIKLAR: ${options}` : ""}${
      typeof check.answerIndex === "number" ? ` || ANAHTAR: ${check.answerIndex}` : ""
    }`;
  }
  const { type: _type, ...rest } = block as LessonBlock & Record<string, unknown>;
  void _type;
  return JSON.stringify(rest).slice(0, 600);
}

export function lessonSanityUserPrompt(input: {
  mode: "document" | "topic";
  topicLabel: string;
  source: string;
  screens: readonly LessonScreen[];
}): string {
  const source =
    input.mode === "document"
      ? `KAYNAK:\n${input.source.slice(0, LESSON_SANITY_SOURCE_CHARS)}`
      : "KAYNAK: (belgesiz ders; konunun yerleşik ders kitabı bilgisi geçerli)";
  const screens = input.screens
    .map((screen, screenIndex) =>
      [
        `EKRAN ${screenIndex}: ${screen.heading}`,
        ...screen.blocks.map(
          (block, blockIndex) =>
            `  [${blockIndex}] ${block.type}${removableBlock(block) ? " [çıkarılabilir]" : ""}: ${blockLine(block)}`,
        ),
      ].join("\n"),
    )
    .join("\n\n");
  return `KONU: ${input.topicLabel}\n\n${source}\n\nEKRANLAR:\n${screens}`;
}

type CheckPatch = {
  screen?: unknown;
  block?: unknown;
  options?: unknown;
  answerIndex?: unknown;
  optionWhy?: unknown;
  explanation?: unknown;
  why?: unknown;
};
type DropPatch = { screen?: unknown; block?: unknown; why?: unknown };

const textList = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= 200)
    ? (value as string[]).map((item) => item.trim())
    : null;
const intOf = (value: unknown): number => (typeof value === "number" && Number.isInteger(value) ? value : -1);
const listOf = <T>(raw: unknown, key: string): T[] => {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>)[key] : null;
  return Array.isArray(value) ? (value.filter((item) => item && typeof item === "object") as T[]) : [];
};

export type LessonSanityResult = {
  screens: LessonScreen[];
  /** Alınan soru yamaları. */
  patched: number;
  /** Anahtarı değişen soru sayısı. */
  keyChanged: number;
  /** Çıkarılan tekrar kutuları. */
  dropped: number;
  /** Geçersiz diye alınmayan yama ya da çıkarma isteği. */
  rejected: number;
  reasons: string[];
};

/**
 * Yamaları uygular (saf). Soru yaması ancak bütün alanları tutarlıysa alınır: kutu çoktan seçmeli bir soru, şık sayısı
 * aynı, şıklar boş değil ve birbirinden farklı, anahtar şıklardan biri, açıklama dolu, şık açıklaması varsa şık sayısı
 * kadar. Şıklar değişince ikinci soru (kendi şıklarıyla) düşer: çalışma anı aynı olguyu yeni şıklarla yeniden kurar.
 * Çıkarma ancak `removableBlock` kutusunda ve ekran başına en çok üç kez; ekran ve soru sayısı hiç değişmez.
 */
export function applyLessonSanity(screens: readonly LessonScreen[], raw: unknown): LessonSanityResult {
  const out: LessonScreen[] = screens.map((screen) => ({ ...screen, blocks: [...screen.blocks] }));
  let patched = 0;
  let keyChanged = 0;
  let rejected = 0;
  const reasons: string[] = [];
  const seenChecks = new Set<string>();

  for (const patch of listOf<CheckPatch>(raw, "checks")) {
    const screenIndex = intOf(patch.screen);
    const blockIndex = intOf(patch.block);
    const block = out[screenIndex]?.blocks[blockIndex];
    const key = `${screenIndex}:${blockIndex}`;
    if (!block || block.type !== "check" || block.check.type !== "mcq" || !block.check.options || seenChecks.has(key)) {
      rejected += 1;
      continue;
    }
    const check = block.check;
    const options = textList(patch.options);
    const why = patch.optionWhy === undefined ? undefined : textList(patch.optionWhy);
    const explanation = typeof patch.explanation === "string" ? patch.explanation.trim() : "";
    const answerIndex = intOf(patch.answerIndex);
    const valid =
      options !== null &&
      options.length === check.options!.length &&
      new Set(options.map(optionKey)).size === options.length &&
      answerIndex >= 0 &&
      answerIndex < options.length &&
      explanation.length >= 10 &&
      explanation.length <= 600 &&
      why !== null &&
      (why === undefined || why.length === options.length);
    if (!valid) {
      rejected += 1;
      continue;
    }
    seenChecks.add(key);
    const keyMoved = answerIndex !== check.answerIndex;
    const optionsChanged = options.some((option, index) => option !== check.options![index]);
    const { review, ...rest } = check;
    out[screenIndex]!.blocks[blockIndex] = {
      type: "check",
      check: {
        ...rest,
        options,
        answerIndex,
        explanation,
        optionWhy: why ?? undefined,
        whyWrong: undefined,
        ...(keyMoved ? { whyRight: undefined, misconception: undefined, hint: undefined } : {}),
        ...(review && !optionsChanged && !keyMoved ? { review } : {}),
      },
    } as LessonBlock;
    patched += 1;
    if (keyMoved) keyChanged += 1;
    if (typeof patch.why === "string" && patch.why.trim()) reasons.push(patch.why.trim().slice(0, 160));
  }

  const drops = new Map<number, Set<number>>();
  for (const patch of listOf<DropPatch>(raw, "drop")) {
    const screenIndex = intOf(patch.screen);
    const blockIndex = intOf(patch.block);
    const block = out[screenIndex]?.blocks[blockIndex];
    const marked = drops.get(screenIndex) ?? new Set<number>();
    if (!block || !removableBlock(block) || marked.has(blockIndex) || marked.size >= LESSON_SANITY_MAX_DROPS_PER_SCREEN) {
      rejected += 1;
      continue;
    }
    marked.add(blockIndex);
    drops.set(screenIndex, marked);
    if (typeof patch.why === "string" && patch.why.trim()) reasons.push(patch.why.trim().slice(0, 160));
  }
  let dropped = 0;
  for (const [screenIndex, marked] of drops) {
    const screen = out[screenIndex]!;
    out[screenIndex] = { ...screen, blocks: screen.blocks.filter((_, index) => !marked.has(index)) };
    dropped += marked.size;
  }
  return { screens: out, patched, keyChanged, dropped, rejected, reasons };
}

/** Dersin io'su: yazarla aynı çağrı (akış önemsiz). */
export type LessonSanityAsk = (system: string, user: string) => Promise<string | null>;

/**
 * Doğrulayıcıyı koşar: tek çağrı, süre tavanıyla. Çağrı düşer, süre aşılır ya da cevap okunamazsa ekranlar aynen döner.
 */
export async function runLessonSanity(
  ask: LessonSanityAsk,
  input: { mode: "document" | "topic"; topicLabel: string; source: string; screens: readonly LessonScreen[] },
  parse: (text: string) => unknown,
  timeoutMs = LESSON_SANITY_TIMEOUT_MS,
): Promise<LessonSanityResult & { ms: number; timedOut: boolean }> {
  const started = Date.now();
  const unchanged = { screens: [...input.screens], patched: 0, keyChanged: 0, dropped: 0, rejected: 0, reasons: [] };
  if (!input.screens.length) return { ...unchanged, ms: 0, timedOut: false };
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  try {
    const answer = await Promise.race([
      ask(lessonSanitySystem(input.mode), lessonSanityUserPrompt(input)).catch(() => null),
      timeout,
    ]);
    if (answer === "timeout") return { ...unchanged, ms: Date.now() - started, timedOut: true };
    if (!answer) return { ...unchanged, ms: Date.now() - started, timedOut: false };
    return { ...applyLessonSanity(input.screens, parse(answer)), ms: Date.now() - started, timedOut: false };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
