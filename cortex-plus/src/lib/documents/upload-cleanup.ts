import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logOpsEvent } from "@/lib/observability/ops-log";

/** Signed upload tokens expire after two hours. A closed tab must not hold quota forever. */
export async function cleanupExpiredUploads(
  service: SupabaseClient,
  options: { userId?: string; limit?: number } = {},
): Promise<number> {
  const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 100);
  let pendingQuery = service.from("documents")
    .select("id,storage_path,status")
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .limit(limit);
  let failedQuery = service.from("documents")
    .select("id,storage_path,status")
    .eq("status", "failed")
    .eq("error_message", "upload_expired")
    .limit(limit);
  if (options.userId) {
    pendingQuery = pendingQuery.eq("user_id", options.userId);
    failedQuery = failedQuery.eq("user_id", options.userId);
  }
  const [pending, failed] = await Promise.all([pendingQuery, failedQuery]);
  if (pending.error || failed.error) throw new Error("upload_cleanup_query_failed");
  const rows = [...(pending.data ?? []), ...(failed.data ?? [])].slice(0, limit);
  let removed = 0;
  for (const row of rows) {
    let claim = service.from("documents")
      .update({ status: "failed", error_message: "upload_expired" })
      .eq("id", row.id).eq("status", row.status);
    claim = row.status === "pending"
      ? claim.lt("created_at", cutoff)
      : claim.eq("error_message", "upload_expired");
    const { data: claimed, error: claimError } = await claim
      .select("id,storage_path,error_message").maybeSingle();
    if (claimError || !claimed || claimed.error_message !== "upload_expired") continue;
    const { error: storageError } = await service.storage.from("documents").remove([claimed.storage_path]);
    if (storageError) {
      logOpsEvent("document_upload_failed", { stage: "expired_cleanup", documentId: row.id });
      continue;
    }
    const { error: deleteError } = await service.from("documents").delete()
      .eq("id", row.id).eq("status", "failed").eq("error_message", "upload_expired");
    if (!deleteError) removed += 1;
  }
  return removed;
}
