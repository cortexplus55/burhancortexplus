import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordMistakes } from "@/lib/learning/mistake-notebook";
import { maybeRescheduleMissedDays } from "@/lib/learning/missed-day-reschedule";
import { recordUserActivity } from "@/lib/streak/record-activity";
import {
  buildTopicReport,
  DEADLINE_GRACE_SEC,
  deadlinePassed,
  gradeDeterministicItem,
  gradeRubricAnswer,
  normalizeSubmittedAnswer,
  scoreFromItems,
  type GradeableQuestion,
  type MockGradeItem,
  type MockQuestionType,
  type MockRubricItem,
} from "@/lib/learning/mock-exam";

export type GradeMockExamInput = {
  service: SupabaseClient;
  userId: string;
  examId: string;
  answers: Record<string, unknown>;
  flaggedIds?: string[];
};

export type GradeMockExamResult =
  | {
      ok: true;
      attemptId: string;
      score: number;
      correct: number;
      wrong: number;
      blank: number;
      topicReport: ReturnType<typeof buildTopicReport>;
      analysis: string;
    }
  | { ok: false; status: number; error: string };

/**
 * Notlandırma kredi düşmez. Açıklamalar üretimde hazır;
 * klasik/kısa cevap rubrik + alıntı ile yerel puanlanır.
 */
export async function gradeMockExam(input: GradeMockExamInput): Promise<GradeMockExamResult> {
  const { service, userId, examId, answers } = input;

  const { data: exam } = await service
    .from("practice_exams")
    .select("id, title, user_id, deadline_at, blueprint")
    .eq("id", examId)
    .maybeSingle();

  if (!exam) return { ok: false, status: 404, error: "not_found" };
  if (exam.user_id !== userId) return { ok: false, status: 403, error: "forbidden" };

  if (deadlinePassed(exam.deadline_at as string | null, Date.now(), DEADLINE_GRACE_SEC)) {
    // Geç gönderim: kayıtlı son cevaplarla notlandır (answers body yok sayılmaz — zaten geldiyse kullan)
  }

  const { data: rows } = await service
    .from("practice_exam_questions")
    .select(
      "id, question_text, question_type, options, correct_answer, correct_answers, points, explanation, topic_id, topic_label, rubric, model_answer, option_why, source_label",
    )
    .eq("exam_id", examId)
    .order("sort_order");

  const list = (rows ?? []) as Array<Record<string, unknown>>;
  const gradeables: GradeableQuestion[] = list.map((row) => {
    const type = (row.question_type as MockQuestionType) || "mcq";
    const correctAnswers = Array.isArray(row.correct_answers)
      ? (row.correct_answers as string[])
      : [];
    const rubric = Array.isArray(row.rubric) ? (row.rubric as MockRubricItem[]) : [];
    return {
      id: row.id as string,
      type,
      correctAnswers,
      correctAnswer: (row.correct_answer as string) ?? null,
      points: Number(row.points ?? 1),
      explanation: (row.explanation as string) ?? null,
      topicId: (row.topic_id as string) ?? null,
      topicLabel: (row.topic_label as string) ?? null,
      rubric,
      modelAnswer: (row.model_answer as string) ?? null,
      numericExpected: extractNum(row.model_answer ?? row.correct_answer),
      numericUnit: extractUnit(String(row.model_answer ?? row.correct_answer ?? "")),
      numericTolerance: null,
    };
  });

  const items: MockGradeItem[] = gradeables.map((q) => {
    const raw = normalizeSubmittedAnswer(answers[q.id], q.type);
    if (q.type === "short_answer" || q.type === "open") {
      const answerText = Array.isArray(raw) ? raw.join(" ") : String(raw ?? "");
      const rubric = q.rubric?.length
        ? q.rubric
        : [{ criterion: "Ana nokta", points: q.points }];
      // Alıntı: model_answer / rubrik maddelerinden cevapta geçen parçalar
      const quotes = rubric
        .map((r) => {
          const seed = (q.modelAnswer || r.criterion).slice(0, 80);
          const quote = findQuote(answerText, seed) || findQuote(answerText, r.criterion);
          return quote ? { criterion: r.criterion, quote } : null;
        })
        .filter((x): x is { criterion: string; quote: string } => Boolean(x));
      // Rubrik maddesi için öğrencinin cevabından kısa alıntı yoksa kelime örtüşmesi
      const expanded = rubric.map((r) => {
        const existing = quotes.find((qte) => qte.criterion === r.criterion);
        if (existing) return existing;
        const hit = answerText
          .split(/[.!?\n]/)
          .map((s) => s.trim())
          .find((s) => s.length >= 8 && fold(s).includes(fold(r.criterion).slice(0, 12)));
        return hit ? { criterion: r.criterion, quote: hit.slice(0, 120) } : null;
      }).filter((x): x is { criterion: string; quote: string } => Boolean(x));

      const graded = gradeRubricAnswer(answerText, rubric, expanded);
      const verdict: MockGradeItem["verdict"] = !answerText.trim()
        ? "bos"
        : graded.invalid
          ? "yanlis"
          : graded.earned >= graded.max
            ? "dogru"
            : graded.earned > 0
              ? "kismen"
              : "yanlis";
      return {
        questionId: q.id,
        userAnswer: answerText,
        isCorrect: verdict === "dogru",
        pointsEarned: graded.invalid ? 0 : graded.earned,
        pointsMax: graded.max,
        verdict,
        explanation: q.explanation ?? "",
        feedback: {
          met: graded.met,
          missed: graded.missed,
          invalid: graded.invalid,
          quotes: expanded,
        },
        topicId: q.topicId ?? null,
        topicLabel: q.topicLabel?.trim() || "Konu",
      };
    }
    return gradeDeterministicItem(q, raw);
  });

  const scored = scoreFromItems(items);
  const heavy = new Set<string>();
  const bp = exam.blueprint as { allocation?: Array<{ topicLabel: string; examHeavy?: boolean }> } | null;
  for (const row of bp?.allocation ?? []) {
    if (row.examHeavy) heavy.add(row.topicLabel);
  }
  const topicReport = buildTopicReport(items, heavy);

  const analysis = JSON.stringify({
    summary: polishSummary(scored.scorePct),
    weakTopics: topicReport.filter((r) => r.percent < 70).map((r) => r.topicLabel).slice(0, 8),
    nextSteps: [],
    topicReport,
  });

  const { data: attempt, error: attemptError } = await service
    .from("practice_exam_attempts")
    .insert({
      exam_id: examId,
      user_id: userId,
      score: scored.scorePct,
      analysis,
      completed_at: new Date().toISOString(),
      answers,
      topic_report: topicReport,
      flagged_ids: input.flaggedIds ?? null,
    })
    .select("id")
    .single();

  if (attemptError || !attempt) {
    return { ok: false, status: 500, error: "grade_failed" };
  }

  await service.from("practice_exam_item_reviews").insert(
    items.map((item) => ({
      attempt_id: attempt.id,
      question_id: item.questionId,
      user_answer: Array.isArray(item.userAnswer)
        ? item.userAnswer.join("|")
        : String(item.userAnswer ?? ""),
      is_correct: item.isCorrect,
      explanation: item.explanation,
      points_earned: item.pointsEarned,
      points_max: item.pointsMax,
      verdict: item.verdict,
      feedback: item.feedback,
    })),
  );

  await recordMistakes(
    service,
    userId,
    items
      .filter((item) => item.verdict !== "dogru" && item.verdict !== "bos")
      .map((item) => {
        const q = list.find((row) => row.id === item.questionId);
        return {
          source: "deneme" as const,
          sourceQuestionId: item.questionId,
          topicLabel: item.topicLabel,
          questionText: String(q?.question_text ?? ""),
          options: Array.isArray(q?.options) ? (q.options as string[]) : null,
          correctAnswer: Array.isArray(q?.correct_answers)
            ? (q.correct_answers as string[]).join(" | ")
            : String(q?.correct_answer ?? ""),
          wrongAnswer: Array.isArray(item.userAnswer)
            ? item.userAnswer.join(" | ")
            : String(item.userAnswer || ""),
          explanation: item.explanation,
        };
      }),
  );

  const weakOnly = topicReport.filter((r) => r.percent < 70);
  if (weakOnly.length) {
    await service.from("weak_topics").insert(
      weakOnly.slice(0, 10).map((row) => ({
        user_id: userId,
        topic_label: row.topicLabel,
        severity: (100 - row.percent) / 100,
        source: "practice_exam",
      })),
    );
  }

  try {
    await recordUserActivity(service, userId, "practice_exam");
    await maybeRescheduleMissedDays(service, userId, {
      force: true,
      reason: "exam_graded",
    });
  } catch {
    // ignore
  }

  return {
    ok: true,
    attemptId: attempt.id as string,
    score: scored.scorePct,
    correct: scored.correct,
    wrong: scored.wrong,
    blank: scored.blank,
    topicReport,
    analysis: polishSummary(scored.scorePct),
  };
}

