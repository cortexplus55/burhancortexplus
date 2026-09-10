/**
 * Stage 5 — shared teaching-standard contract for pdf_learning_v2.
 * Schemas, prompt constraints, and deterministic pedagogy validators.
 * Legacy paths stay untouched when the flag is OFF.
 */

import { z } from "zod";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";
import type { PodcastChapter } from "@/lib/learning/podcast-script";

export type TeachingActivity =
  | "intro_qa"
  | "lesson"
  | "quiz"
  | "true_false"
  | "podcast"
  | "flashcards"
  | "oral"
  | "written";

export type SessionTeachingMeta = {
  topicId?: string;
  topicTitle?: string;
  objective?: string;
  sourcePages?: number[];
  durationMinutes?: number;
  role?: "learn" | "practice" | "review" | "mock";
  calendarDate?: string;
};

export type MisconceptionDraft = {
  claim: string;
  corrected: string | null;
  wrongType: string;
  sourceKind: string;
  topicLabel: string | null;
  questionPreview: string | null;
};

const META_OPTIONS =
  /^(hepsi|hiçbiri|all of the above|none of the above|yukarıdakilerin hepsi|yukarıdakilerin hiçbiri)/i;

const VAGUE_TF =
  /\b(her zaman|asla|hiçbir zaman|kesinlikle|mutlaka|genelde|çoğu zaman|bazen|her şey|herkes)\b/i;

/** Map exam-prep node kinds onto teaching activities. */
export function teachingActivityForKind(kind: PlanNodeKind): TeachingActivity {
  if (kind === "qa") return "intro_qa";
  if (kind === "podcast") return "podcast";
  if (kind === "true_false") return "true_false";
  if (kind === "oral") return "oral";
  if (kind === "flashcards" || kind === "spaced") return "flashcards";
  if (kind === "written_exam") return "written";
  return "quiz";
}

export function parseSessionMeta(raw: unknown): SessionTeachingMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const sourcePages = Array.isArray(row.sourcePages)
    ? row.sourcePages.filter((n): n is number => typeof n === "number" && n > 0)
    : undefined;
  const role =
    row.role === "learn" ||
    row.role === "practice" ||
    row.role === "review" ||
    row.role === "mock"
      ? row.role
      : undefined;
  return {
    topicId: typeof row.topicId === "string" ? row.topicId : undefined,
    topicTitle: typeof row.topicTitle === "string" ? row.topicTitle : undefined,
    objective: typeof row.objective === "string" ? row.objective : undefined,
    sourcePages,
    durationMinutes:
      typeof row.durationMinutes === "number" ? row.durationMinutes : undefined,
    role,
    calendarDate: typeof row.calendarDate === "string" ? row.calendarDate : undefined,
  };
}

