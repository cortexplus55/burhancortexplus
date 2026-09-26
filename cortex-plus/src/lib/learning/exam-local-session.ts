import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";
import { normalizeQuizQuestion } from "@/lib/learning/exam-quiz";
import {
  assembleFocusedPractice,
  collectWeakTopics,
  missedFromAttempt,
  questionsFromLessonChecks,
  type StoredLessonCheck,
} from "@/lib/learning/focused-practice";
import { buildReadinessScreen } from "@/lib/learning/readiness-screen";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import type { TopicMasterySnapshot } from "@/lib/learning/learning-tracking";
import { lessonV2Schema } from "@/lib/learning/teaching-standards";
import { prepLanguage, type StoredReview } from "@/lib/learning/teacher-brain";

export type LocalSessionPlan =
  | { action: "serve"; payload: Record<string, unknown> }
  | { action: "generate"; topics: string[] };

function asReview(value: unknown): StoredReview | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { prompt?: unknown };
  return typeof row.prompt === "string" ? (value as StoredReview) : null;
}

function lessonChecks(content: unknown, topic: string): StoredLessonCheck[] {
  const parsed = lessonV2Schema.safeParse(content);
  const sections = parsed.success
    ? parsed.data.sections
    : Array.isArray((content as { sections?: unknown } | null)?.sections)
      ? ((content as { sections: unknown[] }).sections ?? [])
      : [];
  const out: StoredLessonCheck[] = [];
  for (const section of sections) {
    if (!section || typeof section !== "object") continue;
    const row = section as {
      heading?: unknown;
      check?: {
        prompt?: unknown;
        options?: unknown;
        answerIndex?: unknown;
        explanation?: unknown;
        review?: unknown;
      };
    };
    const check = row.check;
    if (!check || typeof check.prompt !== "string" || !Array.isArray(check.options)) continue;
    const options = check.options.filter((option): option is string => typeof option === "string");
    const answerIndex = typeof check.answerIndex === "number" ? check.answerIndex : -1;
    const explanation = typeof check.explanation === "string" ? check.explanation : "";
    if (!explanation.trim() || options.length < 2) continue;
    out.push({
      topic,
      heading: typeof row.heading === "string" ? row.heading : topic,
      prompt: check.prompt,
      options,
      answerIndex,
      explanation,
      review: asReview(check.review),
    });
  }
  return out;
}

function quizQuestions(payload: unknown): (QuizQuestion & { review?: StoredReview | null })[] {
  const rows = (payload as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(rows)) return [];
  const out: (QuizQuestion & { review?: StoredReview | null })[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const question = normalizeQuizQuestion(row as Parameters<typeof normalizeQuizQuestion>[0]);
    if (!question) continue;
    out.push({ ...question, review: asReview((row as { review?: unknown }).review) });
  }
  return out;
}