function polishSummary(score: number): string {
  if (score >= 80) return "Deneme sonucun güçlü; zayıf konuları pekiştirmen yeterli.";
  if (score >= 50) return "Temel konular duruyor; düşük yüzdeli konulara dön.";
  return "Önce düşük yüzdeli konuların dersini tekrarla, sonra yeni deneme çöz.";
}

function extractNum(raw: unknown): number | null {
  if (raw == null) return null;
  const m = String(raw).replace(/,/g, ".").match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function extractUnit(text: string): string | null {
  const m = text.match(/\d+(?:[.,]\d+)?\s*([a-zA-ZğüşıöçĞÜŞİÖÇ/%°]+)/);
  return m?.[1] ?? null;
}

function findQuote(answer: string, seed: string): string | null {
  const foldedAnswer = fold(answer);
  const foldedSeed = fold(seed);
  if (!foldedSeed || foldedSeed.length < 3) return null;
  if (!foldedAnswer.includes(foldedSeed.slice(0, Math.min(20, foldedSeed.length)))) {
    // Sayısal alıntı
    const nums = seed.match(/\d+(?:[.,]\d+)?/g) ?? [];
    for (const n of nums) {
      if (answer.includes(n)) return n;
    }
    return null;
  }
  const idx = foldedAnswer.indexOf(foldedSeed.slice(0, Math.min(16, foldedSeed.length)));
  if (idx < 0) return null;
  return answer.slice(Math.max(0, idx), Math.min(answer.length, idx + 80)).trim() || null;
}

function fold(s: string) {
  return s
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}
