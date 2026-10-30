/**
 * Yazılı deneme notlandırması — deterministik türler + çok cevaplı kısmi puan.
 */

import { sameOptionSet, selectedOptions } from "@/lib/learning/exam-quiz";
import type { MockGradeItem, MockQuestionType, MockRubricItem } from "@/lib/learning/mock-exam/types";
import { stepArithmeticIssues } from "@/lib/solve/step-arithmetic";
import { finalResults } from "@/lib/learning/result-values";
import { verdictCounts } from "@/lib/learning/mock-exam/verdict-counts";

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

function markerHit(answer: string, marker: string): boolean {
  const compact = (text: string) => fold(text).replace(/\s+/g, "");
  const a = compact(answer);
  const m = compact(marker);
  if (m.length >= 4 && a.includes(m)) return true;
  const left = m.split("=")[0] ?? "";
  if (left.length >= 2 && a.includes(left) && a.includes("=")) return true;
  const words = fold(marker)
    .split(" ")
    .filter((word) => word.length > 3);
  if (words.length < 2) return false;
  const hits = words.filter((word) => fold(answer).includes(word));
  return hits.length >= 2;
}

const YEARS = /\b(?:1[0-9]{3}|20[0-9]{2})\b/g;

/** Cevaptaki yıl, beklenen metindeki yıl kümesiyle çelişirse olgu hatasıdır. */
export function dateContradiction(answer: string, expected: string): boolean {
  const left = [...answer.matchAll(YEARS)].map((match) => match[0]);
  const right = [...expected.matchAll(YEARS)].map((match) => match[0]);
  if (!left.length || !right.length) return false;
  return left.some((year) => !right.includes(year));
}

/** Çözüm satırından formül ya da denklem kurulumu. */
export function methodMarkers(modelAnswer: string, criteria: string[] = []): string[] {
  const lines = [...modelAnswer.split(/\n+/), ...criteria]
    .map((line) => line.trim())
    .filter((line) => line.length >= 8 && line.length <= 180 && !/^-?\d+(?:[.,]\d+)?$/.test(line));
  const marked = lines.filter((line) => /[=]/.test(line) || /formül|denklem|kirchhoff|thévenin|thevenin|ohm|adım|yöntem|kural|çünkü|once|önce/i.test(line));
  return (marked.length ? marked : lines).slice(0, 6);
}

/*
  Sayı ve eşitlik zinciri okuyucuları 29 Ekim 2026'da `result-values.ts`e taşındı (Paket H): açıklama ↔ anahtar
  tutarlılığı aynı okuyucuları kullanır. Adlar buradan da dışa aktarılır; çağıranlar değişmedi.
*/
export { chainsOf, claimedResults, finalResults, leadingValue, resultVariable, toNumber, trailingValue } from "@/lib/learning/result-values";

/** Cevaptaki eşitlik zincirlerinde tutmayan hesap: açık işlem hatası. Cümle, satır ve ";" ayrı zincir. */
export function arithmeticSlips(answer: string): string[] {
  return answer.split(/\n+|;|(?<=\D)\.\s+|\.\s+(?=\p{Lu})|[!?]\s+/u).flatMap((piece) => stepArithmeticIssues(piece));
}

/** Kurulum ya da hesap yazılmış mı (yalnız sonuç değil). */
function showsRelation(answer: string): boolean {
  return /[=⇒→]/.test(answer) || /\d\s*[+\-*/×·÷:]\s*\d/.test(answer);
}

/** Kısa ama doğru çözümün notu (Paket G, 29 Ekim 2026). */
export const SHORT_SOLUTION_FULL_CREDIT = "Sonuç ve bağıntı doğru; çözümün kısa olması puan düşürmez.";

/**
 * Sayısal/fen: yöntem ve kurulum doğru, son aritmetik yanlışsa %50–%80.
 * Yalnız son sayıyı yazan cevap 7/10 ve üzerine çıkmaz.
 * Sonuç doğru ve bağıntı/gerekçe doğruysa çözüm kısa diye kesinti yok (29 Ekim 2026: Selin'in 18. sorusu
 * doğru sonuç + doğru bağıntıyla 5/10 almıştı); kesinti yalnız sonuç yanlışsa, hesap zinciri tutmuyorsa
 * ya da denetçi açık kavram hatası (`conceptErrors`) işaretlediyse.
 */
