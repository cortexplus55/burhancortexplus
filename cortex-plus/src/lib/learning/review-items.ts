import { z } from "zod";
import { addDays } from "@/lib/istanbul-day";
import { readLessonV3, screenCheck, type LessonScreen } from "@/lib/learning/lesson-v3";
import { gradeSectionCheck, type LessonCheckAnswer } from "@/lib/learning/lesson-play";
import { normalizeQuizQuestion, sameOptionSet, selectedOptions } from "@/lib/learning/exam-quiz";
import { acceptReviewVariant } from "@/lib/learning/teacher-brain";
import { studentTextParts, stripEmphasis } from "@/lib/learning/lesson-board";
import { oralItemReviewable, type OralExamReport } from "@/lib/learning/oral-exam";
import type { SectionCheck } from "@/lib/learning/teaching-standards";

/**
 * Günü gelen tekrar (20 Ekim 2026, ürün sahibinin kararı): yanlış yapılan sorular ve dersin sınav
 * noktaları 1-3-7-14 gün sonra kendiliğinden yeniden sorulur; hazırlık sayfasında "Bugün N tekrar".
 *
 * Bu dosya saf çekirdek: merdiven, sınav günü sınırı, sonraki adım, tamamlanan etkinlikten taslak
 * çıkarma, tekrar anahtarı, istemciye giden mühürlü biçim, notlama ve sıralama. Model çağrısı ve
 * veritabanı yok; kayıt `review-items-store.ts`'te.
 *
 * İçerik kuralı (AGENTS: "kod metne dokunmaz; yalnız biçim ve sıra"): öğe, yazarın yazdığı ve
 * denetçinin geçirdiği sorunun KOPYASIDIR. Metin yeniden yazılmaz, kök cümle kodla kurulmaz; sunarken
 * yalnız şık sırası karışır. Bu yüzden teacher-brain'in tekrar sorusu kurucusu ve pratik sorusunu
 * yeniden yazan yardımcı buraya girmez: yedekleri kök cümleyi kodla kuruyor (bekçi testi adlarını arar).
 */

/** `REVIEW_INTERVALS_DAYS_V1`'in ilk dört basamağı. 14. günde doğru → öğrenildi. */
export const REVIEW_LADDER_DAYS = [1, 3, 7, 14] as const;
/** Bir oturumda sorulan en çok öğe; kalanı yine günü gelmiş sayılır, "Kalan N tekrar". */
export const REVIEW_SESSION_SIZE = 12;
/** Tek bir etkinlikten yazılan en çok öğe; günlük yük öğrenciyi boğmasın. */
export const REVIEW_CAPS = { examPointsPerLesson: 3, cardsPerAttempt: 8, oralPerAttempt: 5, perAttempt: 20 } as const;

export type ReviewSourceKind = "lesson_check" | "quiz" | "true_false" | "oral" | "card";
export type ReviewReason = "miss" | "exam_point";
export type ReviewStatus = "active" | "learned" | "expired";

export const REVIEW_SOURCE_LABEL: Record<ReviewSourceKind, string> = {
  lesson_check: "Ders sorusu",
  quiz: "Test sorusu",
  true_false: "Doğru / Yanlış",
  oral: "Sözlü",
  card: "Kart",
};

type ChoiceForm = { prompt: string; options: string[]; correct: string[]; explanation?: string };

export type StoredReviewItem =
  | {
      mode: "choice";
      prompt: string;
      options: string[];
      correct: string[];
      multi: boolean;
      /** Doğru/Yanlış: şıklar karışmaz, hep "Doğru · Yanlış". Tür değişmez (kod soruyu başka türe çevirmez). */
      trueFalse?: boolean;
      explanation?: string;
      /** Şık metni → o şıkkın gerekçesi; karışık sırada da doğru şıkka bağlı kalsın. */
      optionWhy?: Record<string, string>;
      /** Yanlış önermenin doğru hâli ("Doğrusu: …"). Yalnız orijinal soruda gösterilir. */
      corrected?: string;
      /** Aynı üretim çağrısında yazılan, `acceptReviewVariant`'tan geçmiş kök. Çift sıradaki sorularda sorulur. */
      variant?: ChoiceForm;
    }
  | { mode: "recall"; front: string; back: string };