/** Bind topic / objective / pages into the generation prompt (Stage 2–4 meta). */
export function teachingSessionContext(
  meta: SessionTeachingMeta | null,
  topicLabel: string,
): string {
  const topic = meta?.topicTitle?.trim() || topicLabel;
  const objective = meta?.objective?.trim();
  const pages = meta?.sourcePages?.length
    ? `Kaynak sayfalar: ${meta.sourcePages.join(", ")}.`
    : "";
  const role = meta?.role ? `Oturum rolü: ${meta.role}.` : "";
  const duration =
    typeof meta?.durationMinutes === "number"
      ? `Hedef süre: ~${meta.durationMinutes} dk.`
      : "";
  return [
    `Öğretim konusu: ${topic}.`,
    objective ? `Öğrenme hedefi: ${objective}.` : "",
    pages,
    role,
    duration,
    "Yalnızca bu konu ve hedefe bağlı kal; başka konulara sapma.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Prompt constraints per §7 activity type. */
export function teachingStandardConstraints(activity: TeachingActivity): string {
  switch (activity) {
    case "intro_qa":
      return (
        "Soru-cevap öğretimi: tek kavram/problemle başla. Öğrenci düşünmeden cevabı verme. " +
        "Yanlışı sınıflandır (tanım / işlem / kavram yanılgısı). İpuçlarını kademeli ver. " +
        "Doğru sonra kısa kavram kontrolü. Döngüde sıkıştırma: yeterince deneme veya " +
        "öğrenci isterse çözümü göster. Her soruda learningObjective yaz."
      );
    case "lesson":
      return (
        "Ders yapısı zorunlu sıra: (1) öğrenme hedefi, (2) kısa açıklama, (3) kaynağa dayalı örnek, " +
        "(4) gerekirse adımlar, (5) yaygın hata (commonMistake), (6) orta bilgi kontrolü (infoCheck), " +
        "(7) kısa kapanış + sonraki adım. Anlamlı bölümler; duvar metin yok. Her bölüm kısa tut."
      );
    case "quiz":
      return (
        "Her soruda net learningObjective. Yeterli bilgi ver. correct seçenekleri options içinde birebir. " +
        "Çeldiriciler gerçek yanılgılardan gelsin (misconceptionTag). Açıklama doğru kümesiyle uyumlu. " +
        "Eşdeğer tekrar şık yok. Seviyeye uygun. multi=true yalnızca birden fazla bağımsız doğru varken; " +
        "'hepsi/hiçbiri' şıkkı yok."
      );
    case "true_false":
      return (
        "Her madde tek iddia. Belirsiz genellemelerden kaçın. Yanlışsa correctedStatement zorunlu. " +
        "explanation nedeni anlatsın. misconceptionTag ile yanılgı etiketle (Stage 6 için)."
      );
    case "podcast":
      return (
        "Konu+hedefe bağlı. Kaynak noktalarını önceden seç. Bölüm sırası: Tanım → Neden → Örnek → " +
        "Yaygın hata → Özet. Formüller konuşulabilir Unicode. Kaynak dışı iddia yok. " +
        "Her bölüm başlığı ve satırlar TTS öncesi doğrulanabilir kısa cümleler."
      );
    case "flashcards":
      return (
        "Kart başına tek olgu/beceri. Ön yüz cevabı sızdırmasın. 'Biliyorum' sınav ustalığı değildir. " +
        "Zor kartlar (difficulty=hard) önce gelsin. Tekrarlı işaretleme sahte ustalık üretmesin."
      );
    case "oral":
      return (
        "Her soruda rubrik (rubricCriteria) ve beklenen noktalar (expectedPoints). " +
        "Eşdeğer doğru kabul edilir. Gerekçesiz uzun metin doğru sayılmaz. " +
        "Sınav kipinde yardım sınırlı; skor gerekçesi ve eksik hedefler kayda hazır olsun."
      );
    case "written":
      return (
        "Yazılı deneme: yardım/ipucu yok. Her soruda learningObjective + rubrik. " +
        "Eşdeğer doğrular kabul; kısmi puan gerekçeye bağlı. Uzun ilgisiz metin = yanlış. " +
        "Skor gerekçesi ve kaçırılan hedefler için explanation net olsun."
      );
    default:
      return "";
  }
}

/**
 * Bölüm sonu kontrolü.
 *
 * Ders tek akış hâlinde okunurken öğrenci anlayıp anlamadığını ancak en sonda
 * öğreniyordu. Her bölümün kendi kontrolü olunca yanlış anlama okunduğu yerde
 * yakalanıyor. `answerIndex` seçenek dizisine bakar; `explanation` cevabı
 * bölümün metnine bağlar.
 */
export const sectionCheckSchema = z.object({
  type: z.enum(["mcq", "trueFalse"]),
  prompt: z.string().min(8).max(300),
  options: z.array(z.string().min(1).max(160)).min(2).max(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(8).max(400),
});

export type SectionCheck = z.infer<typeof sectionCheckSchema>;

export const lessonV2Schema = z.object({
  title: z.string().min(2).max(120),
  objective: z.string().min(12).max(240),
  overview: z.string().min(20).max(600),
  sections: z
    .array(
      z.object({
        heading: z.string().min(2),
        body: z.string().min(20).max(900),
        check: sectionCheckSchema.optional(),
      }),
    )
    .min(3)
    .max(6),
  example: z.object({
    prompt: z.string().min(8),
    solution: z.string().min(8),
  }),
  commonMistake: z.object({
    claim: z.string().min(8),
    correction: z.string().min(8),
  }),
  infoCheck: z.object({
    prompt: z.string().min(8),
    answer: z.string().min(4),
  }),
  summary: z.array(z.string().min(2)).min(2).max(6),
  nextFocus: z.array(z.string().min(2)).min(1).max(4),
});

export type LessonV2 = z.infer<typeof lessonV2Schema>;

export const flashcardV2Schema = z.object({
  cards: z
    .array(
      z.object({
        front: z.string().min(4).max(200),
        back: z.string().min(2).max(400),
        difficulty: z.enum(["easy", "medium", "hard"]).optional(),
      }),
    )
    .min(4)
    .max(12),
});

export const oralV2Schema = z.object({
  questions: z
    .array(
      z.object({
        prompt: z.string().min(8),
        hint: z.string().optional(),
        learningObjective: z.string().min(8).optional(),
        rubricCriteria: z.array(z.string().min(2)).min(1).max(5).optional(),
        expectedPoints: z.array(z.string().min(2)).min(1).max(6).optional(),
      }),
    )
    .min(3)
    .max(6),
});

export const podcastV2Schema = z.object({
  title: z.string().min(1),
  objective: z.string().min(8).optional(),
  sourcePoints: z.array(z.string().min(4)).min(2).max(8).optional(),
  chapters: z
    .array(
      z.object({
        title: z.string().min(1),
        lines: z
          .array(
            z.object({
              speaker: z.enum(["ada", "kerem"]),
              text: z.string().min(4).max(180),
            }),
          )
          .min(2)
          .max(14),
      }),
    )
    .min(4)
    .max(5),
});

function normalizeOption(text: string) {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/^[a-d][).:\-]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wallOfText(body: string) {
  return body.trim().length > 700 || body.split(/\n+/).length > 8;
}

const SUPERSCRIPTS = "⁰¹²³⁴⁵⁶⁷⁸⁹ⁿⁱ⁺⁻⁽⁾";

/**
 * Yarım kalmış üst simge dizisi.
 *
 * Üretilen bir derste "2³+⁴" geçti: model 2⁽³⁺⁴⁾ demek istemiş ama üssün
 * ortasında normal satıra düşmüş. Ekranda "2 üssü 3, artı 4" okunuyor ve
 * anlam tersine dönüyor. Üst simgeden sonra normal bir işleç gelip ardından
 * yeniden üst simgeye dönülüyorsa üs bölünmüş demektir.
 */
export function brokenSuperscript(text: string): boolean {
  return new RegExp(`[${SUPERSCRIPTS}]\\s*[+\\-*/×÷]\\s*[${SUPERSCRIPTS}]`).test(
    text,
  );
}

/** Deterministic lesson pedagogy checks (structure → pedagogy). */
export function validateLessonPedagogy(raw: unknown): string[] {
  const parsed = lessonV2Schema.safeParse(raw);
  if (!parsed.success) {
    return ["Ders v2 şemasını karşılamıyor (hedef, bölümler, örnek, yaygın hata, bilgi kontrolü)."];
  }
  const lesson = parsed.data;
  const issues: string[] = [];
  if (wallOfText(lesson.overview)) {
    issues.push("Genel bakış çok uzun; kısa tut.");
  }
  const mathTexts = [
    lesson.overview,
    ...lesson.sections.map((s) => s.body),
    lesson.example.prompt,
    lesson.example.solution,
    lesson.commonMistake.correction,
  ];
  if (mathTexts.some(brokenSuperscript)) {
    issues.push(
      "Üs bölünmüş (ör. 2³+⁴): üssün tamamını üst simgeyle yaz ya da sonucu hesapla.",
    );
  }

  for (const section of lesson.sections) {
    if (wallOfText(section.body)) {
      issues.push(`Bölüm duvar metin: ${section.heading}`);
    }
    const check = section.check;
    if (!check) continue;
    if (check.answerIndex >= check.options.length) {
      issues.push(`Kontrol cevabı seçenek dışında: ${section.heading}`);
    }
    const normalized = check.options.map((o) => o.trim().toLocaleLowerCase("tr"));
    if (new Set(normalized).size !== normalized.length) {
      issues.push(`Kontrol seçenekleri tekrar ediyor: ${section.heading}`);
    }
    if (check.type === "trueFalse" && check.options.length !== 2) {
      issues.push(`Doğru/yanlış kontrolü iki seçenekli olmalı: ${section.heading}`);
    }
    // Çeldirici, doğru cevabın kopyası ya da "hiçbiri" türü dolgu olmamalı.
    if (normalized.some((o) => o === "hiçbiri" || o === "hepsi")) {
      issues.push(`Dolgu şık kullanılmış: ${section.heading}`);
    }
  }
  if (lesson.commonMistake.claim === lesson.commonMistake.correction) {
    issues.push("Yaygın hata ile düzeltme aynı olamaz.");
  }
  if (!lesson.objective.trim()) {
    issues.push("Öğrenme hedefi zorunlu.");
  }
  return issues;
}

/** Quiz pedagogy beyond basic schema parse. */
export function validateQuizPedagogy(
  questions: QuizQuestion[],
  options?: { requireObjective?: boolean },
): string[] {
  const issues: string[] = [];
  if (!questions.length) return ["Quiz sorusu yok."];

  for (let i = 0; i < questions.length; i += 1) {
    const q = questions[i];
    const label = `Soru ${i + 1}`;
    if (q.text.trim().length < 8) {
      issues.push(`${label}: soru metni çok kısa / belirsiz.`);
    }
    if (!q.explanation || q.explanation.trim().length < 8) {
      issues.push(`${label}: explanation zorunlu ve net olmalı.`);
    }
    if (q.multi && q.correct.length < 2) {
      issues.push(`${label}: multi=true iken en az iki bağımsız doğru gerekli.`);
    }
    if (!q.multi && q.correct.length !== 1) {
      issues.push(`${label}: tek doğru soruda tam bir correct olmalı.`);
    }
    const normalized = q.options.map(normalizeOption);
    if (new Set(normalized).size !== normalized.length) {
      issues.push(`${label}: eşdeğer / tekrar şıklar var.`);
    }
    for (const option of q.options) {
      if (META_OPTIONS.test(option.trim())) {
        issues.push(`${label}: hepsi/hiçbiri tarzı şık yasak.`);
      }
    }
    for (const correct of q.correct) {
      if (!q.options.includes(correct)) {
        issues.push(`${label}: correct options içinde değil.`);
      }
    }
    const obj = (q as QuizQuestion & { learningObjective?: string }).learningObjective;
    // Prefer objectives, but don't fail the whole set if one item omits it —
    // prompt + quality gate still push for them.
    if (options?.requireObjective && questions.length && i === 0 && (!obj || obj.trim().length < 4)) {
      const missingAll = questions.every(
        (item) => !(item as QuizQuestion & { learningObjective?: string }).learningObjective?.trim(),
      );
      if (missingAll) {
        issues.push("En az bir soruda learningObjective zorunlu.");
      }
    }
  }
  return issues;
}

export function validateTrueFalsePedagogy(
  items: {
    text: string;
    correct: boolean;
    explanation: string;
    correctedStatement?: string;
  }[],
): string[] {
  const issues: string[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const label = `Madde ${i + 1}`;
    if (VAGUE_TF.test(item.text) && item.text.split(/\s+/).length < 8) {
      issues.push(`${label}: belirsiz genelleme; somut iddia yaz.`);
    }
    if (!item.correct) {
      if (!item.correctedStatement?.trim()) {
        issues.push(`${label}: yanlış iddianın doğru hali eksik.`);
      } else if (item.correctedStatement.trim() === item.text.trim()) {
        issues.push(`${label}: correctedStatement iddiayla aynı.`);
      }
    }
    if (item.explanation.trim().length < 12) {
      issues.push(`${label}: explanation yetersiz.`);
    }
  }
  return issues;
}

export function validateFlashcardPedagogy(
  cards: { front: string; back: string; difficulty?: string }[],
): string[] {
  const issues: string[] = [];
  if (cards.length < 4) return ["En az 4 kart gerekli."];

  let hardFirstOk = true;
  let sawNonHard = false;
  for (let i = 0; i < cards.length; i += 1) {
    const card = cards[i];
    const label = `Kart ${i + 1}`;
    const front = card.front.trim();
    const back = card.back.trim();
    if (!front || !back) {
      issues.push(`${label}: ön/arka boş olamaz.`);
      continue;
    }
    if (front.toLocaleLowerCase("tr-TR").includes(back.toLocaleLowerCase("tr-TR")) && back.length > 3) {
      issues.push(`${label}: ön yüz cevabı sızdırıyor.`);
    }
    if (front === back) {
      issues.push(`${label}: ön ve arka aynı.`);
    }
    if (/[=:]\s*\S+/.test(front) && back.length < 40) {
      // "sin 30° = ?" is ok; "sin 30° = 1/2" on front leaks.
      const afterEq = front.split(/=/)[1]?.trim();
      if (afterEq && afterEq === back) {
        issues.push(`${label}: ön yüzde cevap var.`);
      }
    }
    if (card.difficulty === "hard" && sawNonHard) hardFirstOk = false;
    if (card.difficulty && card.difficulty !== "hard") sawNonHard = true;
  }
  if (!hardFirstOk) {
    issues.push("Zor kartlar (hard) listenin başına gelmeli.");
  }
  return issues;
}

const PODCAST_PHASES = [
  { key: "definition", re: /tan[iı]m|nedir|kavram/i },
  { key: "reason", re: /neden|niçin|gerekçe|anlam/i },
  { key: "example", re: /örnek|uygula|çöz/i },
  { key: "mistake", re: /hata|yan[iı]lg[iı]|yanl[iı]ş|tuzak/i },
  { key: "summary", re: /özet|kapan[iı]ş|sonuç|tekrar/i },
] as const;

export function validatePodcastPedagogy(
  input: { title?: string; chapters: PodcastChapter[] | { title: string; lines: { text: string }[] }[] },
): string[] {
  const issues: string[] = [];
  const chapters = input.chapters ?? [];
  if (chapters.length < 4) {
    issues.push("Podcast en az 4 bölüm olmalı (Tanım→Neden→Örnek→Hata→Özet).");
  }
  const titles = chapters.map((c) => c.title ?? "");
  const matched = PODCAST_PHASES.filter((phase) =>
    titles.some((t) => phase.re.test(t)),
  ).length;
  // Soft structure hint only when clearly unstructured (<4 chapters already failed).
  // Do not reject solely for title naming — quality gate covers pedagogy.
  if (chapters.length >= 4 && matched === 0) {
    issues.push(
      "Bölüm başlıkları Tanım / Neden / Örnek / Yaygın hata / Özet yapısını yansıtmalı.",
    );
  }
  for (const chapter of chapters) {
    if (!chapter.lines?.length) {
      issues.push(`Boş bölüm: ${chapter.title || "?"}`);
      continue;
    }
    for (const line of chapter.lines) {
      if (/\^|\\frac|\$\$/.test(line.text)) {
        issues.push("Formül konuşulabilir Unicode olmalı; LaTeX yok.");
      }
      // Sesli okunduğunda "2 üssü 3 artı 4" duyulur; kastedilen 2⁽³⁺⁴⁾ ise
      // öğrenci yanlış formülü duyar.
      if (brokenSuperscript(line.text)) {
        issues.push("Üs bölünmüş; üssün tamamı üst simge olmalı ya da hesaplanmalı.");
      }
    }
  }
  return issues;
}

export function validateOralPedagogy(
  questions: {
    prompt: string;
    learningObjective?: string;
    rubricCriteria?: string[];
    expectedPoints?: string[];
  }[],
): string[] {
  const issues: string[] = [];
  for (let i = 0; i < questions.length; i += 1) {
    const q = questions[i];
    const label = `Sözlü ${i + 1}`;
    if (q.prompt.trim().length < 8) issues.push(`${label}: soru kısa.`);
    if (!q.rubricCriteria?.length) {
      issues.push(`${label}: rubricCriteria zorunlu.`);
    }
    if (!q.expectedPoints?.length) {
      issues.push(`${label}: expectedPoints zorunlu.`);
    }
  }
  return issues;
}

/**
 * Flashcard completion under v2: finishing the deck is participation,
 * not exam mastery. Known marks are recorded separately for Stage 6.
 */
export function scoreFlashcardsV2(
  cardCount: number,
  answers: Record<string, unknown>,
): { score: number; total: number; knownCount: number; masteryClaim: false } {
  let knownCount = 0;
  for (let i = 0; i < cardCount; i += 1) {
    if (answers[String(i)] === true || answers[String(i)] === "true") knownCount += 1;
  }
  return {
    score: cardCount > 0 ? 1 : 0,
    total: 1,
    knownCount,
    masteryClaim: false,
  };
}

/** Collect misconception hooks from a completed attempt (cheap Stage 6 prep). */
export function extractMisconceptions(input: {
  kind: PlanNodeKind;
  payload: unknown;
  answers: Record<string, unknown>;
  topicLabel?: string | null;
}): MisconceptionDraft[] {
  const data = (input.payload ?? {}) as Record<string, unknown>;
  const out: MisconceptionDraft[] = [];
  const topicLabel = input.topicLabel ?? null;

  if (data.type === "true_false") {
    const items =
      (data.items as {
        text: string;
        correct: boolean;
        correctedStatement?: string;
        misconceptionTag?: string;
        explanation?: string;
      }[]) ?? [];
    items.forEach((item, index) => {
      const value = input.answers[String(index)];
      const ok = value === item.correct || value === String(item.correct);
      if (ok) return;
      out.push({
        claim: item.text,
        corrected: item.correctedStatement ?? item.explanation ?? null,
        wrongType: item.misconceptionTag?.trim() || "true_false_miss",
        sourceKind: "true_false",
        topicLabel,
        questionPreview: item.text.slice(0, 160),
      });
    });
  }

  if (data.type === "quiz") {
    const questions =
      (data.questions as (QuizQuestion & { misconceptionTag?: string; learningObjective?: string })[]) ??
      [];
    questions.forEach((question, index) => {
      const raw = input.answers[String(index)];
      const selected = Array.isArray(raw)
        ? raw.map(String)
        : raw == null || raw === ""
          ? []
          : [String(raw)];
      const a = [...selected].sort().join("|");
      const b = [...question.correct].sort().join("|");
      if (a === b) return;
      out.push({
        claim: selected.join(", ") || "(boş)",
        corrected: question.correct.join(", "),
        wrongType: question.misconceptionTag?.trim() || "quiz_miss",
        sourceKind: input.kind,
        topicLabel,
        questionPreview: question.text.slice(0, 160),
      });
    });
  }

  return out.slice(0, 20);
}
