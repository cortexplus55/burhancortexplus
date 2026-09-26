/**
 * Yazılı deneme notlandırması — deterministik türler + çok cevaplı kısmi puan.
 */

import { sameOptionSet, selectedOptions } from "@/lib/learning/exam-quiz";
import type { MockGradeItem, MockQuestionType, MockRubricItem } from "@/lib/learning/mock-exam/types";

export type GradeableQuestion = {
  id: string;
  type: MockQuestionType;
  correctAnswers: string[];
  /** Eski kayıt yedeği. */
  correctAnswer?: string | null;
  points: number;
  explanation?: string | null;
  topicId?: string | null;
  topicLabel?: string | null;
  numericExpected?: number | null;
  numericUnit?: string | null;
  numericTolerance?: number | null;
  rubric?: MockRubricItem[] | null;
  modelAnswer?: string | null;
};

/**
 * Çok cevaplı kısmi puan:
 * max(0, (doğru seçilen − yanlış seçilen) / doğru sayısı) × puan
 */
export function multiMcqPoints(
  selected: string[],
  correct: string[],
  maxPoints: number,
): { earned: number; full: boolean } {
  const correctSet = new Set(correct.map(norm));
  const selectedSet = [...new Set(selected.map(norm).filter(Boolean))];
  if (!correctSet.size) return { earned: 0, full: false };
  if (sameOptionSet(selectedSet, [...correctSet])) {
    return { earned: maxPoints, full: true };
  }
  let hit = 0;
  let miss = 0;
  for (const pick of selectedSet) {
    if (correctSet.has(pick)) hit += 1;
    else miss += 1;
  }
  const ratio = Math.max(0, (hit - miss) / correctSet.size);
  return { earned: Math.round(ratio * maxPoints * 1000) / 1000, full: false };
}

export function gradeNumericAnswer(
  raw: string,
  expected: number,
  unit: string | null | undefined,
  tolerance: number | null | undefined,
  maxPoints: number,
): { earned: number; verdict: MockGradeItem["verdict"]; unitMissing: boolean } {
  const trimmed = raw.trim();
  if (!trimmed) return { earned: 0, verdict: "bos", unitMissing: false };
  const num = parseStudentNumber(trimmed);
  if (num == null) return { earned: 0, verdict: "yanlis", unitMissing: false };
  const tol = tolerance ?? Math.max(1e-6, Math.abs(expected) * 0.01);
  const inRange = Math.abs(num - expected) <= tol;
  if (!inRange) return { earned: 0, verdict: "yanlis", unitMissing: false };
  const needUnit = Boolean(unit?.trim());
  const hasUnit =
    !needUnit ||
    fold(trimmed).includes(fold(unit!)) ||
    unitAliasMatch(trimmed, unit!);
  if (needUnit && !hasUnit) {
    return { earned: maxPoints / 2, verdict: "kismen", unitMissing: true };
  }
  return { earned: maxPoints, verdict: "dogru", unitMissing: false };
}

/**
 * Rubrik: karşılanan madde sayısı / toplam × puan.
 * Alıntı yoksa karar geçersiz (0).
 */
export function gradeRubricAnswer(
  answer: string,
  rubric: MockRubricItem[],
  quotes: Array<{ criterion: string; quote: string }>,
): { earned: number; max: number; met: string[]; missed: string[]; invalid: boolean } {
  const max = rubric.reduce((s, r) => s + r.points, 0) || 1;
  if (!answer.trim()) {
    return { earned: 0, max, met: [], missed: rubric.map((r) => r.criterion), invalid: false };
  }
  const quoteBy = new Map(
    quotes
      .filter((q) => q.quote.trim() && fold(answer).includes(fold(q.quote)))
      .map((q) => [fold(q.criterion), q.quote.trim()]),
  );
  // Alıntısız model kararı geçersiz
  if (!quoteBy.size && rubric.length > 0) {
    return { earned: 0, max, met: [], missed: rubric.map((r) => r.criterion), invalid: true };
  }
  const met: string[] = [];
  const missed: string[] = [];
  let earned = 0;
  for (const row of rubric) {
    if (quoteBy.has(fold(row.criterion))) {
      met.push(row.criterion);
      earned += row.points;
    } else {
      missed.push(row.criterion);
    }
  }
  return { earned, max, met, missed, invalid: false };
}

export function resolveCorrectAnswers(q: GradeableQuestion): string[] {
  if (q.correctAnswers?.length) return q.correctAnswers;
  if (q.correctAnswer?.trim()) {
    // Eski join("|") kayıtları
    if (q.correctAnswer.includes("|")) {
      return q.correctAnswer.split("|").map((s) => s.trim()).filter(Boolean);
    }
    return [q.correctAnswer.trim()];
  }
  return [];
}