export type ServedReviewItem = {
  id: string;
  topicLabel: string | null;
  sourceLabel: string;
  /** "Sınav noktası" yalnız doğru cevaplanmış ders sorusunda; yanlışta boş. */
  reasonLabel: string | null;
} & (
  | { mode: "choice"; prompt: string; options: string[]; multi: boolean }
  | { mode: "recall"; front: string; back: string }
);

export type ReviewDraft = {
  sourceKind: ReviewSourceKind;
  reason: ReviewReason;
  sourceRef: string;
  topicLabel: string | null;
  item: StoredReviewItem;
  promptKey: string;
};

/** Veritabanı satırının bu dosyanın okuduğu kısmı. */
export type ReviewItemRow = {
  id: string;
  topic_label: string | null;
  source_kind: string;
  reason: string;
  item: unknown;
  interval_step: number;
  due_on: string;
  status: string;
  ask_count: number;
  lapse_count: number;
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function dayOrNull(value: string | null | undefined): string | null {
  const day = typeof value === "string" ? value.slice(0, 10) : "";
  return DAY_RE.test(day) ? day : null;
}

/** İki İstanbul günü arası (b − a), gün. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * Basamağın tarihi. Sınav varsa en geç sınavdan önceki gün; sınav yarınsa sınav günü (öğrenci sabah
 * bir kez daha görür). Sınav bugün ya da geçtiyse tekrar yok (null).
 */
export function reviewDueOn(input: { today: string; step: number; examDate?: string | null }): string | null {
  const step = Math.max(0, Math.min(REVIEW_LADDER_DAYS.length - 1, Math.floor(Number(input.step) || 0)));
  let due = addDays(input.today, REVIEW_LADDER_DAYS[step]);
  const exam = dayOrNull(input.examDate);
  if (exam) {
    if (exam <= input.today) return null;
    const last = addDays(exam, -1);
    if (due > last) due = last > input.today ? last : exam;
  }
  return due;
}

/** Cevaptan sonra: doğru bir basamak çıkar (14. günde doğru → öğrenildi); yanlış 1. güne döner. */
export function nextReviewStep(input: {
  step: number;
  correct: boolean;
  today: string;
  examDate?: string | null;
}): { step: number; dueOn: string | null; status: ReviewStatus } {
  const top = REVIEW_LADDER_DAYS.length - 1;
  const current = Math.max(0, Math.min(top, Math.floor(Number(input.step) || 0)));
  if (input.correct && current >= top) return { step: top, dueOn: null, status: "learned" };
  const step = input.correct ? current + 1 : 0;
  const dueOn = reviewDueOn({ today: input.today, step, examDate: input.examDate });
  return { step, dueOn, status: dueOn ? "active" : "expired" };
}

function fold(text: string): string {
  return text.trim().toLocaleLowerCase("tr").replace(/\s+/g, " ");
}

function fnv(text: string, offset: number): string {
  let hash = offset >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Aynı soru aynı hazırlıkta tek satır: kök + doğru cevap. Anahtar özetlenir (iki 32 bitlik FNV +
 * kısa okunur önek): kayıt bir tamamlamada 20 anahtarı `in` süzgeciyle sorar, tam metin Türkçe
 * harflerle adres satırını onlarca KB'a çıkarırdı.
 */
export function reviewPromptKey(item: StoredReviewItem): string {
  const stem = fold(stripEmphasis(item.mode === "choice" ? item.prompt : item.front));
  const answer = fold(item.mode === "choice" ? item.correct.join("|") : stripEmphasis(item.back));
  const full = `${stem}|${answer}`;
  // Yalnız özet (20 Ekim 2026 inceleme): okunur kök öneki `.in()` süzgecinde tırnak/ters bölü/parantezle
  // bozuluyor, yeniden kaçan soru 1. güne dönmüyordu.
  return `${fnv(full, 2166136261)}${fnv(full, 0x811c9dc5 ^ 0x5bd1e995)}`;
}

/**
 * Ekranda sınav noktası var mı: metinde `==…==` vurgusu ya da "Sınav ipucu" / "Akılda tut" kutusu.
 * Genel bilgi ve ezber kodu sayılmaz (sınavın sorduğu belgedeki bilgi değil).
 */
export function screenHasExamPoint(screen: Pick<LessonScreen, "blocks">): boolean {
  return screen.blocks.some((block) => {
    if (block.type === "text") return studentTextParts(block.text).some((part) => part.exam);
    if (block.type === "note") return block.note.tone === "exam" || block.note.tone === "remember";
    return false;
  });
}

function screenSource(screen: Pick<LessonScreen, "blocks">): string {
  return screen.blocks
    .flatMap((block) => {
      if (block.type === "text") return [block.text];
      if (block.type === "note") return [block.note.title, block.note.body];
      return [];
    })
    .join("\n");
}

function whyMap(options: string[], why: unknown): Record<string, string> | undefined {
  if (!Array.isArray(why) || why.length !== options.length) return undefined;
  const map: Record<string, string> = {};
  options.forEach((option, index) => {
    const line = typeof why[index] === "string" ? (why[index] as string).trim() : "";
    if (line) map[option] = line;
  });
  return Object.keys(map).length ? map : undefined;
}

function reasonsMap(options: string[], reasons: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!reasons) return undefined;
  const map: Record<string, string> = {};
  for (const option of options) {
    const line = reasons[option]?.trim();
    if (line) map[option] = line;
  }
  return Object.keys(map).length ? map : undefined;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Tek doğrulu sorunun yazarın yazdığı tekrar kökü; `acceptReviewVariant` geçirmezse yok. */
function variantFor(
  check: { type: "mcq" | "trueFalse"; prompt: string; options: string[]; answerIndex: number; explanation: string },
  review: unknown,
  source: string,
): ChoiceForm | undefined {
  if (!review || typeof review !== "object") return undefined;
  const accepted = acceptReviewVariant({ ...check, review: review as { prompt: string } }, source);
  if (!accepted) return undefined;
  const right = accepted.options[accepted.answerIndex];
  if (!right) return undefined;
  // Varyantın kendi açıklaması: ana sorunun gerekçesi ona ait değil (doğru/yanlışta cevap ters olabilir).
  return { prompt: accepted.prompt, options: accepted.options, correct: [right], ...(accepted.explanation ? { explanation: accepted.explanation } : {}) };
}

function lessonCheckItem(check: SectionCheck, source: string): StoredReviewItem | null {
  if (check.type !== "mcq" && check.type !== "trueFalse") return null;
  const options = check.options ?? [];
  const answerIndex = check.answerIndex;
  if (options.length < 2 || typeof answerIndex !== "number" || !options[answerIndex]) return null;
  const variant = check.review
    ? variantFor(
        { type: check.type, prompt: check.prompt, options, answerIndex, explanation: check.explanation },
        check.review,
        source,
      )
    : undefined;
  const optionWhy = whyMap(options, check.optionWhy);
  const corrected = check.type === "trueFalse" ? cleanText(check.corrected) : "";
  return {
    mode: "choice",
    prompt: check.prompt,
    options,
    correct: [options[answerIndex]],
    multi: false,
    ...(check.type === "trueFalse" ? { trueFalse: true } : {}),
    ...(check.explanation?.trim() ? { explanation: check.explanation.trim() } : {}),
    ...(optionWhy ? { optionWhy } : {}),
    ...(corrected ? { corrected } : {}),
    ...(variant ? { variant } : {}),
  };
}

function lessonEntry(raw: unknown, index: number): LessonCheckAnswer | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entry = (raw as Record<string, unknown>)[String(index)];
  if (!entry || typeof entry !== "object") return null;
  return typeof (entry as LessonCheckAnswer).pick === "number" ? (entry as LessonCheckAnswer) : null;
}

/**
 * Tamamlanan etkinlikten tekrar taslakları. Yalnız kayıtlı (denetlenmiş) öğeler; sunumda eklenen
 * kartlar (`withLessonReviewCards`, kodla kurulmuş ön yüz) ve yeniden kullanılmış sorular
 * (`reused`, pratikte yeniden yazılmış kök) atlanır. Cevaplanmayan soru atlanır.
 */
export function reviewDraftsFromAttempt(input: {
  attemptId: string;
  kind: string;
  payload: unknown;
  answers: Record<string, unknown>;
  topicLabel: string | null;
  oralReport?: OralExamReport | null;
}): ReviewDraft[] {
  const data = (input.payload && typeof input.payload === "object" ? input.payload : {}) as Record<string, unknown>;
  const answers = input.answers ?? {};
  // Hazırlık geneli düğüm zayıf konuya yönelince içerik `testedTopic` taşır (prep-wide-target.ts); tekrar satırı
  // da kanıt ve yanılgı gibi sorulan konunun adını alır (22 Ekim 2026 inceleme: düğümün adıyla yazılıyordu).
  const stamped = typeof data.testedTopic === "string" ? data.testedTopic.trim() : "";
  const topic = stamped || input.topicLabel?.trim() || null;
  const drafts: ReviewDraft[] = [];
  const push = (draft: Omit<ReviewDraft, "promptKey">) => {
    drafts.push({ ...draft, promptKey: reviewPromptKey(draft.item) });
  };

  // Yazılı deneme (ürün sahibinin kararı, v1): yanlışları kayda girmez.
  if (input.kind === "written_exam") return [];

  if (data.type === "quiz" && data.reused !== true) {
    const raws = Array.isArray(data.questions) ? data.questions : [];
    raws.forEach((raw, index) => {
      if (!raw || typeof raw !== "object") return;
      let question: ReturnType<typeof normalizeQuizQuestion> = null;
      try {
        question = normalizeQuizQuestion(raw as Parameters<typeof normalizeQuizQuestion>[0]);
      } catch {
        question = null;
      }
      if (!question) return;
      const selected = selectedOptions(answers[String(index)]);
      if (!selected.length || sameOptionSet(selected, question.correct)) return;
      const optionWhy = whyMap(question.options, question.optionWhy) ?? reasonsMap(question.options, question.optionReasons);
      const review = (raw as { review?: unknown }).review;
      const answerIndex = question.options.indexOf(question.correct[0]);
      const variant =
        !question.multi && review && answerIndex >= 0
          ? variantFor(
              { type: "mcq", prompt: question.text, options: question.options, answerIndex, explanation: question.explanation ?? "" },
              review,
              "",
            )
          : undefined;
      push({
        sourceKind: "quiz",
        reason: "miss",
        sourceRef: `${input.attemptId}:quiz:${index}`,
        topicLabel: question.topic?.trim() || topic,
        item: {
          mode: "choice",
          prompt: question.text,
          options: question.options,
          correct: question.correct,
          multi: question.multi,
          ...(question.explanation ? { explanation: question.explanation } : {}),
          ...(optionWhy ? { optionWhy } : {}),
          ...(variant ? { variant } : {}),
        },
      });
    });
  }

  if (data.type === "true_false") {
    const items = Array.isArray(data.items) ? data.items : [];
    items.forEach((raw, index) => {
      if (!raw || typeof raw !== "object") return;
      const item = raw as { statement?: unknown; text?: unknown; correct?: unknown; explanation?: unknown; correctedStatement?: unknown };
      if (typeof item.correct !== "boolean") return;
      const value = answers[String(index)];
      if (value == null || value === "") return;
      if (value === item.correct || value === String(item.correct)) return;
      const prompt = cleanText(item.statement) || cleanText(item.text);
      if (prompt.length < 4) return;
      const explanation = cleanText(item.explanation);
      const corrected = cleanText(item.correctedStatement);
      push({
        sourceKind: "true_false",
        reason: "miss",
        sourceRef: `${input.attemptId}:true_false:${index}`,
        topicLabel: topic,
        item: {
          mode: "choice",
          prompt,
          options: ["Doğru", "Yanlış"],
          correct: [item.correct ? "Doğru" : "Yanlış"],
          multi: false,
          trueFalse: true,
          ...(explanation ? { explanation } : {}),
          ...(corrected ? { corrected } : {}),
        },
      });
    });
  }

  if (data.type === "lesson") {
    // Ekran i = bölüm i: cevaplar `lessonAnswers[i]`. İlk cevap sayılır; tekrarda doğru olsa da kaçan soru sorulur.
    const screens = readLessonV3(data.lesson)?.screens ?? [];
    const rawAnswers = answers.lessonAnswers;
    const hasAnswers = Boolean(rawAnswers && typeof rawAnswers === "object" && !Array.isArray(rawAnswers));
    const misses = new Set(
      Array.isArray(answers.lessonMisses)
        ? (answers.lessonMisses as unknown[]).filter((value): value is number => Number.isInteger(value))
        : [],
    );
    let examPoints = 0;
    screens.forEach((screen, index) => {
      const check = screenCheck(screen);
      if (!check) return;
      const item = lessonCheckItem(check, screenSource(screen));
      if (!item) return;
      const entry = hasAnswers ? lessonEntry(rawAnswers, index) : null;
      // Eski istemci yalnız kaçanların listesini gönderiyordu: oradan yalnız yanlış çıkar.
      const correct = entry ? gradeSectionCheck(check, entry).correct : hasAnswers ? null : misses.has(index) ? false : null;
      if (correct === null) return;
      const sourceRef = `${input.attemptId}:lesson_check:${index}`;
      if (!correct) {
        push({ sourceKind: "lesson_check", reason: "miss", sourceRef, topicLabel: topic, item });
        return;
      }
      if (examPoints >= REVIEW_CAPS.examPointsPerLesson || !screenHasExamPoint(screen)) return;
      examPoints += 1;
      push({ sourceKind: "lesson_check", reason: "exam_point", sourceRef, topicLabel: topic, item });
    });
  }

  if (data.type === "cards") {
    // Yalnız kayıtlı deste: sunumda eklenen tekrar kartları kayıtta yok, sıraları desteden sonra.
    const cards = Array.isArray(data.cards) ? data.cards : [];
    let count = 0;
    cards.forEach((raw, index) => {
      if (count >= REVIEW_CAPS.cardsPerAttempt || !raw || typeof raw !== "object") return;
      const value = answers[String(index)];
      if (value !== false && value !== "false") return;
      const front = cleanText((raw as { front?: unknown }).front);
      const back = cleanText((raw as { back?: unknown }).back);
      if (front.length < 2 || back.length < 2) return;
      count += 1;
      push({
        sourceKind: "card",
        reason: "miss",
        sourceRef: `${input.attemptId}:card:${index}`,
        topicLabel: topic,
        item: { mode: "recall", front, back },
      });
    });
  }

  const report =
    input.oralReport ??
    (data.type === "oral" && data.gradeMeta && typeof data.gradeMeta === "object" ? (data.gradeMeta as OralExamReport) : null);
  if ((data.type === "oral" || input.kind === "oral") && report && Array.isArray(report.items)) {
    report.items
      .filter((item) => item && typeof item === "object" && typeof item.question === "string" && oralItemReviewable(item))
      .slice(0, REVIEW_CAPS.oralPerAttempt)
      .forEach((item) => {
        const front = item.question.trim();
        const back = item.modelAnswer.trim();
        if (front.length < 2) return;
        push({
          sourceKind: "oral",
          reason: "miss",
          sourceRef: `${input.attemptId}:oral:${item.index}`,
          topicLabel: topic,
          item: { mode: "recall", front, back },
        });
      });
  }

  const seen = new Set<string>();
  return drafts
    .filter((draft) => {
      if (draft.promptKey.length < 4 || seen.has(draft.promptKey)) return false;
      // Okunamayacak öğe yazılmaz: sayılır ama hiç sorulamazdı.
      if (!readStoredReviewItem(draft.item)) return false;
      seen.add(draft.promptKey);
      return true;
    })
    .slice(0, REVIEW_CAPS.perAttempt);
}

// Üst sınırlar geniş: vaka sorusu uzun olabilir. Okunamayan satır hiç sorulmaz ama sayılırdı; o
// yüzden taslak yazılmadan önce de aynı okuyucudan geçer (`reviewDraftsFromAttempt` sonu).
const choiceFormSchema = z.object({
  prompt: z.string().min(2).max(4000),
  options: z.array(z.string().min(1).max(1500)).min(2).max(6),
  correct: z.array(z.string().min(1).max(1500)).min(1).max(6),
  explanation: z.string().max(3000).optional().catch(undefined),
});

const storedItemSchema = z.discriminatedUnion("mode", [
  choiceFormSchema.extend({
    mode: z.literal("choice"),
    multi: z.boolean(),
    trueFalse: z.boolean().optional(),
    explanation: z.string().max(6000).optional(),
    optionWhy: z.record(z.string(), z.string()).optional(),
    corrected: z.string().max(3000).optional(),
    variant: choiceFormSchema.optional().catch(undefined),
  }),
  z.object({ mode: z.literal("recall"), front: z.string().min(2).max(4000), back: z.string().min(2).max(6000) }),
]);

function formIsSound(form: ChoiceForm): boolean {
  return new Set(form.options).size === form.options.length && form.correct.every((option) => form.options.includes(option));
}

/** Kayıtlı öğe. Bozuksa null: oturum o öğeyi sessizce atlar, hata ekranı çıkmaz. */
export function readStoredReviewItem(value: unknown): StoredReviewItem | null {
  const parsed = storedItemSchema.safeParse(value);
  if (!parsed.success) return null;
  const item = parsed.data;
  if (item.mode === "recall") return item;
  if (!formIsSound(item)) return null;
  if (item.variant && !formIsSound(item.variant)) {
    const { variant, ...rest } = item;
    void variant;
    return rest;
  }
  return item;
}

/** Çift sıradaki soruda (0, 2, …) yazarın tekrar kökü varsa o; yoksa orijinal. */
export function servedForm(item: StoredReviewItem, askCount: number): (ChoiceForm & { variant: boolean }) | null {
  if (item.mode !== "choice") return null;
  if (item.variant && askCount % 2 === 0) return { ...item.variant, variant: true };
  return { prompt: item.prompt, options: item.options, correct: item.correct, variant: false };
}

function textSeed(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Şıklar öğeye ve kaçıncı soruluşuna bağlı sabit sırayla karışır (teacher-quiz `shuffleOptions` kalıbı). */
function shuffled(options: string[], seed: string): string[] {
  let state = textSeed(seed) || 1;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const order = options.map((_, index) => index);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(random() * (index + 1));
    [order[index], order[pick]] = [order[pick], order[index]];
  }
  return order.map((index) => options[index]);
}

const TF_ORDER = ["doğru", "yanlış"];

/** Sunulan şık sırası. Doğru/Yanlış hep aynı sırada; öbürleri karışık. */
export function servedOptions(id: string, askCount: number, item: StoredReviewItem): string[] {
  const form = servedForm(item, askCount);
  if (!form) return [];
  if (item.mode === "choice" && item.trueFalse) {
    const rank = (option: string) => {
      const at = TF_ORDER.indexOf(option.trim().toLocaleLowerCase("tr"));
      return at < 0 ? TF_ORDER.length : at;
    };
    return [...form.options].sort((a, b) => rank(a) - rank(b));
  }
  return shuffled(form.options, `${id}:${askCount}`);
}

/** İstemciye giden biçim: doğru cevap, açıklama ve şık gerekçeleri yok. */
export function sealReviewItem(row: ReviewItemRow): ServedReviewItem | null {
  const item = readStoredReviewItem(row.item);
  if (!item) return null;
  const sourceKind = row.source_kind as ReviewSourceKind;
  const base = {
    id: row.id,
    topicLabel: row.topic_label?.trim() || null,
    sourceLabel: REVIEW_SOURCE_LABEL[sourceKind] ?? "Tekrar",
    reasonLabel: row.reason === "exam_point" ? "Sınav noktası" : null,
  };
  if (item.mode === "recall") return { ...base, mode: "recall", front: item.front, back: item.back };
  const form = servedForm(item, row.ask_count);
  if (!form) return null;
  return {
    ...base,
    mode: "choice",
    prompt: form.prompt,
    options: servedOptions(row.id, row.ask_count, item),
    // Yazarın tekrar kökü yalnız tek doğrulu soruda var.
    multi: form.variant ? false : item.multi,
  };
}

export type ReviewAnswer = { pick?: string | string[]; recalled?: boolean };

/** Cevap ucunun döndürdüğü; istemci yalnız bunu görür. */
export type ReviewAnswerOutcome = {
  correct: boolean;
  mode: "choice" | "recall";
  correctAnswers?: string[];
  explanation?: string;
  corrected?: string;
  optionWhy?: Record<string, string>;
  back?: string;
  step: number;
  dueOn: string | null;
  status: ReviewStatus;
  line: string;
  remaining: number;
};

/** Sunucuda not. Bozuk cevap null (kayıt yazılmaz). */
export function gradeReviewAnswer(item: StoredReviewItem, askCount: number, answer: ReviewAnswer): boolean | null {
  if (item.mode === "recall") return typeof answer.recalled === "boolean" ? answer.recalled : null;
  const form = servedForm(item, askCount);
  if (!form) return null;
  const picks = selectedOptions(answer.pick);
  if (!picks.length) return null;
  if (picks.some((pick) => !form.options.includes(pick))) return false;
  return sameOptionSet(picks, form.correct);
}

/** Cevaptan sonra gösterilenler: doğru şık(lar), açıklama, sunulan şıkların gerekçesi. */
export function reviewReveal(item: StoredReviewItem, askCount: number) {
  if (item.mode === "recall") return { back: item.back };
  const form = servedForm(item, askCount);
  const optionWhy = item.optionWhy
    ? Object.fromEntries((form?.options ?? []).flatMap((option) => (item.optionWhy?.[option] ? [[option, item.optionWhy[option]]] : [])))
    : undefined;
  return {
    correctAnswers: form?.correct ?? item.correct,
    ...(form?.variant ? (form.explanation ? { explanation: form.explanation } : {}) : item.explanation ? { explanation: item.explanation } : {}),
    // "Doğrusu" orijinal önermeye ait; yazarın tekrar kökünde gösterilmez.
    ...(item.corrected && form && !form.variant ? { corrected: item.corrected } : {}),
    ...(optionWhy && Object.keys(optionWhy).length && !form?.variant ? { optionWhy } : {}),
  };
}

/**
 * Bugünün sırası: önce yanlışlar, sonra sınav noktaları; her grupta en çok kaçan ve en eski önde,
 * konular arasında sırayla (Günün turu `pickDailySet` fikri: tek konudan on soru, konu tekrarı olur).
 */
export function interleaveDue<T extends Pick<ReviewItemRow, "reason" | "lapse_count" | "due_on" | "topic_label">>(rows: T[]): T[] {
  const sorted = [...rows].sort(
    (a, b) => (b.lapse_count ?? 0) - (a.lapse_count ?? 0) || String(a.due_on).localeCompare(String(b.due_on)),
  );
  const roundRobin = (group: T[]) => {
    const buckets = new Map<string, T[]>();
    for (const row of group) {
      const key = row.topic_label?.trim().toLocaleLowerCase("tr") ?? "";
      const bucket = buckets.get(key) ?? [];
      bucket.push(row);
      buckets.set(key, bucket);
    }
    const lists = [...buckets.values()];
    const out: T[] = [];
    for (let round = 0; out.length < group.length; round += 1) {
      for (const list of lists) if (list[round]) out.push(list[round]);
    }
    return out;
  };
  return [
    ...roundRobin(sorted.filter((row) => row.reason !== "exam_point")),
    ...roundRobin(sorted.filter((row) => row.reason === "exam_point")),
  ];
}

/** Cevaptan sonraki tek satır: ne oldu ve ne zaman yeniden. */
export function reviewAfterLine(input: {
  mode: "choice" | "recall";
  correct: boolean;
  status: ReviewStatus;
  dueOn: string | null;
  today: string;
}): string {
  if (input.status === "expired") return "Sınav günü geldi; bu soru tekrar listesinden çıktı";
  const right = input.mode === "recall" ? "Hatırladın" : "Doğru";
  const wrong = input.mode === "recall" ? "Hatırlamadın" : "Yanlış";
  if (input.status === "learned") return `${right} · bu soru öğrenildi`;
  if (!input.correct) return `${wrong} · yarın yeniden sorulacak`;
  const days = input.dueOn ? daysBetween(input.today, input.dueOn) : 0;
  return days <= 1 ? `${right} · yarın yeniden` : `${right} · ${days} gün sonra yeniden`;
}

export { reviewScheduledLine } from "@/lib/learning/review-copy";
