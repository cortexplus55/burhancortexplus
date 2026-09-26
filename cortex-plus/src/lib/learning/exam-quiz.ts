import { z } from "zod";

export type QuizQuestion = {
  text: string;
  options: string[];
  correct: string[];
  multi: boolean;
  explanation?: string;
  /** Stage 5 teaching standard — clear per-item objective. */
  learningObjective?: string;
  /** Stage 5/6 — dominant misconception this item targets. */
  misconceptionTag?: string;
  /** Yanlış şık → o şıkka özgü hata gerekçesi (tekrar eden şablon yasak). */
  optionReasons?: Record<string, string>;
  /** Aynı üretim çağrısında, her şık için bir cümle. */
  optionWhy?: string[];
  /** Hazırlıktaki konu adı. Bilinmeyen ad sınav sonunda gösterilmez. */
  topic?: string;
  /** İkinci çözücü bunu görür. Öğrenciye gitmez. */
  needsSolver?: boolean;
};

export type PublicQuizQuestion = {
  text: string;
  options: string[];
  multi: boolean;
  correct?: string[];
  explanation?: string;
  optionWhy?: string[];
  misconceptionTag?: string;
};

const correctValueSchema = z.union([z.string(), z.number()]);

export const quizQuestionSchema = z.object({
  text: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(6),
  correct: z.union([correctValueSchema, z.array(correctValueSchema).min(1)]),
  multi: z.boolean().optional(),
  explanation: z.string().optional(),
  learningObjective: z.string().min(8).max(200).optional().catch(undefined),
  misconceptionTag: z.string().min(2).max(80).optional().catch(undefined),
  optionReasons: z.record(z.string(), z.string().min(8).max(400)).optional(),
  topic: z.string().min(2).max(80).optional(),
});

export const quizPayloadSchema = z.object({
  questions: z.array(quizQuestionSchema).min(3).max(8),
});

function stripChoicePrefix(text: string) {
  return text.replace(/^[A-Da-d][).:\-]\s*/, "").trim();
}

function resolveCorrects(options: string[], raw: unknown): string[] {
  const values = Array.isArray(raw) ? raw : [raw];
  const resolved: string[] = [];
  for (const value of values) {
    if (typeof value === "number" && Number.isInteger(value)) {
      const byIndex = options[value] ?? options[value - 1];
      if (byIndex) resolved.push(byIndex);
      continue;
    }
    const text = String(value ?? "").trim();
    if (!text) continue;
    if (options.includes(text)) {
      resolved.push(text);
      continue;
    }
    const stripped = stripChoicePrefix(text);
    const byText = options.find(
      (option) => option === stripped || stripChoicePrefix(option) === stripped,
    );
    if (byText) {
      resolved.push(byText);
      continue;
    }
    const letter = text.replace(/[^A-Za-z]/g, "").toUpperCase();
    if (letter.length === 1) {
      const option = options[letter.charCodeAt(0) - 65];
      if (option) resolved.push(option);
      continue;
    }
    const num = Number(text);
    if (Number.isInteger(num)) {
      const option = options[num] ?? options[num - 1];
      if (option) resolved.push(option);
    }
  }
  return [...new Set(resolved)];
}

