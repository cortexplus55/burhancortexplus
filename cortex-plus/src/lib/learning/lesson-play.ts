/**
 * Derste kontrol cevapları istemciye cevaptan önce gitmez.
 * Tam ders deneme yükünde kalır; oynatıcıya sızdırılmış paket gider.
 * Notlandırma sunucuda yapılır.
 */

import { z } from "zod";
import type { LessonV2, SectionCheck } from "@/lib/learning/teaching-standards";

export type LessonCheckAnswer = {
  /** mcq / trueFalse / findError seçilen şık. */
  pick?: number;
  /** numerical / explain yazılı yanıt. */
  text?: string;
};

export type PublicSectionCheck = Omit<
  SectionCheck,
  "answerIndex" | "answer" | "expectedPoints" | "optionWhy" | "whyRight" | "whyWrong" | "explanation"
> & {
  /** Açıklama cevaptan sonra sunucudan gelir; oynatmada yok. */
  explanation?: string;
  /** Hatayı bul: satırlar (hatalı satır kimliği yok). */
  lines?: string[];
};

export type PublicLessonV2 = Omit<LessonV2, "sections" | "findError" | "numericalCheck" | "infoCheck"> & {
  sections: Array<
    Omit<LessonV2["sections"][number], "check"> & {
      check?: PublicSectionCheck;
    }
  >;
  findError?: { prompt: string; options: string[]; faultyText?: string };
  numericalCheck?: { prompt: string };
  infoCheck?: { prompt: string };
  /** Kurucu kalite raporu — yalnız isAdmin yanıtında. */
  qualityReport?: QualityReportEntry[];
};

/** İstemci oynatma şeması: cevap alanları yok; explanation isteğe bağlı. */
export const publicSectionCheckSchema = z.object({
  type: z.enum(["mcq", "trueFalse", "numerical", "explain", "findError"]),
  prompt: z.string().min(8).max(400),
  options: z.array(z.string().min(1).max(200)).min(2).max(6).optional(),
  faultyText: z.string().min(8).max(400).optional(),
  lines: z.array(z.string().min(1).max(200)).min(1).max(8).optional(),
  explanation: z.string().max(600).optional(),
  // Eski istemci / açılış yolu hâlâ dolu cevap taşıyabilir; yoksa sunucu notlar.
  answerIndex: z.number().int().min(0).max(5).optional(),
  answer: z.string().min(1).max(80).optional(),
  expectedPoints: z.array(z.string().min(2).max(200)).min(1).max(4).optional(),
  optionWhy: z.array(z.string().max(200)).max(6).optional(),
  whyRight: z.string().max(300).optional(),
  whyWrong: z.string().max(300).optional(),
  misconception: z.string().max(140).optional(),
  hint: z.string().max(200).optional(),
});

export const publicLessonV2Schema = z.object({
  title: z.string().min(2).max(160),
  overview: z.string().optional(),
  objective: z.string().optional(),
  sections: z
    .array(
      z.object({
        heading: z.string().min(1).max(160),
        body: z.string().min(1),
        check: publicSectionCheckSchema.optional(),
        note: z
          .object({
            title: z.string(),
            body: z.string(),
            tone: z.enum(["warn", "info", "unit"]).optional(),
          })
          .optional(),
        cards: z
          .array(z.object({ title: z.string(), body: z.string() }))
          .optional(),
        diagram: z.unknown().optional(),
      }),
    )
    .min(1),
  example: z
    .object({
      prompt: z.string(),
      solution: z.string(),
      givens: z.array(z.string()).optional(),
      unknown: z.string().optional(),
      steps: z.array(z.string()).optional(),
      result: z.string().optional(),
    })
    .optional(),
  commonMistake: z.object({ claim: z.string(), correction: z.string() }).optional(),
  summary: z.array(z.string()).optional(),
  nextFocus: z.array(z.string()).optional(),
  findError: z
    .object({
      prompt: z.string(),
      options: z.array(z.string()),
      faultyText: z.string().optional(),
    })
    .optional(),
  numericalCheck: z.object({ prompt: z.string() }).optional(),
  infoCheck: z.object({ prompt: z.string() }).optional(),
  qualityReport: z.array(z.object({ rule: z.string(), excerpt: z.string() })).optional(),
});

export type QualityReportEntry = {
  rule: string;
  excerpt: string;
};

function asCheck(value: unknown): SectionCheck | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as SectionCheck;
  if (typeof row.prompt !== "string" || typeof row.type !== "string") return null;
  return row;
}

