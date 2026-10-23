import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isFeatureEnabled, SPACED_REVIEW_FLAG } from "@/lib/admin/feature-flags";
import { istanbulDay } from "@/lib/istanbul-day";
import type { OralExamReport } from "@/lib/learning/oral-exam";
import {
  REVIEW_SESSION_SIZE,
  gradeReviewAnswer,
  interleaveDue,
  nextReviewStep,
  readStoredReviewItem,
  reviewAfterLine,
  reviewDraftsFromAttempt,
  reviewDueOn,
  reviewReveal,
  sealReviewItem,
  type ReviewAnswer,
  type ReviewAnswerOutcome,
  type ReviewDraft,
  type ReviewItemRow,
  type ReviewStatus,
  type ServedReviewItem,
  type StoredReviewItem,
} from "@/lib/learning/review-items";

/**
 * Günü gelen tekrar (20 Ekim 2026) — kayıt katmanı. Tablo `exam_prep_review_items`: doğru cevabı
 * tuttuğu için yalnız sunucu istemcisiyle (satır güvenliği açık, politika yok). Tablo yoksa ya da
 * sorgu düşerse her okuyucu sessizce boş döner: kart görünmez, tamamlama etkilenmez.
 */

const TABLE = "exam_prep_review_items";

function examDay(value: string | null | undefined): string | null {
  const day = typeof value === "string" ? value.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

type ExistingRow = {
  id: string;
  prompt_key: string;
  source_ref: string;
  lapse_count: number | null;
  first_missed_on: string | null;
};

/**
 * Tamamlamadan sonra: yeni yanlış yarına, yeni sınav noktası 3 gün sonraya (ürün sahibinin kararı:
 * doğru cevaplanan sınav noktası 2. basamaktan başlar). Kayıtlı soru yeni bir etkinlikte yeniden
 * yanlışsa 1. güne döner. Aynı tamamlama iki kez gelirse (`source_ref` aynı) hiçbir şey yazılmaz.
 *
 * Sıra: oku → ekle → güncelle; RPC yok (tamamlama işleminin kendi RPC'si değişmez).
 */
export async function recordReviewItems(
  service: SupabaseClient,
  input: {
    userId: string;
    prepId: string;
    nodeId: string | null;
    attemptId: string | null;
    topicId: string | null;
    examDate: string | null;
    drafts: ReviewDraft[];
    now?: Date;
  },
): Promise<{ scheduled: number }> {
  if (!input.drafts.length) return { scheduled: 0 };
  const today = istanbulDay(input.now);
  const examDate = examDay(input.examDate);
  const { data, error } = await service
    .from(TABLE)
    .select("id, prompt_key, source_ref, lapse_count, first_missed_on")
    .eq("exam_prep_id", input.prepId)
    .in(
      "prompt_key",
      input.drafts.map((draft) => draft.promptKey),
    );
  if (error) return { scheduled: 0 };
  const existing = new Map(((data ?? []) as ExistingRow[]).map((row) => [row.prompt_key, row]));
  const stamp = (input.now ?? new Date()).toISOString();

  const fresh: Record<string, unknown>[] = [];
  const lapses: { row: ExistingRow; draft: ReviewDraft; dueOn: string }[] = [];
  for (const draft of input.drafts) {
    const row = existing.get(draft.promptKey);
    if (!row) {
      const dueOn = reviewDueOn({ today, step: draft.reason === "miss" ? 0 : 1, examDate });
      if (!dueOn) continue;
      fresh.push({
        user_id: input.userId,
        exam_prep_id: input.prepId,
        topic_id: input.topicId,
        topic_label: draft.topicLabel,
        node_id: input.nodeId,
        attempt_id: input.attemptId,
        source_kind: draft.sourceKind,
        reason: draft.reason,
        source_ref: draft.sourceRef,
        prompt_key: draft.promptKey,
        item: draft.item,
        interval_step: draft.reason === "miss" ? 0 : 1,
        due_on: dueOn,
        first_missed_on: draft.reason === "miss" ? today : null,
      });
      continue;
    }
    // Sınav noktası zaten kayıtlıysa dokunulmaz; yalnız yeni bir yanlış satırı sıfırlar.
    if (draft.reason !== "miss" || row.source_ref === draft.sourceRef) continue;
    const dueOn = reviewDueOn({ today, step: 0, examDate });
    if (dueOn) lapses.push({ row, draft, dueOn });
  }

  let scheduled = 0;
  if (fresh.length) {
    const { error: insertError } = await service
      .from(TABLE)
      .upsert(fresh, { onConflict: "exam_prep_id,prompt_key", ignoreDuplicates: true });
    if (!insertError) scheduled += fresh.filter((row) => row.reason === "miss").length;
  }
  for (const { row, draft, dueOn } of lapses) {
    const { error: updateError } = await service
      .from(TABLE)
      .update({
        status: "active",
        interval_step: 0,
        due_on: dueOn,
        reason: "miss",
        lapse_count: (row.lapse_count ?? 0) + 1,
        source_ref: draft.sourceRef,
        node_id: input.nodeId,
        attempt_id: input.attemptId,
        first_missed_on: row.first_missed_on ?? today,
        ...(row.first_missed_on ? {} : { first_reasked_on: null, first_reask_correct: null }),
        updated_at: stamp,
      })
      .eq("id", row.id)
      .eq("user_id", input.userId)
      .eq("source_ref", row.source_ref);
    if (!updateError) scheduled += 1;
  }
  return { scheduled };
}

/**
 * Düğüm tamamlandıktan sonra tek çağrı (node rotası): özellik anahtarı, taslaklar, sınav günü, kayıt.
 * Hiçbir zaman fırlatmaz; döndürdüğü sayı sonuç ekranındaki "yarın yeniden sorulacak" satırı.
 * Önceden yazım buraya gelmez: yalnız öğrencinin bitirdiği etkinlik.
 */
export async function scheduleReviewsAfterComplete(
  service: SupabaseClient,
  input: {
    userId: string;
    prepId: string;
    nodeId: string;
    attemptId: string;
    kind: string;
    payload: unknown;
    answers: Record<string, unknown>;
    topicLabel: string | null;
    topicId: string | null;
    oralReport: OralExamReport | null;
    now?: Date;
  },
): Promise<number> {
  try {
    if (!(await isFeatureEnabled(service, SPACED_REVIEW_FLAG))) return 0;
    const drafts = reviewDraftsFromAttempt({
      attemptId: input.attemptId,
      kind: input.kind,
      payload: input.payload,
      answers: input.answers,
      topicLabel: input.topicLabel,
      oralReport: input.oralReport,
    });
    if (!drafts.length) return 0;
    const { data: prep, error } = await service
      .from("exam_preps")
      .select("exam_date")
      .eq("id", input.prepId)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (error || !prep) return 0;
    const { scheduled } = await recordReviewItems(service, {
      userId: input.userId,
      prepId: input.prepId,
      nodeId: input.nodeId,
      attemptId: input.attemptId,
      topicId: input.topicId,
      examDate: ((prep as { exam_date?: string | null }).exam_date as string | null) ?? null,
      drafts,
      now: input.now,
    });
    return scheduled;
  } catch {
    // Tekrar kaydı tamamlamayı geri almaz.
    return 0;
  }
}

/** Bu hazırlıkta bugün sorulacak tekrar. Sınav geçtiyse ya da okuma düşerse 0 (kart görünmez). */
export async function countDueReviewItems(
  service: SupabaseClient,
  input: { userId: string; prepId: string; examDate: string | null; now?: Date },
): Promise<number> {
  const today = istanbulDay(input.now);
  const exam = examDay(input.examDate);
  if (exam && exam < today) return 0;
  try {
    const { count, error } = await service
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .eq("user_id", input.userId)
      .eq("exam_prep_id", input.prepId)
      .eq("status", "active")
      .lte("due_on", today);
    if (error) return 0;
    return Math.max(0, Number(count) || 0);
  } catch {
    return 0;
  }
}

/** Hazırlık sayfası: anahtar kapalıysa 0. */
export async function dueReviewCountForPrep(
  service: SupabaseClient,
  input: { userId: string; prepId: string; examDate: string | null },
): Promise<number> {
  try {
    if (!(await isFeatureEnabled(service, SPACED_REVIEW_FLAG))) return 0;
  } catch {
    return 0;
  }
  return countDueReviewItems(service, input);
}

const ROW_COLUMNS = "id, topic_label, source_kind, reason, item, interval_step, due_on, status, ask_count, lapse_count";

/** Bugünün oturumu: önce yanlışlar, konular arasında sırayla; bozuk satır sessizce atlanır. */
export async function loadDueReviewItems(
  service: SupabaseClient,
  input: { userId: string; prepId: string; examDate: string | null; limit?: number; now?: Date },
): Promise<{ items: ServedReviewItem[]; total: number }> {
  const today = istanbulDay(input.now);
  const exam = examDay(input.examDate);
  if (exam && exam < today) return { items: [], total: 0 };
  try {
    const { data, error } = await service
      .from(TABLE)
      .select(ROW_COLUMNS)
      .eq("user_id", input.userId)
      .eq("exam_prep_id", input.prepId)
      .eq("status", "active")
      .lte("due_on", today)
      .order("due_on", { ascending: true })
      .limit(200);
    if (error || !data) return { items: [], total: 0 };
    const sealed = interleaveDue(data as ReviewItemRow[]).flatMap((row) => {
      const item = sealReviewItem(row);
      return item ? [item] : [];
    });
    return { items: sealed.slice(0, input.limit ?? REVIEW_SESSION_SIZE), total: sealed.length };
  } catch {
    return { items: [], total: 0 };
  }
}

type AnswerRow = ReviewItemRow & {
  correct_count: number;
  last_answered_on: string | null;
  last_result: boolean | null;
  first_missed_on: string | null;
  first_reasked_on: string | null;
};

export type { ReviewAnswerOutcome };

export type ReviewAnswerError = { error: "not_found" | "not_due" | "invalid_answer" | "save_failed" };

function outcomeFor(
  item: StoredReviewItem,
  askedAt: number,
  result: { correct: boolean; step: number; dueOn: string | null; status: ReviewStatus },
  today: string,
  remaining: number,
): ReviewAnswerOutcome {
  return {
    correct: result.correct,
    mode: item.mode,
    ...reviewReveal(item, askedAt),
    step: result.step,
    dueOn: result.dueOn,
    status: result.status,
    line: reviewAfterLine({ mode: item.mode, correct: result.correct, status: result.status, dueOn: result.dueOn, today }),
    remaining,
  };
}

const ANSWER_COLUMNS = `${ROW_COLUMNS}, correct_count, last_answered_on, last_result, first_missed_on, first_reasked_on`;

/** Kayıtlı cevap: aynı gün ikinci tıklama ya da ikinci sekme yeniden yazmaz. */
function storedOutcome(row: AnswerRow, item: StoredReviewItem, today: string, remaining: number): ReviewAnswerOutcome {
  const status = (row.status as ReviewStatus) ?? "active";
  return outcomeFor(
    item,
    Math.max(0, row.ask_count - 1),
    {
      correct: row.last_result === true,
      step: row.interval_step,
      dueOn: status === "active" ? row.due_on : null,
      status,
    },
    today,
    remaining,
  );
}

/**
 * Cevap sunucuda notlanır; anahtar istemciye cevaptan önce gitmez. İyimser eşzamanlılık:
 * güncelleme `ask_count` eşitse yazar; başka sekme önce yazdıysa kayıtlı sonuç döner.
 */
export async function answerReviewItem(
  service: SupabaseClient,
  input: {
    userId: string;
    prepId: string;
    itemId: string;
    answer: ReviewAnswer;
    examDate: string | null;
    now?: Date;
  },
): Promise<ReviewAnswerOutcome | ReviewAnswerError> {
  const today = istanbulDay(input.now);
  const examDate = examDay(input.examDate);
  const remaining = () => countDueReviewItems(service, { userId: input.userId, prepId: input.prepId, examDate, now: input.now });
  const read = async () => {
    const { data, error } = await service
      .from(TABLE)
      .select(ANSWER_COLUMNS)
      .eq("id", input.itemId)
      .eq("user_id", input.userId)
      .eq("exam_prep_id", input.prepId)
      .maybeSingle();
    return error ? null : ((data as AnswerRow | null) ?? null);
  };

  const row = await read();
  if (!row) return { error: "not_found" };
  const item = readStoredReviewItem(row.item);
  if (!item) return { error: "not_found" };
  if (row.last_answered_on === today && row.ask_count > 0) return storedOutcome(row, item, today, await remaining());
  if (row.status !== "active" || row.due_on > today) return { error: "not_due" };

  const correct = gradeReviewAnswer(item, row.ask_count, input.answer);
  if (correct === null) return { error: "invalid_answer" };
  const next = nextReviewStep({ step: row.interval_step, correct, today, examDate });
  const firstReask = Boolean(row.first_missed_on && !row.first_reasked_on);
  const { data: updated, error } = await service
    .from(TABLE)
    .update({
      interval_step: next.step,
      due_on: next.dueOn ?? row.due_on,
      status: next.status,
      ask_count: row.ask_count + 1,
      correct_count: (row.correct_count ?? 0) + (correct ? 1 : 0),
      lapse_count: (row.lapse_count ?? 0) + (correct ? 0 : 1),
      last_answered_on: today,
      last_result: correct,
      ...(firstReask ? { first_reasked_on: today, first_reask_correct: correct } : {}),
      updated_at: (input.now ?? new Date()).toISOString(),
    })
    .eq("id", row.id)
    .eq("user_id", input.userId)
    .eq("ask_count", row.ask_count)
    .select("id");
  if (error) return { error: "save_failed" };
  if (Array.isArray(updated) && updated.length) {
    // Tekrar doğruluğu basamak basamak (23 Ekim 2026): cevap anındaki basamak (0 = 1. gün … 3 = 14. gün).
    // Ölçü kaydıdır; yazılamazsa (tablo yoksa) cevap yine geçerli.
    try {
      await service.from("exam_prep_review_answers").insert({
        user_id: input.userId,
        exam_prep_id: input.prepId,
        item_id: row.id,
        topic_label: row.topic_label ?? null,
        step: Math.max(0, Math.min(3, row.interval_step ?? 0)),
        correct,
        answered_on: today,
      });
    } catch {
      /* ölçü kaydı isteğe bağlı */
    }
  }
  if (!Array.isArray(updated) || !updated.length) {
    const again = await read();
    if (again && again.last_answered_on === today && again.ask_count > row.ask_count) {
      return storedOutcome(again, item, today, await remaining());
    }
    return { error: "save_failed" };
  }
  return outcomeFor(item, row.ask_count, { correct, ...next }, today, await remaining());
}
