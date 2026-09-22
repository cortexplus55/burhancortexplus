import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Kullanıcı verisini siler (KVKK self-serve).
 *
 * Finansal kayıtlar (payments, credit_ledger satırları abonelik sonrası)
 * yasal zorunluluk nedeniyle tutulur; profil PII anonimleştirilir.
 * Belgeler soft-delete + storage silinir; sohbet/quiz/exam user scope silinir.
 */
export async function purgeUserData(
  service: SupabaseClient,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // 1) Belgeler — storage + soft delete
  const { data: docs } = await service
    .from("documents")
    .select("id, storage_path")
    .eq("user_id", userId)
    .is("deleted_at", null);

  const paths = (docs ?? [])
    .map((d) => d.storage_path as string | null)
    .filter((p): p is string => Boolean(p));
  if (paths.length) {
    await service.storage.from("documents").remove(paths);
  }
  await service
    .from("documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("deleted_at", null);

  // 2) Sohbet / öğrenme içerikleri
  await service.from("messages").delete().eq("user_id", userId);
  await service.from("conversations").delete().eq("user_id", userId);
  await service.from("quizzes").delete().eq("user_id", userId);
  await service.from("flashcard_sets").delete().eq("user_id", userId);
  await service.from("practice_exams").delete().eq("user_id", userId);
  await service.from("study_plans").delete().eq("user_id", userId);
  await service.from("learning_goals").delete().eq("user_id", userId);
  await service.from("notifications").delete().eq("user_id", userId);
  await service.from("exam_preps").delete().eq("user_id", userId);

  // 3) Aboneliği kapat (ödeme geçmişi kalır)
  await service
    .from("subscriptions")
    .update({
      status: "cancelled",
      cancel_at_period_end: true,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("status", "active");

  // 4) Profil PII anonimleştir
  const { error: profileError } = await service
    .from("profiles")
    .update({
      full_name: "Silinmiş hesap",
      avatar_url: null,
      focus_subject: null,
      grade_level: null,
      school_name: null,
      onboarding_completed_at: null,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (profileError) {
    return { ok: false, error: profileError.message };
  }

  // 5) Auth kullanıcısını sil (mümkünse)
  try {
    await service.auth.admin.deleteUser(userId);
  } catch (err) {
    console.error("account_auth_delete_failed", {
      userId,
      message: err instanceof Error ? err.message : "unknown",
    });
  }

  return { ok: true };
}

export async function processPendingDeletionRequests(
  service: SupabaseClient,
  limit = 20,
): Promise<number> {
  const { data: pending } = await service
    .from("data_deletion_requests")
    .select("id, user_id")
    .is("processed_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  let processed = 0;
  for (const row of pending ?? []) {
    const result = await purgeUserData(service, row.user_id as string);
    if (!result.ok) {
      console.error("data_deletion_failed", {
        requestId: row.id,
        userId: row.user_id,
        error: result.error,
      });
      continue;
    }
    await service
      .from("data_deletion_requests")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", row.id);
    processed += 1;
  }
  return processed;
}