/** Kontrolün öğrenciye gidecek yüzü: cevap ve gerekçe yok. */
export function sealSectionCheck(check: SectionCheck): PublicSectionCheck {
  const {
    answerIndex: _a,
    answer: _b,
    expectedPoints: _c,
    optionWhy: _d,
    whyRight: _e,
    whyWrong: _f,
    misconception: _g,
    hint: _h,
    explanation: _i,
    review: _j,
    ...visible
  } = check;
  void _a;
  void _b;
  void _c;
  void _d;
  void _e;
  void _f;
  void _g;
  void _h;
  void _i;
  void _j;

  const sealed: PublicSectionCheck = {
    type: visible.type,
    prompt: visible.prompt,
    ...(visible.options ? { options: visible.options } : {}),
    ...(visible.faultyText && visible.type === "findError"
      ? {
          // Satırlar öğrenciye gösterilir; hangisinin hatalı olduğu yok.
          lines: visible.faultyText
            .split(/\n+/)
            .map((line) => line.trim())
            .filter(Boolean),
        }
      : visible.faultyText
        ? { faultyText: visible.faultyText }
        : {}),
  };
  return sealed;
}

/** Tam ders → oynatma paketi. */
export function sealLessonForPlay(lesson: LessonV2): PublicLessonV2 {
  return {
    ...lesson,
    sections: lesson.sections.map((section) => ({
      ...section,
      check: section.check ? sealSectionCheck(section.check) : undefined,
    })),
    findError: lesson.findError
      ? {
          prompt: lesson.findError.prompt,
          options: lesson.findError.options,
          faultyText: lesson.findError.faultyText,
        }
      : undefined,
    numericalCheck: lesson.numericalCheck
      ? { prompt: lesson.numericalCheck.prompt }
      : undefined,
    infoCheck: lesson.infoCheck ? { prompt: lesson.infoCheck.prompt } : undefined,
  };
}

function fold(text: string): string {
  return text.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
}

/** Sayısal yanıt: "0,5 mol" ≈ "0.5 mol"; birim yoksa yarım puan. */
export function gradeNumericalAnswer(
  given: string,
  expected: string,
): { correct: boolean; half?: boolean; message: string } {
  const want = fold(expected);
  const got = fold(given);
  if (!got) return { correct: false, message: `Doğrusu ${expected}` };

  const wantNum = want.match(/-?\d+(?:[.,]\d+)?/);
  const gotNum = got.match(/-?\d+(?:[.,]\d+)?/);
  if (!wantNum || !gotNum) {
    return { correct: got === want, message: got === want ? `Doğru — ${expected}` : `Doğrusu ${expected}` };
  }
  const a = Number(wantNum[0].replace(",", "."));
  const b = Number(gotNum[0].replace(",", "."));
  const scale = Math.max(Math.abs(a), 1);
  const close = Math.abs(a - b) <= Math.max(1e-9, 0.005 * scale);
  if (!close) return { correct: false, message: `Doğrusu ${expected}` };

  const wantUnit = want.replace(wantNum[0], "").replace(/\s+/g, "");
  const gotUnit = got.replace(gotNum[0], "").replace(/\s+/g, "");
  if (wantUnit && !gotUnit) {
    return {
      correct: false,
      half: true,
      message: "Sayı doğru, birimi yazmayı unutma.",
    };
  }
  if (wantUnit && gotUnit && wantUnit !== gotUnit) {
    return { correct: false, message: `Doğrusu ${expected}` };
  }
  return { correct: true, message: `Doğru — ${expected}` };
}

function stemTokens(text: string): string[] {
  return fold(text)
    .split(/[^a-z0-9çğıöşü]+/i)
    .filter((token) => token.length >= 3);
}

/** Explain: beklenen noktaların kaçının karşılandığı. */
export function gradeExplainAnswer(
  given: string,
  points: string[],
): { matched: boolean[]; score: number; total: number; summary: string } {
  const tokens = stemTokens(given);
  const matched = points.map((point) => {
    const need = stemTokens(point);
    if (!need.length) return tokens.length >= 3;
    const hits = need.filter((stem) =>
      tokens.some((token) => token === stem || token.startsWith(stem) || stem.startsWith(token)),
    );
    return hits.length >= Math.min(2, need.length);
  });
  const score = matched.filter(Boolean).length;
  return {
    matched,
    score,
    total: points.length,
    summary: `${points.length} noktadan ${score}'sini karşıladın.`,
  };
}

export type GradeCheckResult = {
  correct: boolean;
  half?: boolean;
  message?: string;
  explanation?: string;
  optionWhy?: string[];
  whyRight?: string;
  whyWrong?: string;
  misconception?: string;
  hint?: string;
  answerIndex?: number;
  answer?: string;
  expectedPoints?: string[];
  pointMatches?: boolean[];
};