export function gradeDeterministicItem(
  question: GradeableQuestion,
  answerRaw: unknown,
): MockGradeItem {
  const pointsMax = question.points || 1;
  const topicLabel = question.topicLabel?.trim() || "Konu";
  const selected = selectedOptions(answerRaw);
  const joined = selected.join("|");
  const explanation = question.explanation?.trim() || "";
  const correct = resolveCorrectAnswers(question);

  if (!selected.length || (selected.length === 1 && !selected[0].trim())) {
    return baseItem(question, "", 0, pointsMax, "bos", explanation, topicLabel);
  }

  if (question.type === "mcq" || question.type === "true_false") {
    const ok = sameOptionSet(selected, correct.length ? correct : [correct[0] ?? ""]);
    // true_false: "Doğru"/"Yanlış" veya doğru önerme metni
    const altOk =
      question.type === "true_false" &&
      correct.some((c) => fold(c) === fold(selected[0] ?? ""));
    const hit = ok || altOk;
    return baseItem(
      question,
      joined,
      hit ? pointsMax : 0,
      pointsMax,
      hit ? "dogru" : "yanlis",
      explanation,
      topicLabel,
    );
  }

  if (question.type === "multi_mcq") {
    const { earned, full } = multiMcqPoints(selected, correct, pointsMax);
    const verdict: MockGradeItem["verdict"] =
      full ? "dogru" : earned > 0 ? "kismen" : "yanlis";
    return {
      ...baseItem(question, selected, earned, pointsMax, verdict, explanation, topicLabel),
      feedback: {
        rule: "Birden fazla doğrulu sorularda doğru seçimler puan kazandırır, yanlış seçimler düşürür.",
        selected,
        correct,
      },
    };
  }

  if (question.type === "numeric" && question.numericExpected != null) {
    const { earned, verdict, unitMissing } = gradeNumericAnswer(
      selected[0] ?? joined,
      question.numericExpected,
      question.numericUnit,
      question.numericTolerance,
      pointsMax,
    );
    return {
      ...baseItem(question, selected[0] ?? joined, earned, pointsMax, verdict, explanation, topicLabel),
      feedback: { unitMissing, expected: question.numericExpected, unit: question.numericUnit },
    };
  }

  // short_answer / open: çağıran rubrik / oral hibrit ile doldurur
  return baseItem(question, selected[0] ?? joined, 0, pointsMax, "yanlis", explanation, topicLabel);
}

function baseItem(
  question: GradeableQuestion,
  userAnswer: string | string[],
  pointsEarned: number,
  pointsMax: number,
  verdict: MockGradeItem["verdict"],
  explanation: string,
  topicLabel: string,
): MockGradeItem {
  return {
    questionId: question.id,
    userAnswer,
    isCorrect: verdict === "dogru",
    pointsEarned,
    pointsMax,
    verdict,
    explanation,
    feedback: null,
    topicId: question.topicId ?? null,
    topicLabel,
  };
}

export function scoreFromItems(items: MockGradeItem[]): {
  scorePct: number;
  earned: number;
  max: number;
  correct: number;
  wrong: number;
  blank: number;
} {
  const earned = items.reduce((s, i) => s + i.pointsEarned, 0);
  const max = items.reduce((s, i) => s + i.pointsMax, 0) || 1;
  const correct = items.filter((i) => i.verdict === "dogru").length;
  const blank = items.filter((i) => i.verdict === "bos").length;
  const wrong = items.length - correct - blank;
  return {
    scorePct: Math.round((earned / max) * 100),
    earned,
    max,
    correct,
    wrong,
    blank,
  };
}

export function buildTopicReport(
  items: MockGradeItem[],
  heavyLabels: Set<string> = new Set(),
): import("@/lib/learning/mock-exam/types").MockTopicReportRow[] {
  const map = new Map<
    string,
    {
      topicId: string | null;
      topicLabel: string;
      correct: number;
      total: number;
      pointsEarned: number;
      pointsMax: number;
    }
  >();
  for (const item of items) {
    const key = item.topicLabel || "Konu";
    const row = map.get(key) ?? {
      topicId: item.topicId,
      topicLabel: key,
      correct: 0,
      total: 0,
      pointsEarned: 0,
      pointsMax: 0,
    };
    row.total += 1;
    if (item.verdict === "dogru") row.correct += 1;
    row.pointsEarned += item.pointsEarned;
    row.pointsMax += item.pointsMax;
    map.set(key, row);
  }
  return [...map.values()]
    .map((row) => ({
      ...row,
      percent: row.pointsMax
        ? Math.round((row.pointsEarned / row.pointsMax) * 100)
        : 0,
      examHeavy: heavyLabels.has(row.topicLabel),
    }))
    .sort((a, b) => a.percent - b.percent || a.topicLabel.localeCompare(b.topicLabel, "tr"));
}

function norm(s: string) {
  return s.trim();
}

function fold(s: string) {
  return s
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function parseStudentNumber(raw: string): number | null {
  const cleaned = raw
    .replace(/,/g, ".")
    .replace(/[^\d.\-eE]/g, " ")
    .trim();
  const m = cleaned.match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function unitAliasMatch(answer: string, unit: string): boolean {
  const a = fold(answer);
  const u = fold(unit);
  if (a.includes(u)) return true;
  // g / gram, mol, vb. genel kısaltmalar
  if (u === "g" && /\bgram\b/.test(a)) return true;
  if (u === "gram" && /\bg\b/.test(a)) return true;
  return false;
}

/** Eski join("|") hatasının bir daha oluşmaması için cevap normalizasyonu. */
export function normalizeSubmittedAnswer(
  value: unknown,
  type: MockQuestionType,
): string | string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (value == null) return type === "multi_mcq" ? [] : "";
  const text = String(value);
  if (type === "multi_mcq") {
    if (text.includes("|")) {
      return text.split("|").map((s) => s.trim()).filter(Boolean);
    }
    return text.trim() ? [text.trim()] : [];
  }
  return text;
}
