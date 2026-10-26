/**
 * generation_jobs satırı. Tablo yoksa çağıran eşzamanlı yola döner.
 * Yazma ve okuma yalnız service_role. Öğrenci istemcisi bu tabloyu görmez.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { missingRelation } from "@/lib/learning/missing-column";
import { JOB_LEASE_MS } from "@/lib/learning/generation-job";

export type GenerationJobKind =
  | "mock_exam"
  | "topic_quiz"
  | "true_false"
  | "flashcards"
  | "final_check"
  | "focused"
  | "lesson_section"
  | "podcast"
  | "gaps";

export type GenerationJobState = "queued" | "running" | "done" | "failed";

export type GenerationJobRow = {
  id: string;
  user_id: string;
  prep_id: string | null;
  node_id: string | null;
  kind: GenerationJobKind;
  spec: Record<string, unknown>;
  state: GenerationJobState;
  progress: Record<string, unknown>;
  result_ref: string | null;
  attempts: number;
  charge_reservation_id: string | null;
  lease_until: string | null;
  created_at: string;
  updated_at: string;
};

type DbError = { code?: string; message?: string } | null;

function asRow(value: unknown): GenerationJobRow | null {
  if (!value || typeof value !== "object") return null;
  return value as GenerationJobRow;
}

export function jobSchemaMissing(error: DbError): boolean {
  return missingRelation(error);
}

/** Boş tablo dizi döner. Hata ya da dizi olmayan cevap tablo yok sayılır. */
export async function generationJobsReady(service: SupabaseClient): Promise<boolean> {
  const { data, error } = await service.from("generation_jobs").select("id").limit(1);
  if (error || !Array.isArray(data)) return false;
  return true;
}

export async function loadGenerationJob(service: SupabaseClient, id: string): Promise<GenerationJobRow | null> {
  const { data, error } = await service.from("generation_jobs").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return asRow(data);
}

export async function findActivePrepJob(
  service: SupabaseClient,
  userId: string,
  prepId: string,
  kind: GenerationJobKind,
): Promise<GenerationJobRow | null | "missing"> {
  const { data, error } = await service
    .from("generation_jobs")
    .select("*")
    .eq("user_id", userId)
    .eq("prep_id", prepId)
    .eq("kind", kind)
    .is("node_id", null)
    .in("state", ["queued", "running"])
    .limit(1);
  if (jobSchemaMissing(error)) return "missing";
  if (error || !Array.isArray(data) || !data.length) return null;
  return asRow(data[0]);
}

export async function insertGenerationJob(
  service: SupabaseClient,
  row: {
    userId: string;
    prepId: string | null;
    nodeId?: string | null;
    kind: GenerationJobKind;
    spec: Record<string, unknown>;
  },
): Promise<{ row: GenerationJobRow } | { duplicate: true } | { missing: true } | { error: true }> {
  const { data, error } = await service
    .from("generation_jobs")
    .insert({
      user_id: row.userId,
      prep_id: row.prepId,
      node_id: row.nodeId ?? null,
      kind: row.kind,
      spec: row.spec,
      state: "queued",
      progress: { ready: 0, promised: 0, items: [] },
      attempts: 0,
    })
    .select("*")
    .single();
  if (jobSchemaMissing(error)) return { missing: true };
  if (error && String(error.code) === "23505") return { duplicate: true };
  const parsed = asRow(data);
  if (error || !parsed) return { error: true };
  return { row: parsed };
}

export async function patchGenerationJob(
  service: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
  match: { leaseUntil?: string | null } = {},
): Promise<boolean> {
  let query = service.from("generation_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (match.leaseUntil) query = query.eq("lease_until", match.leaseUntil);
  const { data, error } = await query.select("id");
  if (error || !Array.isArray(data) || !data.length) return false;
  return true;
}

/**
 * Kirası düşmüş işi alır. 0 satır: başka işçi tutuyor.
 * Bellekteki pompa, kira yeni yazıldığı için kendini atlamasın diye leaseUntil null ile çağrılır.
 */
export async function claimGenerationJob(
  service: SupabaseClient,
  id: string,
  now = Date.now(),
): Promise<{ row: GenerationJobRow; leaseUntil: string } | null> {
  const current = await loadGenerationJob(service, id);
  if (!current) return null;
  if (current.state === "done" || current.state === "failed") return null;
  if (current.lease_until && Date.parse(current.lease_until) > now) return null;
  const leaseUntil = new Date(now + JOB_LEASE_MS).toISOString();
  let query = service
    .from("generation_jobs")
    .update({
      state: "running",
      lease_until: leaseUntil,
      updated_at: new Date(now).toISOString(),
    })
    .eq("id", id)
    .in("state", ["queued", "running"]);
  query = current.lease_until ? query.eq("lease_until", current.lease_until) : query.is("lease_until", null);
  const { data, error } = await query.select("*");
  if (error || !Array.isArray(data) || !data.length) return null;
  const row = asRow(data[0]);
  if (!row) return null;
  return { row, leaseUntil };
}

export async function listDueGenerationJobs(service: SupabaseClient, limit = 8): Promise<GenerationJobRow[]> {
  const { data, error } = await service
    .from("generation_jobs")
    .select("*")
    .in("state", ["queued", "running"])
    .order("updated_at", { ascending: true })
    .limit(40);
  if (error || !Array.isArray(data)) return [];
  const now = Date.now();
  return data
    .map((row) => asRow(row))
    .filter((row): row is GenerationJobRow => {
      if (!row) return false;
      if (!row.lease_until) return true;
      return Date.parse(row.lease_until) <= now;
    })
    .slice(0, limit);
}
