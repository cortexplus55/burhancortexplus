import type { QuizQuestion } from "@/lib/learning/exam-quiz";
import { sameOptionSet, selectedOptions } from "@/lib/learning/exam-quiz";
import { normalizeTopicKey } from "@/lib/learning/learning-tracking";
import {
  reviewQuestionFor,
  type MaterialLanguage,
  type StoredReview,
} from "@/lib/learning/teacher-brain";

export type PracticeMisconception = {
  topicLabel?: string | null;
  wrongType?: string | null;
  sourceKind?: string | null;
  questionPreview?: string | null;
};

export type PracticeMastery = {
  topicKey: string;
  level: string;
  measured: boolean;
  independentCorrect?: number;
  independentTotal?: number;
};

export type StoredQuizAttempt = {
  topic: string;
  kind: string;
  questions: (QuizQuestion & { review?: StoredReview | null })[];
  answers: Record<string, unknown>;
};

export type StoredLessonCheck = {
  topic: string;
  heading: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  review?: StoredReview | null;
};

const WEAK_SOURCES = new Set(["lesson_review", "written_exam", "quiz", "gaps", "focused"]);

export function collectWeakTopics(input: {
  mastery: PracticeMastery[];
  misconceptions: PracticeMisconception[];
  missedTopics: string[];
  plannedTopics: string[];
}): string[] {
  const planned = input.plannedTopics.map((topic) => topic.trim()).filter(Boolean);
  const display = (key: string) =>
    planned.find((topic) => normalizeTopicKey(topic) === normalizeTopicKey(key)) ?? key.trim();
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (label: string | null | undefined) => {
    const text = (label ?? "").trim();
    if (!text) return;
    const key = normalizeTopicKey(text);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(display(text));
  };

  for (const row of input.mastery) {
    if (!row.measured) continue;
    const weakLevel = row.level === "weak";
    const low =
      row.level === "emerging" &&
      (row.independentTotal ?? 0) > 0 &&
      (row.independentCorrect ?? 0) / (row.independentTotal ?? 1) < 0.5;
    if (weakLevel || low) push(row.topicKey);
  }
  for (const row of input.misconceptions) {
    const kind = row.sourceKind ?? "";
    const type = row.wrongType ?? "";
    if (
      kind === "lesson_review" ||
      type === "lesson_check_miss" ||
      WEAK_SOURCES.has(kind) ||
      type.endsWith("_miss")
    ) {
      push(row.topicLabel);
    }
  }
  for (const topic of input.missedTopics) push(topic);
  return out;
}

export function rewordPracticeQuestion(
  question: QuizQuestion & { review?: StoredReview | null },
  language: MaterialLanguage = "tr",
): QuizQuestion {
  const answerIndex = question.options.findIndex((option) => option === question.correct[0]);
  if (question.correct.length !== 1 || answerIndex < 0) return question;
  const next = reviewQuestionFor(
    {
      type: "mcq",
      prompt: question.text,
      options: question.options,
      answerIndex,
      explanation: question.explanation?.trim() || question.options.join(". "),
      review: question.review ?? null,
    },
    language,
  );
  const correct = next.options[next.answerIndex];
  if (!correct) return question;
  return {
    ...question,
    text: next.prompt,
    options: next.options,
    correct: [correct],
  };
}

export function missedFromAttempt(attempt: StoredQuizAttempt): QuizQuestion[] {
  const out: QuizQuestion[] = [];
  attempt.questions.forEach((question, index) => {
    if (!question.text?.trim() || question.options.length < 2 || !question.correct.length) return;
    const selected = selectedOptions(attempt.answers[String(index)]);
    if (sameOptionSet(selected, question.correct)) return;
    out.push({ ...question, topic: question.topic?.trim() || attempt.topic });
  });
  return out;
}

export function questionsFromLessonChecks(
  checks: StoredLessonCheck[],
): (QuizQuestion & { review?: StoredReview | null })[] {
  const out: (QuizQuestion & { review?: StoredReview | null })[] = [];
  for (const check of checks) {
    const correct = check.options[check.answerIndex];
    if (!correct || check.options.length < 2 || !check.prompt.trim()) continue;
    out.push({
      text: check.prompt,
      options: check.options,
      correct: [correct],
      multi: false,
      explanation: check.explanation.trim() || undefined,
      topic: check.topic,
      learningObjective: check.heading,
      review: check.review ?? null,
    });
  }
  return out;
}

function fold(text: string): string {
  return text.trim().toLocaleLowerCase("tr").replace(/\s+/g, " ");
}

export function assembleFocusedPractice(input: {
  weakTopics: string[];
  missed: (QuizQuestion & { review?: StoredReview | null })[];
  lessonQuestions: (QuizQuestion & { review?: StoredReview | null })[];
  /** lesson_review satırının saklı kökü. Eşleşen ders sorusu öne alınır. */
  reviewPrompts?: string[];
  limit: number;
  language?: MaterialLanguage;
}): {
  questions: QuizQuestion[];
  uncoveredTopics: string[];
  reused: boolean;
} {
  const weak = new Set(input.weakTopics.map((topic) => normalizeTopicKey(topic)));
  const wanted = (topic: string | undefined) =>
    Boolean(topic) && weak.has(normalizeTopicKey(topic));
  const reviewKeys = new Set((input.reviewPrompts ?? []).map(fold).filter((text) => text.length >= 8));

  const ranked: { question: QuizQuestion; rank: number }[] = [];
  const seen = new Set<string>();
  const push = (question: QuizQuestion & { review?: StoredReview | null }, rank: number) => {
    const reworded = rewordPracticeQuestion(question, input.language ?? "tr");
    const key = fold(reworded.text);
    if (key.length < 8 || seen.has(key)) return;
    if (!wanted(reworded.topic)) return;
    seen.add(key);
    ranked.push({ question: reworded, rank });
  };

  for (const question of input.lessonQuestions) {
    const storedPrompt = question.review?.prompt ?? "";
    const promptRank =
      reviewKeys.has(fold(question.text)) || reviewKeys.has(fold(storedPrompt)) ? 0 : 2;
    push(question, promptRank);
  }
  for (const question of input.missed) {
    push(question, 1);
  }

  ranked.sort((a, b) => a.rank - b.rank);
  const questions = ranked.slice(0, Math.max(1, input.limit)).map((row) => row.question);
  const covered = new Set(questions.map((question) => normalizeTopicKey(question.topic)));
  const uncoveredTopics = input.weakTopics.filter(
    (topic) => !covered.has(normalizeTopicKey(topic)),
  );
  return { questions, uncoveredTopics, reused: questions.length > 0 };
}
