import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isOwnedDocumentPath } from "@/lib/documents/storage-path";

// Financial records retain the anonymised profile key. Hard-deleting auth would
// cascade through that profile and destroy the payment/credit audit trail.
const USER_CONTENT_TABLES = [
  "phone_upload_sessions", "exam_prep_generation_jobs", "exam_preps",
  "practice_exam_attempts", "practice_exams", "quiz_attempts", "quizzes",
  "flashcard_reviews", "flashcard_sets", "messages", "conversations",
  "study_plans", "learning_goals", "mistake_entries", "daily_drills",
  "calendar_events", "notifications", "user_progress", "mastery_scores",
  "weak_topics", "study_session_moods", "user_streaks", "user_activity_days",
  "classroom_posts", "user_apps", "lab_app_plays", "lab_app_ratings", "lab_puzzle_runs",
  "teacher_applications", "teacher_verifications", "teacher_usage",
  "support_requests", "email_events", "ai_usage_events", "ai_validation_events",
  "document_page_grants", "model_upgrade_grants", "abuse_events", "user_roles",
] as const;

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
    const { error: authError } = await service.auth.admin.deleteUser(userId, true);
    if (authError && authError.code !== "user_not_found") return { ok: false, error: step };
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
