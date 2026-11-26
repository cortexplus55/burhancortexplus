import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { auditLog } from "@/lib/audit";
import { findAuthUserByEmail } from "@/lib/auth/find-user";
import { sendAccountDeletionEmail } from "@/lib/email/mailer";
import { purgeUserData } from "@/lib/privacy/account-deletion";
import { DELETION_LINK_TTL_HOURS, PUBLIC_DELETION_PATH } from "@/lib/privacy/account-deletion-copy";
import { createDeletionToken, maskEmail, verifyDeletionToken } from "@/lib/privacy/deletion-link";

/**
 * Giriş yapmadan hesap silme (26 Kasım 2026, Google Play hesap silme politikası; App Store 5.1.1(v)'nin web yolu).
 * İki adım: (1) e-postaya imzalı onay bağlantısı, (2) onay sayfasında "Kalıcı olarak sil". Silme Ayarlar'daki
 * düğmeyle aynı işçiyle yapılır (`purgeUserData`); talep `data_deletion_requests`'e yazılır, yarım kalırsa günlük iş
 * yeniden dener. Yeni tablo ya da sütun yok.
 */

export type DeletionRequestOutcome = "sent" | "no_account" | "already_deleted" | "unconfigured" | "send_failed";

async function profileDeleted(service: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await service.from("profiles").select("deleted_at").eq("id", userId).maybeSingle();
  return Boolean((data as { deleted_at?: string | null } | null)?.deleted_at);
}

export async function requestDeletionByEmail(
  service: SupabaseClient,
  email: string,
  origin: string,
  now: number = Date.now(),
): Promise<DeletionRequestOutcome> {
  const user = await findAuthUserByEmail(service, email);
  if (!user?.email) return "no_account";
  if (await profileDeleted(service, user.id)) return "already_deleted";
  const token = createDeletionToken(user.id, now);
  if (!token) return "unconfigured";
  const url = `${origin.replace(/\/$/, "")}${PUBLIC_DELETION_PATH}/onay?t=${encodeURIComponent(token)}`;
  const sent = await sendAccountDeletionEmail({ to: user.email, url, ttlHours: DELETION_LINK_TTL_HOURS });
  return sent.ok ? "sent" : "send_failed";
}

export type DeletionPreview =
  | { ok: true; maskedEmail: string }
  | { ok: false; reason: "invalid" | "expired" | "unconfigured" | "already_deleted" };

/** Onay sayfası (yalnız okur): bağlantı geçerli mi, hesap hâlâ var mı. */
export async function previewDeletionToken(
  service: SupabaseClient,
  token: string | null | undefined,
  now: number = Date.now(),
): Promise<DeletionPreview> {
  const check = verifyDeletionToken(token, now);
  if (!check.ok) return check;
  const { data, error } = await service.auth.admin.getUserById(check.userId);
  if (error || !data?.user) return { ok: false, reason: "already_deleted" };
  if (await profileDeleted(service, check.userId)) return { ok: false, reason: "already_deleted" };
  return { ok: true, maskedEmail: maskEmail(data.user.email) };
}

export type DeletionConfirmOutcome =
  | { ok: true; status: "completed" | "pending" }
  | { ok: false; reason: "invalid" | "expired" | "unconfigured" | "already_deleted" };

/** "Kalıcı olarak sil": talep kaydı, silme işçisi, makbuz ve denetim kaydı. */
export async function confirmDeletionByToken(
  service: SupabaseClient,
  token: string | null | undefined,
  now: number = Date.now(),
): Promise<DeletionConfirmOutcome> {
  const preview = await previewDeletionToken(service, token, now);
  if (!preview.ok) return preview;
  const check = verifyDeletionToken(token, now);
  if (!check.ok) return check;
  const userId = check.userId;

  const { error: insertError } = await service.from("data_deletion_requests").insert({ user_id: userId });
  if (insertError) console.warn("public_deletion_request_insert_failed", { code: insertError.code ?? null });

  const result = await purgeUserData(service, userId);
  let status: "completed" | "pending" = "pending";
  if (result.ok) {
    const { error: receiptError } = await service
      .from("data_deletion_requests")
      .update({ processed_at: new Date(now).toISOString(), status: "completed" })
      .eq("user_id", userId)
      .is("processed_at", null);
    status = receiptError ? "pending" : "completed";
  } else {
    console.error("public_deletion_failed", { step: result.error });
  }
  await auditLog(service, {
    actorId: null,
    action: "privacy.account_deleted_by_email",
    entityType: "data_deletion_request",
    metadata: { status },
  });
  return { ok: true, status };
}
