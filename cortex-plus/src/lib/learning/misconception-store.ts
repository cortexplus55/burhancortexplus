import type { SupabaseClient } from "@supabase/supabase-js";
import {
  misconceptionsToResolve,
  type OpenMisconceptionRow,
  type ResolvingEvidenceRow,
} from "@/lib/learning/misconception-resolution";

/**
 * Açık yanılgı okumaları (20 Ekim 2026). `resolved_at` sütunu göç `20261020170000` ile geliyor.
 *
 * Kod göçten önce yayına çıkarsa süzgeç 42703 ("sütun yok") verir. Hata sessizce 0 sayılırsa
 * öğrenci "açık yanlışın yok" görür, "Hazırsın" haksız yere açılır. Bu yüzden süzgeçli sorgu
 * düşerse aynı sorgu süzgeçsiz yeniden koşar: bütün satırlar açık sayılır (eski davranış).
 */
export async function withOpenMisconceptions<R extends { error: unknown }>(
  run: (onlyOpen: boolean) => PromiseLike<R>,
): Promise<R> {
  try {
    const open = await run(true);
    if (!open.error) return open;
  } catch {
    // Süzgeç kurulamadıysa da eski sorgu.
  }
  return run(false);
}

/**
 * Açık yanılgı sayısı. `userId` verilmezse RLS'li istemci kendi satırlarını sayar.
 * İki okuma da düşerse (geçici hata) sayı bilinmiyor: `null`. Çağıran 0 sanmaz; "Hazırsın" kapalı kalır
 * (22 Ekim 2026 inceleme: `count ?? 0` okunamayan sayıyı "açık yanlış yok" diye yazıyordu).
 */
export async function countOpenMisconceptions(
  client: SupabaseClient,
  input: { userId?: string; prepId: string },
): Promise<number | null> {
  const { count, error } = await withOpenMisconceptions((onlyOpen) => {
    let query = client
      .from("exam_prep_misconceptions")
      .select("id", { count: "exact", head: true })
      .eq("exam_prep_id", input.prepId);
    if (input.userId) query = query.eq("user_id", input.userId);
    return onlyOpen ? query.is("resolved_at", null) : query;
  });
  return error ? null : (count ?? 0);
}

/** Çözülmüş yanılgı sayısı; sütun yoksa 0 (hiçbiri çözülmemiş sayılır). */
export async function countResolvedMisconceptions(
  client: SupabaseClient,
  input: { userId?: string; prepId: string },
): Promise<number> {
  let query = client
    .from("exam_prep_misconceptions")
    .select("id", { count: "exact", head: true })
    .eq("exam_prep_id", input.prepId)
    .not("resolved_at", "is", null);
  if (input.userId) query = query.eq("user_id", input.userId);
  const { count, error } = await query;
  return error ? 0 : (count ?? 0);
}

/**
 * Bu tamamlamanın doğru cevaplarından sonra çözülen yanılgılara `resolved_at` yazar.
 * Okuma ya da yazma düşerse hiçbir şey çözülmez (satırlar açık kalır); tamamlama etkilenmez.
 */
export async function resolveMisconceptionsAfterEvidence(
  service: SupabaseClient,
  input: { userId: string; prepId: string; plannedTopicKeys: string[]; now?: Date },
): Promise<string[]> {
  const { data: openRows, error: openError } = await service
    .from("exam_prep_misconceptions")
    .select("id, topic_label, attempt_id, created_at")
    .eq("user_id", input.userId)
    .eq("exam_prep_id", input.prepId)
    .is("resolved_at", null)
    .order("created_at", { ascending: true })
    .limit(200);
  if (openError || !openRows?.length) return [];

  const open: OpenMisconceptionRow[] = openRows.map((row) => ({
    id: String(row.id),
    topicLabel: (row.topic_label as string | null) ?? null,
    attemptId: (row.attempt_id as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
  }));
  const oldest = open
    .map((row) => row.createdAt)
    .filter(Boolean)
    .sort()[0];
  if (!oldest) return [];

  const { data: evidenceRows, error: evidenceError } = await service
    .from("exam_prep_answer_evidence")
    .select("topic_key, attempt_id, created_at")
    .eq("user_id", input.userId)
    .eq("exam_prep_id", input.prepId)
    .eq("correct", true)
    .eq("hint_assisted", false)
    .gte("created_at", oldest)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (evidenceError || !evidenceRows?.length) return [];

  const evidence: ResolvingEvidenceRow[] = evidenceRows.map((row) => ({
    topicKey: (row.topic_key as string | null) ?? null,
    attemptId: (row.attempt_id as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
  }));
  const ids = misconceptionsToResolve({ open, evidence, plannedTopicKeys: input.plannedTopicKeys });
  if (!ids.length) return [];

  const { error } = await service
    .from("exam_prep_misconceptions")
    .update({ resolved_at: (input.now ?? new Date()).toISOString() })
    .in("id", ids)
    .is("resolved_at", null);
  return error ? [] : ids;
}
