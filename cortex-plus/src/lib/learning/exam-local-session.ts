import "server-only";
import { STUDY_TOOL_LOCK_COPY } from "@/lib/learning/study-tools";
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
import { readLessonV2 } from "@/lib/learning/lesson-v3";
import { prepLanguage, type StoredReview } from "@/lib/learning/teacher-brain";
import { withOpenMisconceptions } from "@/lib/learning/misconception-store";

export type LocalSessionPlan =
  | { action: "serve"; payload: Record<string, unknown> }
  | { action: "generate"; topics: string[] };

/** Kilitli araç: kayıt açılmaz, kredi düşmez; ekran nedenini söyler. */
export function lockedToolPayload(kind: "gaps" | "spaced"): LocalSessionPlan {
  return {
    action: "serve",
    payload: {
      type: "practice_empty",
      practice: kind,
      reason: "locked",
      locked: true,
      message: STUDY_TOOL_LOCK_COPY[kind],
      topics: [],
    },
  };
}

/**
 * Yolda sırası gelen "Bilgi boşlukları" kapatılacak boşluk yokken (20 Ekim 2026). Kilitli cevapta
 * "Bu adımı tamamla" yok; yol bu adımda duruyordu. Bu cevap kayıt açar, adım tamamlanır.
 */
export const GAPS_NOTHING_OPEN_COPY =
  "Açık yanlışın ya da zayıf konun yok; kapatılacak boşluk bulunmadı. Bu adımı tamamlayıp yola devam edebilirsin.";

export function gapsNothingOpenPayload(): LocalSessionPlan {
  return {
    action: "serve",
    payload: {
      type: "practice_empty",
      practice: "gaps",
      reason: "no_weak_topics",
      message: GAPS_NOTHING_OPEN_COPY,
      topics: [],
    },
  };
}

/**
 * Düğüm yolda öğrencinin sırası mı: açık ve önünde bitmemiş adım yok. "Başka birini seç" ile
 * öne alınan adımın önünde bitmemiş adım vardır; o kilit cevabını görmeye devam eder. Okuma
 * düşerse sırası sayılır — yolu durdurmak boş bir adımdan kötü.
 */
export async function isPathTurn(
  service: SupabaseClient,
  prepId: string,
  node: { status?: unknown; sort_order?: unknown },
): Promise<boolean> {
  if (node.status !== "ready") return false;
  const sortOrder = typeof node.sort_order === "number" ? node.sort_order : null;
  if (sortOrder == null) return true;
  const { count, error } = await service
    .from("exam_prep_nodes")
    .select("id", { count: "exact", head: true })
    .eq("exam_prep_id", prepId)
    .neq("status", "done")
    .lt("sort_order", sortOrder);
  if (error) return true;
  return (count ?? 0) === 0;
}

/** Tekrar: hazırlıkta bitmiş bir adım yoksa kilitli. */
export async function spacedReviewGate(service: SupabaseClient, prepId: string): Promise<LocalSessionPlan> {
  const { count, error } = await service
    .from("exam_prep_nodes")
    .select("id", { count: "exact", head: true })
    .eq("exam_prep_id", prepId)
    .eq("status", "done");
  // Sayım okunamazsa kilitlemeyiz: öğrenciyi yanlışlıkla dışarıda bırakmak
  // boşa bir üretimden daha kötü.
  if (error || (count ?? 0) > 0) return { action: "generate", topics: [] };
  return lockedToolPayload("spaced");
}

function asReview(value: unknown): StoredReview | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { prompt?: unknown };
  return typeof row.prompt === "string" ? (value as StoredReview) : null;
}

