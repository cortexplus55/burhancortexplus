import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isOwnedDocumentPath } from "@/lib/documents/storage-path";
import { missingRelation } from "@/lib/learning/missing-column";

// Financial records retain the anonymised profile key: for accounts with payments the auth user is only
// soft-deleted, because hard-deleting it would cascade through the profile and destroy the payment trail.
// Accounts without payments are removed completely (see deleteAuthUser).
const USER_CONTENT_TABLES = [
  "phone_upload_sessions", "exam_prep_generation_jobs", "exam_preps",
  "practice_exam_attempts", "practice_exams", "quiz_attempts", "quizzes",
  "flashcard_reviews", "flashcard_sets", "messages", "conversations",
  "study_plans", "learning_goals", "mistake_entries", "daily_drills",
  "calendar_events", "notifications", "user_progress", "mastery_scores",
  "weak_topics", "study_session_moods", "user_streaks", "user_activity_days", "learning_time",
  "classroom_posts", "user_apps", "lab_app_plays", "lab_app_ratings", "lab_puzzle_runs",
  "teacher_applications", "teacher_verifications", "teacher_usage",
  "support_requests", "email_events", "ai_usage_events", "ai_validation_events",
  "document_page_grants", "model_upgrade_grants", "abuse_events", "user_roles",
  "adaptive_jev_decisions", "adaptive_learning_events", "adaptive_learning_sessions",
  "adaptive_scheduled_reviews", "adaptive_daily_plan_items", "adaptive_daily_plans",
  "adaptive_master_plans",
  // 19 Ekim 2026: yıldız kayıtları, kurulum taslağı ve haftalık anket de öğrencinin verisi. İlk ikisi listede
  // yoktu: profil anonimleşse de satırlar kalıyordu (silme işçisi profili silmez, CASCADE çalışmaz).
  "star_events", "exam_wizard_drafts", "weekly_surveys", "open_timings",
  // 20 Ekim 2026: günü gelen tekrar kayıtları. Hazırlık silinince CASCADE; hesap silinince burada
  // (silme işçisi hazırlığı değil profili anonimleştirir). Tablo canlıda olmadan bu satır yayına çıkmaz.
  "exam_prep_review_items",
  // 24 Ekim 2026: ücretsiz katmanın sayaçları (haftalık ders, günlük mesaj/fotoğraf). Tablo koddan önce gelir:
  // 20261024121000 yalnız ekleme yapar ve kod yayınından ÖNCE uygulanır (KREDI-SISTEMI.md, "Canlıya geçiş"
  // a). Tablo yokken bu adım düşer ve silme isteği bekler; sıra bu yüzden önemli.
  "free_usage",
  // 25 Ekim 2026: anlatarak öğren geçmişi. Göç canlıda yoksa silme bu tabloyu atlar (missingRelation).
  "explain_attempts",
  // 31 Ekim 2026: hızlı başlatmanın bekleyen materyali. Hazırlık silinince CASCADE; tablo yoksa atlanır.
  "exam_prep_pending_materials",
  // 31 Ekim 2026: cihaz sınırının oturum kayıtları (tarayıcı bilgisi dahil). Silme işçisi auth.users'ı silmez,
  // CASCADE çalışmaz; satırlar burada gider. Göç canlıda yoksa atlanır.
  "user_device_sessions",
  // 31 Ekim 2026 (Paket J2 #10): soru hata bildirimleri. Tablo yoksa atlanır.
  "question_reports",
] as const;

const OPTIONAL_PURGE_TABLES = new Set([
  "explain_attempts",
  "exam_prep_pending_materials",
  "user_device_sessions",
  "question_reports",
]);

/**
 * Ödeme kaydı olmayan hesapta auth kullanıcısı tamamen silinir (KVKK: "hesabın kapanır" = giriş kaydı da gider).
 * Ödeme kaydı varsa (payments / parent_payment_requests) yasal saklama için yumuşak silme: e-posta
 * anonimleşir, giriş kapanır, ödeme satırları CASCADE ile yok olmaz. Sert silme bir kısıt yüzünden
 * düşerse yine yumuşak silmeye iner; ikisi de düşerse adım başarısız sayılır ve cron yeniden dener.
 */
export async function hasFinancialRecords(service: SupabaseClient, userId: string): Promise<boolean> {
  for (const [table, column] of [["payments", "user_id"], ["payments", "beneficiary_user_id"], ["parent_payment_requests", "student_id"]] as const) {
    const { count, error } = await service.from(table).select("id", { count: "exact", head: true }).eq(column, userId);
    if (error) return true; // emin değilsek kaydı koru
    if ((count ?? 0) > 0) return true;
  }
  return false;
}

async function deleteAuthUser(service: SupabaseClient, userId: string): Promise<"hard" | "soft" | null> {
  const gone = (error: { code?: string } | null) => !error || error.code === "user_not_found";
  if (!(await hasFinancialRecords(service, userId))) {
    const { error } = await service.auth.admin.deleteUser(userId, false);
    if (gone(error)) return "hard";
  }
  const { error } = await service.auth.admin.deleteUser(userId, true);
  return gone(error) ? "soft" : null;
}

