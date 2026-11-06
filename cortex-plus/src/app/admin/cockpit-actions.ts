"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { checkFounderActor, requireAdminActor } from "@/lib/auth/admin-actor";
import { createServiceClient } from "@/lib/supabase/server";
import { poolUnit } from "@/lib/content-pool/keys";
import { createReinforceItems } from "@/lib/content-pool/reinforce-new";
import { FX_FLAG, FX_MAX, FX_MIN } from "@/lib/admin/cockpit-math";
import { resetSpendBreakerForTests, SPEND_CAP_FLAG, SPEND_CAP_MAX_USD, SPEND_CAP_MIN_USD } from "@/lib/billing/spend-breaker";

/*
  Kurucu kokpitinin eylemleri (5 Kasım 2026): kur kaydı ve karantina kuyruğu (havuza geri al, reddet,
  yeniden ürettir). Her eylem yönetici kimliği ister ve denetim kaydı yazar. Üretim yalnız "yeniden ürettir"de
  ve mevcut pekiştirme motoruyla (`createReinforceItems`): aynı kazanım, aynı kapı, aynı doğrulayıcı.
*/

export type CockpitActionResult = { ok: true; message: string } | { ok: false; error: string };

const UNAUTHORIZED: CockpitActionResult = { ok: false, error: "Yetkisiz işlem." };
const rateSchema = z.number().finite().min(FX_MIN).max(FX_MAX);
const idSchema = z.string().uuid();