function lessonChecks(content: unknown, topic: string): StoredLessonCheck[] {
  const parsed = readLessonV2(content);
  const sections = parsed
    ? parsed.sections
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

/**
 * Yalnız çözülmemiş yanılgılar (20 Ekim 2026): çözülen yanılgı zayıf konu, hazırlık ekranında
 * "açık yanlış" ve odaklı pratiğin tekrar sorusu olmaz. Sütun yoksa hepsi açık sayılır.
 */
function openMisconceptionRows(service: SupabaseClient, input: { userId: string; prepId: string }) {
  return withOpenMisconceptions((onlyOpen) => {
    const query = service
      .from("exam_prep_misconceptions")
      .select("topic_label, wrong_type, source_kind, question_preview")
      .eq("user_id", input.userId)
      .eq("exam_prep_id", input.prepId);
    return (onlyOpen ? query.is("resolved_at", null) : query)
      .order("created_at", { ascending: false })
      .limit(40);
  });
}

function masterySnapshots(rows: Record<string, unknown>[] | null): TopicMasterySnapshot[] {
  return (rows ?? []).map((row) => ({
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
}

const MASTERY_COLUMNS =
  "topic_key, measured_level, confidence, evidence_count, first_attempt_correct, first_attempt_total, independent_correct, independent_total, last_practiced_at";

export type PrepTopicRow = {
  id: string;
  label: string;
  document_topic_node_id: string | null;
  source_refs: unknown;
  measured_level: string | null;
};

/**
 * Hazırlık geneli düğümün hedef konusu için hafif okuma (20 Ekim 2026): konular, hâkimiyet ve açık
 * yanılgılardan zayıf konu listesi. Testlerin son 40 kaydını okumaz (yerel oturumun işi).
 */
export async function weakTopicsForPrep(
  service: SupabaseClient,
  input: { userId: string; prepId: string },
): Promise<{ topics: PrepTopicRow[]; mastery: TopicMasterySnapshot[]; weakTopics: string[] }> {
  const [topicsRes, masteryRes, missRes] = await Promise.all([
    service
      .from("exam_prep_topics")
      .select("id, label, document_topic_node_id, source_refs, measured_level")
      .eq("exam_prep_id", input.prepId)
      .order("sort_order"),
    service
      .from("exam_prep_topic_mastery")
      .select(MASTERY_COLUMNS)
      .eq("user_id", input.userId)
      .eq("exam_prep_id", input.prepId),
    openMisconceptionRows(service, input),
  ]);
  const topics: PrepTopicRow[] = (topicsRes.data ?? [])
    .map((row) => ({
      id: String(row.id),
      label: String(row.label ?? "").trim(),
      document_topic_node_id: typeof row.document_topic_node_id === "string" ? row.document_topic_node_id : null,
      source_refs: row.source_refs ?? null,
      measured_level: typeof row.measured_level === "string" ? row.measured_level : null,
    }))
    .filter((row) => row.label);
  const mastery = masterySnapshots(masteryRes.data as Record<string, unknown>[] | null);
  const weakTopics = collectWeakTopics({
    mastery,
    misconceptions: (missRes.data ?? []).map((row) => ({
      topicLabel: (row.topic_label as string | null) ?? null,
      wrongType: (row.wrong_type as string | null) ?? null,
      sourceKind: (row.source_kind as string | null) ?? null,
      questionPreview: (row.question_preview as string | null) ?? null,
    })),
    missedTopics: [],
    plannedTopics: topics.map((row) => row.label),
  });
  return { topics, mastery, weakTopics };
}

export async function buildLocalSessionPayload(
  service: SupabaseClient,
  input: {
    userId: string;
    prepId: string;
    kind: "focused" | "final_check" | "readiness" | "gaps";
    prepTitle: string;
    targetScore: number | null;
    learningPreferences: unknown;
    /** Uyarlamalı odaklı pratik (20 Ekim 2026): yalnız düşük sonuç alınan konu. */
    focusTopic?: string | null;
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
    openMisconceptionRows(service, input),
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
  // Deneme puanı bitmiş "Yazılı deneme" düğümünün son kaydından, 40'lık pencereden değil (22 Ekim 2026
  // inceleme): "Hazırsın" artık denemeyi zorunlu sayıyor; erken çözülen deneme 40 etkinlikten sonra
  // pencereden düşünce ekran "Yazılı denemeyi çöz" diyordu, /degerlendirme ise "çözüldü". Aynı okuma
  // `learning-tracking-persist.ts` ve değerlendirme sayfasında. Pencere yalnız kaçırılan sorular için.
  let mockScorePct: number | null = null;
  const mockNode = nodes.find((node) => node.kind === "written_exam" && node.status === "done");
  if (mockNode) {
    const { data: mockAttempt } = await service
      .from("exam_prep_node_attempts")
      .select("score, total")
      .eq("node_id", mockNode.id)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (mockAttempt?.total) {
      mockScorePct = Math.round((Number(mockAttempt.score ?? 0) / Number(mockAttempt.total)) * 100);
    }
  }
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

  const focus = input.kind === "focused" ? input.focusTopic?.trim() : "";
  const weakTopics = focus
    ? [focus]
    : collectWeakTopics({
        mastery,
        misconceptions,
        missedTopics,
        plannedTopics: topicLabels,
      });
  // Bilgi boşlukları zayıf nokta yoksa kilitli; varsa yeni sorular yalnız
  // o konulardan üretilir (Astra, 1 Ekim 2026).
  if (input.kind === "gaps") {
    return weakTopics.length
      ? { action: "generate", topics: weakTopics.slice(0, 6) }
      : lockedToolPayload("gaps");
  }
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
