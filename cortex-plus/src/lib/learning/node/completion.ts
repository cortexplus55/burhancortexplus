/** Bitirmenin sahipliği ve saklı sonucu (Paket I): çift notlandırma yok, yoklama aynı gövdeyi döndürür. */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NODE_MAX_DURATION_SECONDS, readWalletBalance } from "./shared";
import { writtenReviewForPayload } from "./written-review";
import { oralReviewFromPayload } from "./oral";
import { lessonScoreForClient } from "./score";

/*
 * Bitirmenin sahipliği (30 Ekim 2026, Paket I). Canlıda sözlü denemenin son cevabı 2-6 dk
 * "Gönderiliyor…"da kaldı: sunucu hakem çağrısını bitirme isteğinin içinde bekliyordu, istemci
 * zaman aşımına düşüp yeniden gönderince ikinci bir notlandırma başlıyordu. Artık bitirme kaydı
 * `complete_request_id` ile sahiplenir (açık kayıt + dolu kimlik = notlanıyor); ikinci istek
 * notlamaz, "bekle" der. Notlandırma işlevi öldüyse sahiplik `updated_at`'ten bu kadar sonra bayatlar.
 */
export const COMPLETION_CLAIM_STALE_MS = (NODE_MAX_DURATION_SECONDS + 60) * 1000;

export type CompletionOutcome = { ok: true; body: Record<string, unknown> } | { ok: false; code: string };

export function completionClaimFresh(
  attempt: { status?: unknown; complete_request_id?: unknown; updated_at?: unknown },
  now = Date.now(),
): boolean {
  if (attempt.status !== "active" || typeof attempt.complete_request_id !== "string") return false;
  const at = typeof attempt.updated_at === "string" ? Date.parse(attempt.updated_at) : Number.NaN;
  if (Number.isNaN(at)) return true;
  return now - at < COMPLETION_CLAIM_STALE_MS;
}

/**
 * Açık kaydı bu bitirme için sahiplenir; cevaplar da yazılır (arka plan işlevi ölürse yeniden
 * notlandırma bunları okur). "unknown": yazım doğrulanamadı — eski davranış, yanıt içinde notlanır.
 */
export async function claimCompletion(
  service: SupabaseClient,
  input: {
    attemptId: string;
    current: string | null;
    updatedAt: string | null;
    claimId: string;
    answers: Record<string, unknown>;
  },
): Promise<"claimed" | "busy" | "unknown"> {
  if (input.current && completionClaimFresh({ status: "active", complete_request_id: input.current, updated_at: input.updatedAt })) {
    return "busy";
  }
  try {
    let query = service
      .from("exam_prep_node_attempts")
      .update({
        complete_request_id: input.claimId,
        answers: input.answers,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.attemptId)
      .eq("status", "active");
    // Bayat sahiplik yalnız aynı değer hâlâ duruyorsa devralınır (iki istek aynı anda devralamaz).
    query = input.current ? query.eq("complete_request_id", input.current) : query.is("complete_request_id", null);
    const { data, error } = (await query.select("id")) as { data?: unknown; error?: unknown };
    if (error || !Array.isArray(data)) return "unknown";
    return data.length ? "claimed" : "busy";
  } catch {
    return "unknown";
  }
}

export async function releaseCompletionClaim(service: SupabaseClient, attemptId: string, claimId: string) {
  await service
    .from("exam_prep_node_attempts")
    .update({ complete_request_id: null })
    .eq("id", attemptId)
    .eq("status", "active")
    .eq("complete_request_id", claimId);
}


/** Arka planda notlanan kaydın sonuç ekranı bilgileri; yoklama bunları geri verir. */
export const COMPLETE_RESULT_KEYS = ["nextHref", "stars", "topicGain", "pathChange", "reviewScheduled", "levelHint"] as const;

export async function storeCompletionResult(service: SupabaseClient, attemptId: string, body: Record<string, unknown>) {
  const { data } = await service.from("exam_prep_node_attempts").select("payload").eq("id", attemptId).maybeSingle();
  const base = data?.payload && typeof data.payload === "object" ? (data.payload as Record<string, unknown>) : {};
  const completeResult = Object.fromEntries(COMPLETE_RESULT_KEYS.map((key) => [key, body[key] ?? null]));
  await service
    .from("exam_prep_node_attempts")
    .update({ payload: { ...base, completeResult } })
    .eq("id", attemptId);
}

export function completeResultFromPayload(payload: unknown): Record<string, unknown> | null {
  const stored = (payload as { completeResult?: unknown } | null)?.completeResult;
  return stored && typeof stored === "object" ? (stored as Record<string, unknown>) : null;
}

/** Bitmiş kaydın saklı sonucu: tekrar gelen bitirme ve sonuç yoklaması aynı gövdeyi döndürür. */
export async function completedAttemptBody(
  service: SupabaseClient,
  input: {
    userId: string;
    prepId: string;
    nodeId: string;
    topicLabel: string;
    attempt: { id: unknown; payload: unknown; answers: unknown; score: unknown; total: unknown };
    nextAfter: () => PromiseLike<{ data: { id?: unknown } | null }>;
  },
): Promise<Record<string, unknown>> {
  const { attempt, prepId } = input;
  const answers = (attempt.answers as Record<string, unknown> | null) ?? {};
  const { data: nextRow } = await input.nextAfter();
  const review = await writtenReviewForPayload(service, {
    userId: input.userId,
    prepId,
    attemptId: attempt.id as string,
    nodeId: input.nodeId,
    payload: attempt.payload,
    answers,
    topicLabel: input.topicLabel,
    allowFill: false,
  }).catch(() => null);
  const stored = lessonScoreForClient(
    attempt.payload,
    answers,
    (attempt.score as number | null) ?? 0,
    (attempt.total as number | null) ?? 1,
  );
  const extras = completeResultFromPayload(attempt.payload) ?? {};
  const savedNext = typeof extras.nextHref === "string" ? extras.nextHref : null;
  return {
    ...Object.fromEntries(Object.entries(extras).filter(([key, value]) => key !== "nextHref" && value !== null)),
    ok: true,
    score: stored.score,
    total: stored.total,
    retried: stored.retried,
    nextHref:
      savedNext ??
      (nextRow?.id ? `/deneme-sinavlari/${prepId}/dugum/${String(nextRow.id)}` : `/deneme-sinavlari/${prepId}`),
    state: "completed",
    idempotent: true,
    review,
    oralReview: oralReviewFromPayload(attempt.payload),
    ...(await readWalletBalance(service, input.userId)),
  };
}