export async function saveUsdTryRate(rate: number): Promise<CockpitActionResult> {
  // Kur ayarı kâr marjını belirler: yalnız kurucu (6 Kasım 2026).
  const founder = await checkFounderActor();
  if (!founder.ok) return { ok: false, error: founder.error };
  const actorId = founder.userId;
  const parsed = rateSchema.safeParse(rate);
  if (!parsed.success) return { ok: false, error: `Kur ${FX_MIN}–${FX_MAX} arasında bir sayı olmalı.` };
  const service = createServiceClient();
  const { error } = await service.from("feature_flags").upsert(
    {
      key: FX_FLAG,
      enabled: true,
      description: "Kokpit: 1 USD kaç TL (kâr marjı için; kurucu elle girer).",
      metadata: { rate: parsed.data, updated_at: new Date().toISOString(), updated_by: actorId },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) return { ok: false, error: "Kur kaydedilemedi." };
  await auditLog(service, { actorId, action: "cockpit.fx_rate.saved", entityType: "feature_flag", entityId: FX_FLAG, metadata: { rate: parsed.data } });
  revalidatePath("/admin");
  revalidatePath("/admin/maliyetler");
  return { ok: true, message: `Kur kaydedildi: 1 USD = ${parsed.data} TL.` };
}

type ItemRow = { id: string; unit_id: string; outcome_id: string; status: string; qa: Record<string, unknown> | null };

async function loadItem(service: ReturnType<typeof createServiceClient>, itemId: string): Promise<ItemRow | null> {
  const { data } = await service.from("item_bank").select("id, unit_id, outcome_id, status, qa").eq("id", itemId).maybeSingle();
  return (data as ItemRow | null) ?? null;
}

async function setItemStatus(
  service: ReturnType<typeof createServiceClient>,
  item: ItemRow,
  status: "verified" | "rejected",
  note: Record<string, unknown>,
): Promise<boolean> {
  const { error } = await service
    .from("item_bank")
    .update({ status, qa: { ...(item.qa ?? {}), admin_review: note } })
    .eq("id", item.id);
  return !error;
}

/** Karantinadaki soruyu havuza geri alır (kurucu soruyu okuyup doğru buldu). */
export async function restoreQuarantinedItem(itemId: string): Promise<CockpitActionResult> {
  const actorId = await requireAdminActor();
  if (!actorId) return UNAUTHORIZED;
  if (!idSchema.safeParse(itemId).success) return { ok: false, error: "Geçersiz soru kimliği." };
  const service = createServiceClient();
  const item = await loadItem(service, itemId);
  if (!item) return { ok: false, error: "Soru bulunamadı." };
  const ok = await setItemStatus(service, item, "verified", { decision: "restored", at: new Date().toISOString(), by: actorId });
  if (!ok) return { ok: false, error: "Soru güncellenemedi." };
  await auditLog(service, { actorId, action: "pool_item.restored", entityType: "item_bank", entityId: itemId, metadata: { from: item.status } });
  revalidatePath("/admin");
  return { ok: true, message: "Soru havuza geri alındı; öğrencilere yeniden sunulur." };
}

/** Karantinadaki soruyu kalıcı olarak reddeder (sunulmaz, silinmez). */
export async function rejectQuarantinedItem(itemId: string): Promise<CockpitActionResult> {
  const actorId = await requireAdminActor();
  if (!actorId) return UNAUTHORIZED;
  if (!idSchema.safeParse(itemId).success) return { ok: false, error: "Geçersiz soru kimliği." };
  const service = createServiceClient();
  const item = await loadItem(service, itemId);
  if (!item) return { ok: false, error: "Soru bulunamadı." };
  const ok = await setItemStatus(service, item, "rejected", { decision: "rejected", at: new Date().toISOString(), by: actorId });
  if (!ok) return { ok: false, error: "Soru güncellenemedi." };
  await auditLog(service, { actorId, action: "pool_item.rejected", entityType: "item_bank", entityId: itemId, metadata: { from: item.status } });
  revalidatePath("/admin");
  return { ok: true, message: "Soru reddedildi; bir daha sunulmaz." };
}

/**
 * Soruyu reddeder ve aynı kazanım için pekiştirme motoruyla yeni sorular yazdırır (kapı + kör çözüm aynen).
 * Model çağrısı yalnız burada; kurucunun açık tıklamasıyla.
 */
export async function regenerateQuarantinedItem(itemId: string): Promise<CockpitActionResult> {
  const actorId = await requireAdminActor();
  if (!actorId) return UNAUTHORIZED;
  if (!idSchema.safeParse(itemId).success) return { ok: false, error: "Geçersiz soru kimliği." };
  const service = createServiceClient();
  const item = await loadItem(service, itemId);
  if (!item) return { ok: false, error: "Soru bulunamadı." };
  const unit = poolUnit(item.unit_id);
  const outcome = unit?.outcomes.find((candidate) => candidate.outcomeId === item.outcome_id);
  const outcomeCode = (typeof item.qa?.outcome_code === "string" ? item.qa.outcome_code : null) ?? outcome?.code ?? null;
  if (!unit || !outcomeCode) return { ok: false, error: "Sorunun ünitesi kayıt defterinde bulunamadı; yalnız reddedebilirsin." };
  const rejected = await setItemStatus(service, item, "rejected", { decision: "regenerate", at: new Date().toISOString(), by: actorId });
  if (!rejected) return { ok: false, error: "Soru güncellenemedi." };
  const { data: siblings } = await service.from("item_bank").select("stem").eq("outcome_id", item.outcome_id).eq("status", "verified").limit(50);
  const existingStems = ((siblings ?? []) as { stem: string }[]).map((row) => row.stem);
  const result = await createReinforceItems(service, { unit, outcomeCode, userId: actorId, existingStems });
  await auditLog(service, {
    actorId,
    action: "pool_item.regenerated",
    entityType: "item_bank",
    entityId: itemId,
    metadata: { outcomeCode, result: result.state, created: result.state === "ok" ? result.ids.length : 0 },
  });
  revalidatePath("/admin");
  if (result.state === "ok") return { ok: true, message: `Soru reddedildi; aynı kazanım için ${result.ids.length} yeni soru doğrulanıp havuza yazıldı.` };
  if (result.state === "none") return { ok: true, message: "Soru reddedildi; üretim kapıdan geçen yeni soru vermedi (bir daha denenebilir)." };
  return { ok: false, error: "Soru reddedildi ama üretim başlatılamadı (model ya da kayıt hatası)." };
}

const idListSchema = z.array(idSchema).min(1).max(500);

type SupersededCandidate = { id: string; qa: Record<string, unknown> | null; content_id: string | null };

/**
 * Eski sürüm sorularını arşivler (5 Kasım 2026): içeriği artık yayında olmayan (`topic_content` `verified` değil)
 * `stale` ve karantinasız sorular `rejected` olur; karar `qa.admin_review`'a yazılır, satır silinmez. Karantinadaki
 * soruya ya da yayındaki içeriğin sorusuna dokunmaz (kuyruk ve anomali ayrı kalır).
 */
export async function archiveSupersededItems(itemIds: string[]): Promise<CockpitActionResult> {
  const actorId = await requireAdminActor();
  if (!actorId) return UNAUTHORIZED;
  const parsed = idListSchema.safeParse(itemIds);
  if (!parsed.success) return { ok: false, error: "Geçersiz soru listesi." };
  const service = createServiceClient();
  const { data: rows, error } = await service.from("item_bank").select("id, qa, content_id").in("id", parsed.data).eq("status", "stale");
  if (error) return { ok: false, error: "Sorular okunamadı." };
  const candidates = ((rows ?? []) as SupersededCandidate[]).filter((row) => row.qa?.quarantine == null);
  const contentIds = [...new Set(candidates.map((row) => row.content_id).filter((value): value is string => typeof value === "string"))];
  const live = new Set<string>();
  if (contentIds.length) {
    const { data: contents, error: contentError } = await service.from("topic_content").select("id, status").in("id", contentIds);
    if (contentError) return { ok: false, error: "Soruların içerik durumu okunamadı." };
    for (const row of (contents ?? []) as { id: string; status: string }[]) if (row.status === "verified") live.add(row.id);
  }
  const archivable = candidates.filter((row) => !(row.content_id && live.has(row.content_id)));
  const at = new Date().toISOString();
  let archived = 0;
  for (const row of archivable) {
    const { error: updateError } = await service
      .from("item_bank")
      .update({ status: "rejected", qa: { ...(row.qa ?? {}), admin_review: { decision: "superseded", reason: "content_retired", at, by: actorId } } })
      .eq("id", row.id)
      .eq("status", "stale");
    if (!updateError) archived += 1;
  }
  await auditLog(service, {
    actorId,
    action: "pool_item.superseded_archived",
    entityType: "item_bank",
    entityId: archivable[0]?.id ?? "bulk",
    metadata: { requested: parsed.data.length, archivable: archivable.length, archived },
  });
  revalidatePath("/admin");
  if (!archived) return { ok: false, error: "Arşivlenecek eski sürüm sorusu bulunamadı (karantinada ya da içeriği hâlâ yayında)." };
  return { ok: true, message: `${archived} eski sürüm sorusu arşivlendi (rejected · superseded).` };
}

const capSchema = z.number().finite().min(SPEND_CAP_MIN_USD).max(SPEND_CAP_MAX_USD);

/**
 * Günlük harcama sigortasının tavanı (5 Kasım 2026, lansman zırhı): kurucu dolar cinsinden yazar; bayrak
 * `admin_ai_daily_cap` metadata.cap_usd. Ortam değişkeni ve 25 $ varsayılanı bunun yedeğidir (spend-breaker.ts).
 */
export async function saveDailySpendCap(capUsd: number): Promise<CockpitActionResult> {
  // Küresel harcama tavanı: yalnız kurucu (6 Kasım 2026).
  const founder = await checkFounderActor();
  if (!founder.ok) return { ok: false, error: founder.error };
  const actorId = founder.userId;
  const parsed = capSchema.safeParse(capUsd);
  if (!parsed.success) return { ok: false, error: `Tavan ${SPEND_CAP_MIN_USD}–${SPEND_CAP_MAX_USD} $ arasında bir sayı olmalı.` };
  const service = createServiceClient();
  const { error } = await service.from("feature_flags").upsert(
    {
      key: SPEND_CAP_FLAG,
      enabled: true,
      description: "Küresel günlük OpenAI harcama sigortası: metadata.cap_usd (kurucu kokpitten yazar).",
      metadata: { cap_usd: parsed.data, updated_at: new Date().toISOString(), updated_by: actorId },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) return { ok: false, error: "Tavan kaydedilemedi." };
  await auditLog(service, { actorId, action: "cockpit.spend_cap.saved", entityType: "feature_flag", entityId: SPEND_CAP_FLAG, metadata: { capUsd: parsed.data } });
  resetSpendBreakerForTests();
  revalidatePath("/admin");
  revalidatePath("/admin/maliyetler");
  return { ok: true, message: `Günlük tavan kaydedildi: ${parsed.data} $. Bir dakika içinde bütün sunucularda geçerli olur.` };
}