export function partialWorkCredit(input: {
  answer: string;
  expected: number | null;
  tolerance?: number | null;
  maxPoints: number;
  modelAnswer?: string | null;
  criteria?: string[];
  alreadyEarned: number;
  /** Denetçinin "açıkça yanlış söylüyor" dediği ölçüt sayısı (open-grade `wrong`). */
  conceptErrors?: number;
}): { earned: number; step: string } | null {
  const answer = input.answer.trim();
  const expected = input.expected;
  if (!answer || expected == null || !Number.isFinite(expected)) return null;
  const markers = methodMarkers(input.modelAnswer ?? "", input.criteria ?? []);
  const hits = markers.filter((marker) => markerHit(answer, marker));
  const finals = finalResults(answer, input.modelAnswer);
  const num = finals.at(-1) ?? parseStudentNumber(answer);
  const tol = input.tolerance ?? Math.max(1e-6, Math.abs(expected) * 0.01);
  const within = (value: number) => Math.abs(value - expected) <= tol;
  const inRange = finals.length ? finals.some(within) : num != null && within(num);
  const bare = num != null && answer.length < 32 && !/\p{L}{4,}/u.test(answer);
  if (inRange && markers.length && bare) {
    const cap = Math.round(input.maxPoints * 0.6 * 1000) / 1000;
    if (input.alreadyEarned <= cap) return null;
    return { earned: cap, step: "Yöntem yazılmadan yalnız sonuç verilmiş." };
  }
  if (inRange && !bare) {
    const justified = hits.length > 0 || showsRelation(answer) || input.alreadyEarned > 0;
    if (!justified || input.conceptErrors || input.alreadyEarned >= input.maxPoints) return null;
    if (arithmeticSlips(answer).length) return null;
    return { earned: input.maxPoints, step: SHORT_SOLUTION_FULL_CREDIT };
  }
  if (!inRange && hits.length) {
    const ratio = Math.min(0.8, 0.5 + 0.3 * (hits.length / Math.max(1, markers.length)));
    const earned = Math.round(input.maxPoints * ratio * 1000) / 1000;
    if (earned <= input.alreadyEarned) return null;
    return { earned, step: "Kurulum doğru; son aritmetik adım hatalı." };
  }
  if (!inRange && num != null && !hits.length && input.alreadyEarned >= input.maxPoints * 0.7) {
    return { earned: 0, step: "Sonuç beklenen değerle çelişiyor." };
  }
  return null;
}

function trailingNumber(text: string): number | null {
  const matches = [...text.matchAll(/-?\d+(?:[.,]\d+)?/g)];
  const raw = matches.at(-1)?.[0]?.replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** Açık uçlu puanı: yöntem doğruysa kısmi, çıplak tahmin ve çelişen sonuç cömert puan almaz. */
export function adjustScoredAnswer(input: {
  answer: string;
  expected: number | null;
  tolerance?: number | null;
  maxPoints: number;
  modelAnswer?: string | null;
  criteria?: string[];
  earned: number;
  conceptErrors?: number;
}): { earned: number; step?: string } {
  const expected =
    input.expected ?? (/=/.test(input.modelAnswer ?? "") ? trailingNumber(input.modelAnswer ?? "") : null);
  const corpus = `${input.modelAnswer ?? ""}\n${(input.criteria ?? []).join("\n")}`;
  if (dateContradiction(input.answer, corpus)) {
    const cap = Math.round(input.maxPoints * 0.4 * 1000) / 1000;
    return { earned: Math.min(input.earned, cap), step: "Tarih beklenenle çelişiyor." };
  }
  const partial = partialWorkCredit({ ...input, expected, alreadyEarned: input.earned });
  if (!partial) return { earned: input.earned };
  return { earned: partial.earned, step: partial.step };
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
    const rawAnswer = selected[0] ?? joined;
    const base = gradeNumericAnswer(
      rawAnswer,
      question.numericExpected,
      question.numericUnit,
      question.numericTolerance,
      pointsMax,
    );
    const partial = partialWorkCredit({
      answer: rawAnswer,
      expected: question.numericExpected,
      tolerance: question.numericTolerance,
      maxPoints: pointsMax,
      modelAnswer: question.modelAnswer,
      criteria: question.rubric?.map((row) => row.criterion) ?? [],
      alreadyEarned: base.earned,
    });
    const earned = partial?.earned ?? base.earned;
    const verdict: MockGradeItem["verdict"] =
      earned <= 0 ? base.verdict : earned >= pointsMax ? "dogru" : "kismen";
    return {
      ...baseItem(question, rawAnswer, earned, pointsMax, verdict, explanation, topicLabel),
      feedback: {
        unitMissing: base.unitMissing,
        expected: question.numericExpected,
        unit: question.numericUnit,
        ...(partial ? { step: partial.step } : {}),
      },
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
  partial: number;
  wrong: number;
  blank: number;
} {
  const earned = items.reduce((s, i) => s + i.pointsEarned, 0);
  const max = items.reduce((s, i) => s + i.pointsMax, 0) || 1;
  // Tek sayım (30 Ekim 2026, Paket I #7): kısmen doğru yanlışa girmez.
  const { correct, partial, wrong, blank } = verdictCounts(items.map((i) => i.verdict));
  return {
    scorePct: Math.min(100, Math.round((earned / max) * 100)),
    earned,
    max,
    correct,
    partial,
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
      percent: row.total ? Math.round((row.correct / row.total) * 100) : 0,
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
