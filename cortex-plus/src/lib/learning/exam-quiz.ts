import { z } from "zod";

export type QuizQuestion = {
  text: string;
  options: string[];
  correct: string[];
  multi: boolean;
  explanation?: string;
};

export type PublicQuizQuestion = {
  text: string;
  options: string[];
  multi: boolean;
  correct?: string[];
  explanation?: string;
};

const correctValueSchema = z.union([z.string(), z.number()]);

export const quizQuestionSchema = z.object({
  text: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(6),
  correct: z.union([correctValueSchema, z.array(correctValueSchema).min(1)]),
  multi: z.boolean().optional(),
  explanation: z.string().optional(),
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
}): QuizQuestion | null {
  const options = [...new Set(raw.options.map((item) => item.trim()).filter(Boolean))];
  const corrects = resolveCorrects(options, raw.correct);
  if (!raw.text.trim() || options.length < 2 || !corrects.length) return null;
  return {
    text: raw.text.trim(),
    options,
    correct: corrects,
    multi: raw.multi === true || corrects.length > 1,
    explanation: raw.explanation?.trim() || undefined,
  };
}

export function publicQuizQuestion(question: QuizQuestion): PublicQuizQuestion {
  return {
    text: question.text,
    options: question.options,
    multi: question.multi,
    correct: question.correct,
    explanation: question.explanation,
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
  if (!parsed.success) return null;
  const questions = parsed.data.questions
    .map(normalizeQuizQuestion)
    .filter((question): question is QuizQuestion => question !== null);
  return questions.length ? questions : null;
}