export function normalizeQuizQuestion(raw: {
  text: string;
  options: string[];
  correct: string | number | (string | number)[] | string[] | number[];
  multi?: boolean;
  explanation?: string;
  learningObjective?: string;
  misconceptionTag?: string;
  optionReasons?: Record<string, string>;
  optionWhy?: string[];
  topic?: string;
}): QuizQuestion | null {
  const options = [...new Set(raw.options.map((item) => item.trim()).filter(Boolean))];
  const corrects = resolveCorrects(options, raw.correct);
  if (!raw.text.trim() || options.length < 2 || !corrects.length) return null;
  const optionReasons = raw.optionReasons
    ? Object.fromEntries(
        Object.entries(raw.optionReasons)
          .map(([key, value]) => [key.trim(), String(value).trim()] as const)
          .filter(([, value]) => value.length >= 8),
      )
    : undefined;
  return {
    text: raw.text.trim(),
    options,
    correct: corrects,
    multi: raw.multi === true || corrects.length > 1,
    explanation: raw.explanation?.trim() || undefined,
    learningObjective: raw.learningObjective?.trim() || undefined,
    misconceptionTag: raw.misconceptionTag?.trim() || undefined,
    optionReasons:
      optionReasons && Object.keys(optionReasons).length ? optionReasons : undefined,
    optionWhy: Array.isArray(raw.optionWhy)
      ? raw.optionWhy.map((line) => line.trim()).filter((line) => line.length >= 8)
      : undefined,
    topic: raw.topic?.trim() || undefined,
  };
}

/** Yazılı deneme sırasında istemciye giden soru. Doğru şık ve açıklama yok. */
export function sealedQuizQuestion(question: QuizQuestion): PublicQuizQuestion {
  return {
    text: question.text,
    options: question.options,
    multi: question.multi,
  };
}

export function publicQuizQuestion(question: QuizQuestion): PublicQuizQuestion {
  return {
    text: question.text,
    options: question.options,
    multi: question.multi,
    correct: question.correct,
    explanation: question.explanation,
    optionWhy: question.optionWhy,
    misconceptionTag: question.misconceptionTag,
  };
}

export function selectedOptions(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value == null || value === "") return [];
  return [String(value)];
}

export function sameOptionSet(left: string[], right: string[]) {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export function scoreQuizAnswers(
  questions: QuizQuestion[],
  answers: Record<string, unknown>,
) {
  let score = 0;
  questions.forEach((question, index) => {
    if (sameOptionSet(selectedOptions(answers[String(index)]), question.correct)) {
      score += 1;
    }
  });
  return { score, total: questions.length || 1 };
}

export function parseQuizQuestions(raw: unknown): QuizQuestion[] | null {
  const parsed = quizPayloadSchema.safeParse(raw);
  if (!parsed.success) return coerceQuizQuestions(raw);
  const questions = parsed.data.questions
    .map(normalizeQuizQuestion)
    .filter((question): question is QuizQuestion => question !== null);
  return questions.length >= 3 ? questions : coerceQuizQuestions(raw);
}

/** Tek bozuk soru seti düşürmez. En az üç sağlam soru kalırsa üretim sürer. */
export function coerceQuizQuestions(raw: unknown): QuizQuestion[] | null {
  const row = raw && typeof raw === "object" ? (raw as { questions?: unknown }) : null;
  const list = Array.isArray(row?.questions) ? row.questions : null;
  if (!list) return null;
  const questions = list.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const text = typeof record.text === "string"
      ? record.text
      : typeof record.question === "string"
        ? record.question
        : "";
    const options = Array.isArray(record.options) ? record.options.map((option) => String(option)) : [];
    const optionWhy = Array.isArray(record.optionWhy)
      ? record.optionWhy.filter((line): line is string => typeof line === "string")
      : undefined;
    const optionReasons =
      record.optionReasons && typeof record.optionReasons === "object"
        ? (record.optionReasons as Record<string, string>)
        : undefined;
    const normalized = normalizeQuizQuestion({
      text,
      options,
      correct: (record.correct ?? record.answer ?? record.answerIndex) as string | number | (string | number)[],
      multi: record.multi === true,
      explanation: typeof record.explanation === "string" ? record.explanation : undefined,
      learningObjective: typeof record.learningObjective === "string" ? record.learningObjective : undefined,
      misconceptionTag: typeof record.misconceptionTag === "string" ? record.misconceptionTag : undefined,
      optionReasons,
      optionWhy,
      topic: typeof record.topic === "string" ? record.topic : undefined,
    });
    return normalized ? [normalized] : [];
  });
  return questions.length >= 3 ? questions.slice(0, 8) : null;
}