/** Tek kontrolü sunucuda notlar. */
export function gradeSectionCheck(
  check: SectionCheck,
  answer: LessonCheckAnswer,
): GradeCheckResult {
  const base = {
    explanation: check.explanation,
    optionWhy: check.optionWhy,
    whyRight: check.whyRight,
    whyWrong: check.whyWrong,
    misconception: check.misconception,
    hint: check.hint,
    answerIndex: check.answerIndex,
    answer: check.answer,
    expectedPoints: check.expectedPoints,
  };

  if (check.type === "numerical") {
    const graded = gradeNumericalAnswer(answer.text ?? "", check.answer ?? "");
    return { ...base, correct: graded.correct, half: graded.half, message: graded.message };
  }

  if (check.type === "explain") {
    const points = check.expectedPoints?.length ? check.expectedPoints : [check.explanation];
    const graded = gradeExplainAnswer(answer.text ?? "", points);
    return {
      ...base,
      correct: graded.score >= Math.ceil(graded.total * 0.6),
      message: graded.summary,
      pointMatches: graded.matched,
      expectedPoints: points,
    };
  }

  if (typeof answer.pick === "number" && typeof check.answerIndex === "number") {
    const correct = answer.pick === check.answerIndex;
    return { ...base, correct };
  }

  return { ...base, correct: false };
}

/**
 * Tam dersten skor. `lessonAnswers` tercih edilir; eski `lessonMisses` yedeği kalır.
 */
export function scoreLessonFromAnswers(
  lesson: { sections?: { check?: unknown }[] } | null | undefined,
  answers: Record<string, unknown>,
): { score: number; total: number; retried: number } {
  const sections = lesson?.sections ?? [];
  const checked = sections
    .map((section, index) => (section.check ? index : -1))
    .filter((index) => index >= 0);
  if (!checked.length) return { score: 1, total: 1, retried: 0 };

  const rawAnswers = answers.lessonAnswers;
  if (rawAnswers && typeof rawAnswers === "object" && !Array.isArray(rawAnswers)) {
    let score = 0;
    for (const index of checked) {
      const check = asCheck(sections[index]?.check);
      if (!check) continue;
      const entry = (rawAnswers as Record<string, LessonCheckAnswer>)[String(index)] ??
        (rawAnswers as Record<string, LessonCheckAnswer>)[index as unknown as string];
      if (!entry) continue;
      const graded = gradeSectionCheck(check, entry);
      if (graded.correct || graded.half) score += graded.half ? 0.5 : 1;
    }
    const missed = checked.length - Math.floor(score);
    return {
      score: Math.round(score),
      total: checked.length,
      retried: Math.max(0, missed),
    };
  }

  // Eski istemci: lessonMisses listesine güvenir (geriye dönük).
  const raw = answers.lessonMisses;
  const missed = new Set<number>();
  if (Array.isArray(raw)) {
    for (const value of raw) {
      if (typeof value === "number" && Number.isInteger(value) && checked.includes(value)) {
        missed.add(value);
      }
    }
  }
  return {
    score: checked.length - missed.size,
    total: checked.length,
    retried: missed.size,
  };
}

/** optionWhy satırları birbirinden yeterince farklı mı? */
export function optionWhyUniqueIssues(check: SectionCheck): string[] {
  if (!check.optionWhy?.length || check.optionWhy.length < 2) return [];
  const issues: string[] = [];
  const folded = check.optionWhy.map((line) => fold(line));
  for (let i = 0; i < folded.length; i += 1) {
    for (let j = i + 1; j < folded.length; j += 1) {
      const a = new Set(stemTokens(folded[i]));
      const b = new Set(stemTokens(folded[j]));
      if (!a.size || !b.size) continue;
      let shared = 0;
      for (const token of a) if (b.has(token)) shared += 1;
      const union = a.size + b.size - shared;
      const jaccard = union ? shared / union : 0;
      if (jaccard >= 0.8 || folded[i] === folded[j]) {
        issues.push("optionWhy satırları birbirinin tekrarı.");
        return issues;
      }
    }
  }
  return issues;
}

/** Kelime 3-gram Jaccard örtüşmesi. */
export function trigramJaccard(left: string, right: string): number {
  const grams = (text: string) => {
    const words = fold(text).split(/\s+/).filter(Boolean);
    const out = new Set<string>();
    for (let i = 0; i <= words.length - 3; i += 1) {
      out.add(words.slice(i, i + 3).join(" "));
    }
    return out;
  };
  const a = grams(left);
  const b = grams(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return shared / (a.size + b.size - shared);
}

export function isHighOverlap(left: string, right: string, threshold = 0.7): boolean {
  if (fold(left).includes(fold(right)) || fold(right).includes(fold(left))) {
    if (Math.min(left.length, right.length) >= 24) return true;
  }
  return trigramJaccard(left, right) >= threshold;
}
