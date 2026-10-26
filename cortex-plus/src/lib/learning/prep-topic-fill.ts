import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FreeMeter } from "@/lib/billing/free-meters";
import { documentRunningHeaders, ensureCleanPages } from "@/lib/documents/clean-pages";
import { commitCredits, refundCredits, refusalCode, reserveCredits } from "@/lib/credits/service";
import type { ActionCode } from "@/lib/env";
import { corePageRun } from "@/lib/learning/core-pages";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";
import { finalCardTopics } from "@/lib/learning/final-block";
import { normalizeTopicKey } from "@/lib/learning/learning-tracking";
import { runTeacherQuiz } from "@/lib/learning/teacher-quiz-run";

/**
 * Hazırlık geneli adımların konu konu kaynağı (25 Ekim 2026, P1-4): son kontrolün eksik konuları ve son tekrar
 * kartları her konunun kendi sayfalarından yazılır; devralınan 1. konunun sayfalarından değil.
 */
export type TopicPages = {
  label: string;
  documentId: string | null;
  pages: { page: number; text: string }[];
  edges: string[];
};

function refsOf(raw: unknown): { documentId?: string; pages?: number[] }[] {
  return Array.isArray(raw) ? (raw.filter((item) => item && typeof item === "object") as { documentId?: string; pages?: number[] }[]) : [];
}

export async function loadTopicPages(
  service: SupabaseClient,
  input: { userId: string; prepId: string; labels: readonly string[] },
): Promise<TopicPages[]> {
  const { data } = await service
    .from("exam_prep_topics")
    .select("label, source_refs")
    .eq("exam_prep_id", input.prepId);
  const rows = (data ?? []) as { label: string | null; source_refs: unknown }[];
  return Promise.all(
    input.labels.map(async (label): Promise<TopicPages> => {
      const row = rows.find((item) => normalizeTopicKey(item.label) === normalizeTopicKey(label));
      const ref = refsOf(row?.source_refs).find((item) => item.documentId && item.pages?.length);
      if (!ref?.documentId) return { label, documentId: null, pages: [], edges: [] };
      const edges = await documentRunningHeaders(service, ref.documentId).catch(() => []);
      const clean = await ensureCleanPages(service, {
        userId: input.userId,
        documentId: ref.documentId,
        pages: corePageRun(ref.pages ?? []),
        edges,
      }).catch(() => []);
      return { label, documentId: ref.documentId, pages: clean.map((item) => ({ page: item.page, text: item.text })), edges };
    }),
  );
}

/** Son tekrar kartlarının konuları: zayıf ve orta konular, en zayıf önce (`finalCardTopics`). */
export async function loadFinalCardTopics(
  service: SupabaseClient,
  input: { userId: string; prepId: string; max?: number },
): Promise<string[]> {
  const [topicsRes, masteryRes] = await Promise.all([
    service.from("exam_prep_topics").select("label").eq("exam_prep_id", input.prepId).order("sort_order"),
    service
      .from("exam_prep_topic_mastery")
      .select("topic_key, confidence, evidence_count")
      .eq("user_id", input.userId)
      .eq("exam_prep_id", input.prepId),
  ]);
  const mastery = (masteryRes.data ?? []) as { topic_key: string | null; confidence: number | null; evidence_count: number | null }[];
  const strengths = ((topicsRes.data ?? []) as { label: string | null }[])
    .map((row) => String(row.label ?? "").trim())
    .filter(Boolean)
    .map((label) => {
      const row = mastery.find((item) => item.topic_key === normalizeTopicKey(label));
      return { label, confidence: row && Number(row.evidence_count ?? 0) > 0 ? Number(row.confidence ?? 0) : null };
    });
  return finalCardTopics(strengths, input.max ?? 4);
}

/** Aynı anda en çok bu kadar konu üretimi (yazılı denemedeki gibi). */
const FILL_CONCURRENCY = 4;

/**
 * Eksik konulara konu başına soru. Kredi bir kez ayrılır ve her konu üretimine verilir (aynı anahtarla
 * paralel ayırma yalnız ilk işi geçirir; AGENTS.md "Paralel işler aynı ödeme anahtarını paylaşmaz"). En az bir
 * soru çıkarsa kesinleşir, çıkmazsa iade. Sayfası olmayan belgeli konu atlanır; belgesiz hazırlıkta konu kipi.
 */
export async function fillTopicQuestions(
  service: SupabaseClient,
  input: {
    userId: string;
    prepId: string;
    prepTitle: string;
    topics: readonly string[];
    perTopic: number;
    idempotencyKey: string;
    freeMeter?: FreeMeter | null;
    actionCode?: ActionCode;
    charge?: boolean;
    documentBacked: boolean;
    previousStems?: string[];
  },
): Promise<{ ok: true; questions: QuizQuestion[]; missing: string[] } | { ok: false; status: number; error: string }> {
  const actionCode = input.actionCode ?? "QUIZ_GENERATE";
  const free = input.charge === false;
  const reservation = free
    ? ({ ok: true, reservationId: null } as const)
    : await reserveCredits(service, input.userId, actionCode, input.idempotencyKey, 1, { freeMeter: input.freeMeter });
  if (!reservation.ok) {
    return { ok: false, status: reservation.reason === "insufficient_credits" ? 402 : 409, error: refusalCode(reservation) };
  }
  const held = reservation.reservationId ?? undefined;
  try {
    const sources = await loadTopicPages(service, { userId: input.userId, prepId: input.prepId, labels: input.topics });
    const results: QuizQuestion[][] = [];
    for (let index = 0; index < sources.length; index += FILL_CONCURRENCY) {
      const batch = sources.slice(index, index + FILL_CONCURRENCY);
      const parts = await Promise.all(
        batch.map(async (source) => {
          if (input.documentBacked && !source.pages.length) return [];
          const outcome = await runTeacherQuiz(service, {
            userId: input.userId,
            actionCode,
            idempotencyKey: input.idempotencyKey,
            freeMeter: input.freeMeter,
            ...(held ? { heldReservationId: held } : {}),
            ...(free ? { charge: false } : {}),
            topicLabel: source.label,
            prepTitle: input.prepTitle,
            pages: source.pages,
            runningHeaders: source.edges,
            mode: source.pages.length ? "document" : "topic",
            count: input.perTopic,
            focus: "practice",
            urgent: !free,
            ...(input.previousStems?.length ? { previousStems: input.previousStems } : {}),
          }).catch(() => null);
          if (!outcome?.ok) return [];
          return outcome.questions.slice(0, input.perTopic).map((question) => ({ ...question, topic: source.label }));
        }),
      );
      results.push(...parts);
    }
    const questions = results.flat();
    const counts = new Map<string, number>();
    for (const question of questions) {
      const key = normalizeTopicKey(question.topic);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const complete = input.topics.every((topic) => (counts.get(normalizeTopicKey(topic)) ?? 0) >= input.perTopic);
    if (!complete) {
      if (held) await refundCredits(service, held).catch(() => undefined);
      return { ok: false, status: 503, error: "generation_failed" };
    }
    if (held) await commitCredits(service, held);
    return { ok: true, questions, missing: [] };
  } catch (error) {
    if (held) await refundCredits(service, held).catch(() => undefined);
    throw error;
  }
}