/**
 * Bu düzeltmeden önce tamamlanan taleplerde auth kaydı yumuşak silinmiş kaldı. Son 60 günde tamamlanan ve ödeme
 * kaydı olmayan taleplerin auth kullanıcısını tamamen siler (profil + talep satırı CASCADE ile gider, yani
 * iş kendini sınırlar). Tekrar çalışması zararsız: silinmiş kullanıcıda user_not_found döner.
 */
export async function finalizeCompletedDeletions(service: SupabaseClient, limit = 50): Promise<number> {
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const { data, error } = await service.from("data_deletion_requests")
    .select("id, user_id").eq("status", "completed").gte("processed_at", since).limit(limit);
  if (error) return 0;
  let removed = 0;
  for (const row of data ?? []) {
    const userId = row.user_id as string;
    if (await hasFinancialRecords(service, userId)) continue;
    const { error: deleteError } = await service.auth.admin.deleteUser(userId, false);
    if (!deleteError) removed += 1;
    else if (deleteError.code !== "user_not_found") console.error("data_deletion_finalize_failed", { requestId: row.id });
  }
  return removed;
}

/** Every step is checked and repeatable by the deletion worker. */
export async function purgeUserData(service: SupabaseClient, userId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  let step = "profile_disable";
  try {
    const { error: disableError } = await service.from("profiles")
      .update({ deleted_at: new Date().toISOString() }).eq("id", userId);
    if (disableError) return { ok: false, error: step };

    step = "subscription_cancel";
    const { error: subscriptionError } = await service.from("subscriptions")
      .update({ status: "cancelled", cancel_at_period_end: true, updated_at: new Date().toISOString() })
      .eq("user_id", userId).eq("status", "active");
    if (subscriptionError) return { ok: false, error: step };

    for (const table of USER_CONTENT_TABLES) {
      step = `purge_${table}`;
      const { error } = await service.from(table).delete().eq("user_id", userId);
      if (error && OPTIONAL_PURGE_TABLES.has(table) && missingRelation(error)) continue;
      if (error) return { ok: false, error: step };
    }
    for (const table of ["classroom_members", "assignment_submissions"]) {
      step = `purge_${table}`;
      const { error } = await service.from(table).delete().eq("student_id", userId);
      if (error) return { ok: false, error: step };
    }

    // Include soft-deleted documents and page beyond the API's default row cap.
    while (true) {
      step = "documents_list";
      const { data: docs, error } = await service.from("documents")
        .select("id, storage_path").eq("user_id", userId).limit(100);
      if (error) return { ok: false, error: step };
      if (!docs?.length) break;
      if (docs.some((d) => !isOwnedDocumentPath(d.storage_path, userId, d.id))) {
        return { ok: false, error: "documents_storage_path" };
      }
      const paths = docs.map((d) => d.storage_path as string).filter(Boolean);
      step = "documents_storage";
      if (paths.length) {
        const { error: storageError } = await service.storage.from("documents").remove(paths);
        if (storageError) return { ok: false, error: step };
      }
      step = "documents_records";
      const { error: deleteError } = await service.from("documents").delete()
        .eq("user_id", userId).in("id", docs.map((d) => d.id));
      if (deleteError) return { ok: false, error: step };
    }

    step = "profile_anonymize";
    const { error: profileError } = await service.from("profiles").update({
      full_name: "Silinmiş hesap", avatar_url: null, focus_subject: null,
      grade_level: null, school_name: null, phone: null, parent_relation: null,
      school_id: null, invite_code: null, referral_code: null, referred_by: null,
      study_reminder_email: false, onboarding_completed_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", userId);
    if (profileError) return { ok: false, error: step };

    step = "auth_delete";
    const authResult = await deleteAuthUser(service, userId);
    if (!authResult) return { ok: false, error: step };
    return { ok: true };
  } catch {
    return { ok: false, error: step };
  }
}

export async function processPendingDeletionRequests(service: SupabaseClient, limit = 20): Promise<number> {
  const { data: pending, error } = await service.from("data_deletion_requests")
    .select("id, user_id").is("processed_at", null)
    .order("requested_at", { ascending: true }).limit(limit);
  if (error) throw new Error("data_deletion_queue_unavailable");
  let processed = 0;
  for (const row of pending ?? []) {
    const result = await purgeUserData(service, row.user_id as string);
    if (!result.ok) {
      console.error("data_deletion_failed", { requestId: row.id, step: result.error });
      continue;
    }
    const { error: updateError } = await service.from("data_deletion_requests")
      .update({ processed_at: new Date().toISOString(), status: "completed" }).eq("id", row.id);
    if (updateError) throw new Error("data_deletion_receipt_failed");
    processed += 1;
  }
  return processed;
}
