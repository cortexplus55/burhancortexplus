import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingFunctionError } from "@/lib/auth/admin-role";
import { UNVERIFIED_FLAG } from "@/lib/auth/email-verification";
import { purgeDeletedDocument } from "@/lib/privacy/document-deletion";
import {
  grantPeriodEnd,
  grantPlanLabel,
  isGrantablePlan,
  planGrantWallet,
  type GrantablePlanRow,
} from "@/lib/admin/user-manage-copy";

/*
  Yönetim panelinden kullanıcı hesabına yazımlar (6 Kasım 2026). Yetki ve denetim kaydı çağıranda
  (`src/app/admin/kullanicilar/actions.ts`); burası yalnız veriyi yazar ve ne olduğunu söyler.

  Var olan kalıplar kullanılır, yeni şema uydurulmaz:
  - Paket: PayTR geri çağrısının (`finalize_paytr_payment`) ve beta kodunun (`redeem_promo_code`) abonelik +
    cüzdan yazımı; tek fark ücret ve ödeme kaydı yok. Kullanıcı başına tek etkin abonelik: önce süren satır,
    yoksa en son satır güncellenir, hiç yoksa eklenir.
  - İptal: iadenin (`refund.ts`) kalıbı — abonelik `cancelled`, cüzdanın dönem hakkı sıfır ve dönem bitmiş.
  - Hazırlık silme: öğrencinin "Hazırlığı sil"i ile aynı `delete_exam_prep`.
  - Belge silme: öğrencinin belge silmesiyle aynı `soft_delete_document` + `purgeDeletedDocument`.
  - E-posta: `markEmailVerified` ile aynı bayrak (`app_metadata.email_unverified`) + Supabase onayı.
  - Cihazlar: `touch_device_session` kalıbı (`admin_reset_device_sessions`; göç yoksa yalnız bizim satırlar).
*/

export type ManageResult<T = Record<string, unknown>> = ({ ok: true } & T) | { ok: false; error: string };

const PLAN_COLUMNS = "id, slug, name, tier, is_premium, active, billing_period, monthly_allowance";

async function ensureWallet(service: SupabaseClient, userId: string): Promise<boolean> {
  const { error } = await service
    .from("credit_wallets")
    .upsert({ user_id: userId, balance: 0, reserved: 0 }, { onConflict: "user_id", ignoreDuplicates: true });
  return !error;
}