export async function buildLocalSessionPayload(
  service: SupabaseClient,
  input: {
    userId: string;
    prepId: string;
    kind: "focused" | "final_check" | "readiness";
    prepTitle: string;
    targetScore: number | null;
    learningPreferences: unknown;
  },
): Promise<LocalSessionPlan> {
  const language = prepLanguage(input.learningPreferences);
  const home = `/deneme-sinavlari/${input.prepId}`;

  const [topicsRes, masteryRes, missRes, nodesRes, attemptsRes, lessonsRes] = await Promise.all([
    service.from("exam_prep_topics").select("id, label").eq("exam_prep_id", input.prepId),
    service
      .from("exam_prep_topic_mastery")
      .select(
        "topic_key, measured_level, confidence, evidence_count, first_attempt_correct, first_attempt_total, independent_correct, independent_total, last_practiced_at",
      )
      .eq("user_id", input.userId)
      .eq("exam_prep_id", input.prepId),
    service
      .from("exam_prep_misconceptions")
      .select("topic_label, wrong_type, source_kind, question_preview")
      .eq("user_id", input.userId)
      .eq("exam_prep_id", input.prepId)
      .order("created_at", { ascending: false })
      .limit(40),
    service
      .from("exam_prep_nodes")
      .select("id, kind, status, session_meta")
      .eq("exam_prep_id", input.prepId)
      .order("sort_order"),
    service
      .from("exam_prep_node_attempts")
      .select("payload, answers, node_id, score, total, status")
      .eq("user_id", input.userId)
      .eq("exam_prep_id", input.prepId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(40),
    service
      .from("exam_prep_lessons")
      .select("content_json, topic_id")
      .eq("exam_prep_id", input.prepId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const topicLabels = (topicsRes.data ?? [])
    .map((row) => String(row.label ?? "").trim())
    .filter(Boolean);
  const topicById = new Map(
    (topicsRes.data ?? []).map((row) => [String(row.id), String(row.label ?? "").trim()]),
  );
  const nodes = (nodesRes.data ?? []).map((row) => ({
    id: String(row.id),
    kind: row.kind as PlanNodeKind,
    status: row.status as "locked" | "ready" | "done",
    topic:
      row.session_meta && typeof row.session_meta === "object"
        ? String((row.session_meta as { topicTitle?: string }).topicTitle ?? "").trim()
        : "",
  }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const mastery: TopicMasterySnapshot[] = (masteryRes.data ?? []).map((row) => ({
    topicKey: String(row.topic_key ?? ""),
    measured: Number(row.evidence_count ?? 0) > 0,
    level: (row.measured_level as TopicMasterySnapshot["level"]) ?? "unmeasured",
    confidence: Number(row.confidence ?? 0),
    evidenceCount: Number(row.evidence_count ?? 0),
    firstAttemptCorrect: Number(row.first_attempt_correct ?? 0),
    firstAttemptTotal: Number(row.first_attempt_total ?? 0),
    independentCorrect: Number(row.independent_correct ?? 0),
    independentTotal: Number(row.independent_total ?? 0),
    lastPracticedAt: (row.last_practiced_at as string | null) ?? null,
  }));

  const misconceptions = (missRes.data ?? []).map((row) => ({
    topicLabel: (row.topic_label as string | null) ?? null,
    wrongType: (row.wrong_type as string | null) ?? null,
    sourceKind: (row.source_kind as string | null) ?? null,
    questionPreview: (row.question_preview as string | null) ?? null,
  }));

  const missedQuestions: QuizQuestion[] = [];
  const missedTopics: string[] = [];
  let mockScorePct: number | null = null;
  for (const attempt of attemptsRes.data ?? []) {
    const node = nodeById.get(String(attempt.node_id));
    const topic = node?.topic || input.prepTitle;
    const payload = attempt.payload as { type?: string; questions?: unknown } | null;
    if (node?.kind === "written_exam" && mockScorePct == null && attempt.total) {
      mockScorePct = Math.round((Number(attempt.score ?? 0) / Number(attempt.total)) * 100);
    }
    if (payload?.type !== "quiz") continue;
    const questions = quizQuestions(payload);
    const answers = (attempt.answers as Record<string, unknown> | null) ?? {};
    const missed = missedFromAttempt({
      topic,
      kind: node?.kind ?? "quiz",
      questions,
      answers,
    });
    if (missed.length) missedTopics.push(topic);
    missedQuestions.push(...missed);
  }

  if (input.kind === "readiness") {
    const href = (kind: PlanNodeKind) => {
      const node = nodes.find((row) => row.kind === kind && row.status !== "locked") ?? nodes.find((row) => row.kind === kind);
      return node ? `${home}/dugum/${node.id}` : null;
    };
    const missesByTopic = new Map<string, number>();
    for (const row of misconceptions) {
      const label = row.topicLabel?.trim();
      if (!label) continue;
      missesByTopic.set(label, (missesByTopic.get(label) ?? 0) + 1);
    }
    const screen = buildReadinessScreen({
      plannedTopics: topicLabels,
      mastery,
      openMissesByTopic: [...missesByTopic.entries()].map(([topic, count]) => ({ topic, count })),
      mockScorePct,
      targetScore: input.targetScore,
      nodes,
      links: {
        focused: href("focused"),
        written: href("written_exam"),
        quiz: href("quiz"),
        home,
      },
    });
    return { action: "serve", payload: { type: "readiness", screen } };
  }

  const weakTopics = collectWeakTopics({
    mastery,
    misconceptions,
    missedTopics,
    plannedTopics: topicLabels,
  });
  const limit = input.kind === "final_check" ? 3 : 5;
  if (!weakTopics.length) {
    return {
      action: "serve",
      payload: {
        type: "practice_empty",
        practice: input.kind,
        reason: "no_weak_topics",
        message:
          input.kind === "final_check"
            ? "Son kontrol için kayıtlı zayıf konu yok. Hazırlık ekranı ölçülen konulardan hesaplanır."
            : "Odaklı pratik için kayıtlı zayıf konu, yanlış deneme veya kısa tekrar kaçağı yok.",
        topics: [],
      },
    };
  }

  const checks: StoredLessonCheck[] = [];
  for (const lesson of lessonsRes.data ?? []) {
    const topic = topicById.get(String(lesson.topic_id ?? "")) || "";
    if (!topic) continue;
    checks.push(...lessonChecks(lesson.content_json, topic));
  }
  const lessonQuestions = questionsFromLessonChecks(checks);
  const assembled = assembleFocusedPractice({
    weakTopics,
    missed: missedQuestions,
    lessonQuestions,
    reviewPrompts: misconceptions
      .filter((row) => row.sourceKind === "lesson_review" || row.wrongType === "lesson_check_miss")
      .map((row) => row.questionPreview ?? ""),
    limit,
    language,
  });

  if (assembled.questions.length) {
    return {
      action: "serve",
      payload: {
        type: "quiz",
        practice: input.kind,
        reused: true,
        questions: assembled.questions,
        uncoveredTopics: assembled.uncoveredTopics,
      },
    };
  }

  return { action: "generate", topics: weakTopics.slice(0, 6) };
}
