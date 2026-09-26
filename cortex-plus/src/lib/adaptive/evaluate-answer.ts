/**
 * Answer evaluation — deterministic first, LLM only when needed.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADAPTIVE_MODEL_ROUTER_FLAG,
  isFeatureEnabled,
} from "@/lib/admin/feature-flags";
import { generateAdaptiveJson } from "@/lib/adaptive/action-content/openai-content";
import type {
  ActionQuestion,
  AnswerEvaluation,
  AnswerEvaluationKind,
} from "@/lib/adaptive/types";

function normalizeAnswer(raw: string): string {
  return raw
    .trim()
    .toLocaleLowerCase("tr")
    .replace(/\s+/g, " ")
    .replace(/,/g, ".");
}

function numericClose(a: string, b: string): boolean {
  const na = Number(normalizeAnswer(a).replace(/[^0-9.\-eE]/g, ""));
  const nb = Number(normalizeAnswer(b).replace(/[^0-9.\-eE]/g, ""));
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  const tol = Math.max(1e-6, Math.abs(nb) * 0.02);
  return Math.abs(na - nb) <= tol;
}

function deterministicGrade(
  question: ActionQuestion,
  studentAnswer: string,
): AnswerEvaluation | null {
  const expected = question.correctAnswer?.trim();
  if (!expected && question.format !== "mcq") return null;

  const norm = normalizeAnswer(studentAnswer);
  const accept = [
    expected,
    ...(question.accept ?? []),
  ]
    .filter(Boolean)
    .map((a) => normalizeAnswer(String(a)));

  if (question.format === "mcq") {
    const hit = accept.some((a) => a === norm || norm === a);
    // Also match by choice index "A"/"0"
    const idx = question.choices?.findIndex(
      (c) => normalizeAnswer(c) === norm,
    );
    const byIndex =
      idx != null &&
      idx >= 0 &&
      accept.some(
        (a) =>
          a === normalizeAnswer(question.choices![idx]!) ||
          a === String(idx) ||
          a === String.fromCharCode(97 + idx),
      );
    const correct = hit || Boolean(byIndex);
    return {
      correct,
      kind: correct ? "correct" : "incorrect",
      misconceptionTag: correct ? null : "choice_mismatch",
      feedback: correct
        ? "Doğru."
        : question.explanation?.slice(0, 240) || "Bu seçenek doğru değil.",
      confidence: 0.95,
    };
  }

  if (question.format === "numeric") {
    const correct = accept.some((a) => numericClose(studentAnswer, a));
    return {
      correct,
      kind: correct ? "correct" : "calculation_slip",
      misconceptionTag: correct ? null : "numeric_mismatch",
      feedback: correct
        ? "Doğru."
        : "Sayısal sonuç beklenenle uyuşmuyor. Hesap adımlarını kontrol et.",
      confidence: 0.9,
    };
  }

  // short_text with exact/accept match
  if (accept.some((a) => a && (norm === a || norm.includes(a) || a.includes(norm)))) {
    return {
      correct: true,
      kind: "correct",
      misconceptionTag: null,
      feedback: "Doğru.",
      confidence: 0.85,
    };
  }

  // Empty expected → must use LLM
  if (!expected) return null;
  return null;
}

type LlmEval = {
  correct?: boolean;
  kind?: string;
  misconception_tag?: string | null;
  feedback?: string;
  confidence?: number;
};

const KINDS: AnswerEvaluationKind[] = [
  "correct",
  "lucky",
  "calculation_slip",
  "conceptual_misconception",
  "prerequisite_gap",
  "partial_understanding",
  "incorrect",
];

function parseKind(v: unknown): AnswerEvaluationKind {
  const s = String(v ?? "incorrect");
  return KINDS.includes(s as AnswerEvaluationKind)
    ? (s as AnswerEvaluationKind)
    : "incorrect";
}

export async function evaluateAnswer(
  service: SupabaseClient,
  input: {
    userId: string;
    question: ActionQuestion;
    studentAnswer: string;
    topicTitle: string;
    misconceptionHint?: string | null;
    hintUsed?: boolean;
  },
): Promise<AnswerEvaluation> {
  const det = deterministicGrade(input.question, input.studentAnswer);
  if (det) return det;

  const routerEnabled = await isFeatureEnabled(
    service,
    ADAPTIVE_MODEL_ROUTER_FLAG,
    input.userId,
  );

  const result = await generateAdaptiveJson({
    service,
    userId: input.userId,
    actionCode: "ADAPTIVE_ANSWER_EVAL",
    system: [
      "Sen sınav hazırlık değerlendirme asistanısın. Yalnızca JSON döndür.",
      "Alanlar: correct (bool), kind (correct|lucky|calculation_slip|conceptual_misconception|prerequisite_gap|partial_understanding|incorrect),",
      "misconception_tag (string|null), feedback (kısa Türkçe), confidence (0-1).",
      "Doğru akıl yürütme ile şanslı cevabı ayırt et. Hesap hatalarını calculation_slip yap.",
    ].join(" "),
    user: JSON.stringify({
      topic: input.topicTitle,
      prompt: input.question.prompt,
      expected: input.question.correctAnswer,
      accept: input.question.accept ?? [],
      student_answer: input.studentAnswer.slice(0, 800),
      hint_used: Boolean(input.hintUsed),
      misconception_hint: input.misconceptionHint ?? null,
    }),
    parse: (raw) => (raw && typeof raw === "object" ? (raw as LlmEval) : null),
    routerEnabled,
  });

  if (!result.ok) {
    return {
      correct: false,
      kind: "incorrect",
      misconceptionTag: input.misconceptionHint ?? "eval_unavailable",
      feedback: "Cevabını kaydettik; bir sonraki adımı buna göre ayarlıyoruz.",
      confidence: 0.3,
    };
  }

  const data = result.data;
  const correct = Boolean(data.correct);
  const kind = parseKind(data.kind ?? (correct ? "correct" : "incorrect"));
  return {
    correct,
    kind,
    misconceptionTag: correct
      ? null
      : (data.misconception_tag ?? input.misconceptionHint ?? kind),
    feedback: String(
      data.feedback ??
        (correct ? "Doğru." : "Bu cevap beklenenle tam örtüşmüyor."),
    ).slice(0, 400),
    confidence: Math.max(0, Math.min(1, Number(data.confidence ?? 0.6))),
  };
}

export { deterministicGrade, normalizeAnswer };