async function applyGrantWallet(
  service: SupabaseClient,
  userId: string,
  wallet: ReturnType<typeof planGrantWallet>,
): Promise<boolean> {
  if (!(await ensureWallet(service, userId))) return false;
  const { data: current, error: readError } = await service
    .from("credit_wallets")
    .select("free_allowance_remaining")
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) return false;
  const remaining = Number((current as { free_allowance_remaining?: number } | null)?.free_allowance_remaining ?? 0);
  const { error } = await service
    .from("credit_wallets")
    .update({
      free_allowance_remaining: Math.max(remaining, wallet.allowance),
      period_allowance: wallet.allowance,
      period_kind: wallet.periodKind,
      period_ends_at: wallet.periodEndsAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  return !error;
}

/** Planı N gün için tanımlar. Süren dönem varsa sonuna eklenir (plan değişebilir). */
export async function grantPlanPeriod(
  service: SupabaseClient,
  input: { userId: string; planId: string; days: number; now?: Date },
): Promise<
  ManageResult<{ planLabel: string; before: string | null; after: string; extended: boolean; planChanged: boolean }>
> {
  const now = input.now ?? new Date();
  const { data: planRow } = await service.from("plans").select(PLAN_COLUMNS).eq("id", input.planId).maybeSingle();
  const plan = planRow as GrantablePlanRow | null;
  if (!isGrantablePlan(plan)) return { ok: false, error: "Bu plan tanımlanamaz (satışta olan Plus ya da Sigma seçin)." };

  const { data: activeRow, error: activeError } = await service
    .from("subscriptions")
    .select("id, plan_id, current_period_end, trial_until")
    .eq("user_id", input.userId)
    .eq("status", "active")
    .order("current_period_end", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (activeError) return { ok: false, error: "Abonelik okunamadı." };
  const active = activeRow as
    | { id: string; plan_id: string; current_period_end: string | null; trial_until: string | null }
    | null;
  const running = Boolean(
    active && (!active.current_period_end || new Date(active.current_period_end).getTime() > now.getTime()),
  );

  const stamp = now.toISOString();
  const common = {
    plan_id: plan.id,
    billing_period: plan.billing_period ?? "monthly",
    cancel_at_period_end: false,
    auto_renew: false,
    renewal_reminder_sent_at: null,
    expired_notified_at: null,
    updated_at: stamp,
  };

  if (running && active) {
    const end = grantPeriodEnd(active.current_period_end, input.days, now);
    const wasTrial = Boolean(active.trial_until && active.trial_until === active.current_period_end);
    const { error } = await service
      .from("subscriptions")
      .update({ ...common, current_period_end: end.toISOString(), ...(wasTrial ? { trial_until: end.toISOString() } : {}) })
      .eq("id", active.id);
    if (error) return { ok: false, error: "Abonelik güncellenemedi." };
    const planChanged = active.plan_id !== plan.id;
    if (planChanged) {
      const ok = await applyGrantWallet(
        service,
        input.userId,
        planGrantWallet({
          billingPeriod: plan.billing_period,
          monthlyAllowance: plan.monthly_allowance,
          days: input.days,
          subscriptionEnd: end,
          now,
        }),
      );
      if (!ok) return { ok: false, error: "Abonelik uzadı ama kullanım hakkı yazılamadı; tekrar deneyin." };
    }
    return {
      ok: true,
      planLabel: grantPlanLabel(plan),
      before: active.current_period_end,
      after: end.toISOString(),
      extended: true,
      planChanged,
    };
  }

  const end = grantPeriodEnd(null, input.days, now);
  // Hediye dönemi ödeme değildir: beta kodu gibi `trial_until = bitiş` (hatırlatma "ücretsize dönersin" der).
  const fresh = {
    ...common,
    status: "active",
    current_period_start: stamp,
    current_period_end: end.toISOString(),
    trial_until: end.toISOString(),
  };
  // Süresi geçmiş ama kapanmamış satır önce (kullanıcı başına tek etkin abonelik dizini), yoksa en son satır.
  let previous: { id: string; current_period_end: string | null } | null = active
    ? { id: active.id, current_period_end: active.current_period_end }
    : null;
  if (!previous) {
    const { data: latest, error: latestError } = await service
      .from("subscriptions")
      .select("id, current_period_end")
      .eq("user_id", input.userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) return { ok: false, error: "Abonelik okunamadı." };
    previous = latest as { id: string; current_period_end: string | null } | null;
  }
  const { error } = previous
    ? await service.from("subscriptions").update(fresh).eq("id", previous.id)
    : await service.from("subscriptions").insert({ user_id: input.userId, ...fresh });
  if (error) return { ok: false, error: "Abonelik yazılamadı." };

  const ok = await applyGrantWallet(
    service,
    input.userId,
    planGrantWallet({
      billingPeriod: plan.billing_period,
      monthlyAllowance: plan.monthly_allowance,
      days: input.days,
      subscriptionEnd: end,
      now,
    }),
  );
  if (!ok) return { ok: false, error: "Abonelik açıldı ama kullanım hakkı yazılamadı; tekrar deneyin." };
  return {
    ok: true,
    planLabel: grantPlanLabel(plan),
    before: previous?.current_period_end ?? null,
    after: end.toISOString(),
    extended: false,
    planChanged: true,
  };
}

/** Süren aboneliği hemen bitirir (iade kalıbı; para hareketi yok). */
export async function cancelActiveSubscription(
  service: SupabaseClient,
  input: { userId: string; now?: Date },
): Promise<ManageResult<{ subscriptionId: string; before: string | null }>> {
  const now = input.now ?? new Date();
  const { data: active, error } = await service
    .from("subscriptions")
    .select("id, current_period_end")
    .eq("user_id", input.userId)
    .eq("status", "active")
    .order("current_period_end", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: "Abonelik okunamadı." };
  const row = active as { id: string; current_period_end: string | null } | null;
  if (!row) return { ok: false, error: "Etkin abonelik yok; iptal edilecek bir şey yok." };

  const { error: cancelError } = await service
    .from("subscriptions")
    .update({ status: "cancelled", cancel_at_period_end: false, updated_at: now.toISOString() })
    .eq("id", row.id)
    .eq("status", "active");
  if (cancelError) return { ok: false, error: "Abonelik iptal edilemedi." };

  const { error: walletError } = await service
    .from("credit_wallets")
    .update({
      free_allowance_remaining: 0,
      period_ends_at: new Date(now.getTime() - 1000).toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("user_id", input.userId);
  if (walletError) return { ok: false, error: "Abonelik iptal edildi ama dönem hakkı sıfırlanamadı; tekrar deneyin." };
  return { ok: true, subscriptionId: row.id, before: row.current_period_end };
}

export const STARS_MIGRATION_MISSING =
  "Yıldız düzeltmesi için veritabanı güncellemesi bekleniyor (göç 20261106163000).";

/** Yıldız ekler ya da düşer; toplam sıfırın altına inmez. */
export async function adjustStars(
  service: SupabaseClient,
  input: { userId: string; delta: number; ref: string },
): Promise<ManageResult<{ total: number }>> {
  const { data, error } = await service.rpc("admin_adjust_stars", {
    p_user: input.userId,
    p_delta: input.delta,
    p_ref: input.ref,
  });
  if (error) {
    if (isMissingFunctionError(error)) return { ok: false, error: STARS_MIGRATION_MISSING };
    return { ok: false, error: "Yıldız güncellenemedi." };
  }
  const result = (data ?? {}) as { ok?: boolean; reason?: string; total?: number };
  if (result.ok) return { ok: true, total: Number(result.total ?? 0) };
  if (result.reason === "insufficient_stars") {
    return { ok: false, error: `Yıldız sıfırın altına inemez (şu an ${Number(result.total ?? 0)}).` };
  }
  if (result.reason === "user_missing") return { ok: false, error: "Hesap bulunamadı." };
  return { ok: false, error: "Yıldız güncellenemedi." };
}

/** E-postayı onaylı işaretler: bayrak kalkar, Supabase onay tarihi yoksa yazılır. */
export async function confirmEmailByAdmin(
  service: SupabaseClient,
  userId: string,
): Promise<ManageResult<{ changed: boolean }>> {
  const { data, error } = await service.auth.admin.getUserById(userId);
  if (error || !data?.user) return { ok: false, error: "Hesap bulunamadı." };
  const user = data.user;
  const metadata = (user.app_metadata ?? {}) as Record<string, unknown>;
  const flagged = metadata[UNVERIFIED_FLAG] === true;
  const confirmed = Boolean(user.email_confirmed_at);
  if (!flagged && confirmed) return { ok: true, changed: false };
  const { error: updateError } = await service.auth.admin.updateUserById(userId, {
    ...(confirmed ? {} : { email_confirm: true }),
    ...(flagged ? { app_metadata: { ...metadata, [UNVERIFIED_FLAG]: false } } : {}),
  });
  if (updateError) return { ok: false, error: "E-posta onayı yazılamadı." };
  return { ok: true, changed: true };
}

/** Bütün cihazlardan çıkış: cihaz kayıtları düşer; göç varsa Supabase oturumları da silinir. */
export async function resetDeviceSessions(
  service: SupabaseClient,
  userId: string,
): Promise<ManageResult<{ revoked: number; authSessions: number; viaFunction: boolean }>> {
  const { data, error } = await service.rpc("admin_reset_device_sessions", { p_user: userId });
  if (!error) {
    const result = (data ?? {}) as { revoked?: number; authSessions?: number };
    return { ok: true, revoked: Number(result.revoked ?? 0), authSessions: Number(result.authSessions ?? 0), viaFunction: true };
  }
  if (!isMissingFunctionError(error)) return { ok: false, error: "Cihaz oturumları sıfırlanamadı." };
  const { data: rows, error: updateError } = await service
    .from("user_device_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("session_id");
  if (updateError) return { ok: false, error: "Cihaz oturumları sıfırlanamadı." };
  return { ok: true, revoked: (rows ?? []).length, authSessions: 0, viaFunction: false };
}

type DeletionReport = { deleted: string[]; failed: string[] };

/**
 * Seçilen hazırlıkları kalıcı siler. Önce hepsinin bu hesaba ait olduğu yeniden okunur; biri bile değilse hiçbir
 * şey silinmez. Silme öğrencinin akışıyla aynı fonksiyon (kopyalar ve kart tekrarları kalır, denemeler gider).
 */
export async function deletePrepsForUser(
  service: SupabaseClient,
  input: { userId: string; prepIds: string[] },
): Promise<ManageResult<DeletionReport>> {
  const ids = [...new Set(input.prepIds)];
  if (!ids.length) return { ok: false, error: "Silinecek hazırlık seçilmedi." };
  const { data, error } = await service
    .from("exam_preps")
    .select("id, title")
    .eq("user_id", input.userId)
    .in("id", ids);
  if (error) return { ok: false, error: "Hazırlıklar okunamadı." };
  const owned = (data ?? []) as { id: string; title: string | null }[];
  if (owned.length !== ids.length) {
    return { ok: false, error: "Seçilenlerden biri bu hesaba ait değil ya da zaten silinmiş; hiçbir şey silinmedi." };
  }
  const report: DeletionReport = { deleted: [], failed: [] };
  for (const prep of owned) {
    const title = prep.title || "Adsız hazırlık";
    const { data: done, error: deleteError } = await service.rpc("delete_exam_prep", {
      p_prep_id: prep.id,
      p_user_id: input.userId,
    });
    if (deleteError || done !== true) report.failed.push(title);
    else report.deleted.push(title);
  }
  return { ok: true, ...report };
}

/**
 * Seçilen belgeleri kalıcı siler: kuyruğa yazılır, belge mantıksal silinir (bağlı hazırlık da gider), sonra dosya,
 * parça kopyaları (ana belgeyle CASCADE) ve gömmeler temizlenir. Parça kopyası tek başına seçilemez. Temizlik bir
 * adımda düşerse kuyruk sonra tamamlar ("beklemede").
 */
export async function deleteDocumentsForUser(
  service: SupabaseClient,
  input: { userId: string; documentIds: string[] },
): Promise<ManageResult<DeletionReport & { pending: string[] }>> {
  const ids = [...new Set(input.documentIds)];
  if (!ids.length) return { ok: false, error: "Silinecek belge seçilmedi." };
  const { data, error } = await service
    .from("documents")
    .select("id, file_name, part_of")
    .eq("user_id", input.userId)
    .is("deleted_at", null)
    .in("id", ids);
  if (error) return { ok: false, error: "Belgeler okunamadı." };
  const owned = (data ?? []) as { id: string; file_name: string | null; part_of: string | null }[];
  if (owned.length !== ids.length || owned.some((doc) => doc.part_of)) {
    return { ok: false, error: "Seçilenlerden biri bu hesaba ait değil ya da zaten silinmiş; hiçbir şey silinmedi." };
  }
  const report = { deleted: [] as string[], failed: [] as string[], pending: [] as string[] };
  for (const doc of owned) {
    const name = doc.file_name || "Adsız belge";
    const { data: marked, error: markError } = await service.rpc("soft_delete_document", {
      p_user_id: input.userId,
      p_document_id: doc.id,
    });
    if (markError || !marked) {
      report.failed.push(name);
      continue;
    }
    report.deleted.push(name);
    if (!(await purgeDeletedDocument(service, input.userId, doc.id))) report.pending.push(name);
  }
  return { ok: true, ...report };
}
