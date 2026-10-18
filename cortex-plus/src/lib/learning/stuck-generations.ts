import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { refundCredits } from "@/lib/credits/service";

/**
 * Takılı üretimler (18 Ekim 2026, satışa hazırlık planı 4.3).
 *
 * Bir ders/test/podcast yazımı sunucu kesilince (zaman sınırı, dağıtım) `creating`de
 * kalabiliyor: öğrenci "hazırlanıyor" ekranında bekler, kredi rezervasyonu askıda durur.
 * Yazım 120 sn ilerlemezse kendi kapanır; kapanmayanı buradan yönetici kapatır:
 * iş `failed`, oturum `failed`, yarım önceden-yazım silinir, askıdaki rezervasyon iade.
 * Hiçbir adım öğrencinin bitmiş içeriğine dokunmaz.
 */
export const STUCK_AFTER_MS = 10 * 60_000;

export type StuckGeneration = {
  id: string;
  userId: string;
  prepId: string;
  nodeId: string;
  attemptId: string | null;
  clientRequestId: string | null;
  creditKey: string | null;
  updatedAt: string;
};

type JobRow = {
  id: string;
  user_id: string;
  exam_prep_id: string;
  node_id: string;
  attempt_id: string | null;
  client_request_id: string | null;
  credit_idempotency_key: string | null;
  status: string;
  updated_at: string;
};

function toStuck(row: JobRow): StuckGeneration {
  return {
    id: row.id,
    userId: row.user_id,
    prepId: row.exam_prep_id,
    nodeId: row.node_id,
    attemptId: row.attempt_id,
    clientRequestId: row.client_request_id,
    creditKey: row.credit_idempotency_key,
    updatedAt: row.updated_at,
  };
}

export async function listStuckGenerations(
  service: SupabaseClient,
  options: { olderThanMs?: number; limit?: number; now?: number } = {},
): Promise<{ rows: StuckGeneration[]; error: boolean }> {
  const cutoff = new Date((options.now ?? Date.now()) - (options.olderThanMs ?? STUCK_AFTER_MS)).toISOString();
  const { data, error } = await service
    .from("exam_prep_generation_jobs")
    .select("id, user_id, exam_prep_id, node_id, attempt_id, client_request_id, credit_idempotency_key, status, updated_at")
    .eq("status", "creating")
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(options.limit ?? 50);
  if (error) return { rows: [], error: true };
  return { rows: ((data ?? []) as JobRow[]).map(toStuck), error: false };
}

export type StuckResetResult =
  | { ok: true; attemptClosed: boolean; prefetchDropped: boolean; refunded: number }
  | { ok: false; error: "not_found" | "not_stuck" | "job_update_failed" };

export async function resetStuckGeneration(
  service: SupabaseClient,
  jobId: string,
): Promise<StuckResetResult> {
  const { data } = await service
    .from("exam_prep_generation_jobs")
    .select("id, user_id, exam_prep_id, node_id, attempt_id, client_request_id, credit_idempotency_key, status, updated_at")
    .eq("id", jobId)
    .maybeSingle();
  const job = (data ?? null) as JobRow | null;
  if (!job) return { ok: false, error: "not_found" };
  if (job.status !== "creating") return { ok: false, error: "not_stuck" };

  const now = new Date().toISOString();
  const { error: jobError } = await service
    .from("exam_prep_generation_jobs")
    .update({ status: "failed", error_code: "admin_reset", updated_at: now })
    .eq("id", job.id)
    .eq("status", "creating");
  if (jobError) return { ok: false, error: "job_update_failed" };

  // Oturum yalnız hâlâ yazılıyorsa kapanır; öğrencinin açtığı/bitirdiği oturuma dokunulmaz.
  let attemptClosed = false;
  if (job.attempt_id) {
    const { data: closed } = await service
      .from("exam_prep_node_attempts")
      .update({ status: "failed", updated_at: now })
      .eq("id", job.attempt_id)
      .eq("status", "creating")
      .select("id");
    attemptClosed = Boolean(closed && (closed as unknown[]).length);
  }

  // Aynı düğümün yarım kalmış önceden-yazımı: hazır olanlar kalır.
  const { data: dropped } = await service
    .from("exam_prep_prefetch")
    .delete()
    .eq("node_id", job.node_id)
    .eq("user_id", job.user_id)
    .eq("status", "creating")
    .select("node_id");
  const prefetchDropped = Boolean(dropped && (dropped as unknown[]).length);

  // Askıdaki rezervasyon: aynı anahtar, hâlâ pending → iade. Kesinleşmiş krediye dokunulmaz.
  let refunded = 0;
  if (job.credit_idempotency_key) {
    const { data: reservations } = await service
      .from("credit_reservations")
      .select("id")
      .eq("idempotency_key", job.credit_idempotency_key)
      .eq("status", "pending");
    for (const row of (reservations ?? []) as { id: string }[]) {
      try {
        await refundCredits(service, row.id);
        refunded += 1;
      } catch {
        // tek satır düşmesin diye devam; sayaç yöneticiye gerçeği söyler
      }
    }
  }

  return { ok: true, attemptClosed, prefetchDropped, refunded };
}
