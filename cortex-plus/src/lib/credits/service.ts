import "server-only";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionCode } from "@/lib/env";
import { defaultFreeMeter, type FreeMeter } from "@/lib/billing/free-meters";
import { CREDIT_PRICE_TABLE, creditRuleSeed } from "@/lib/credits/price-table";
import { parseDocumentReservationKey } from "@/lib/documents/document-reservation-key";

/**
 * Ücretsiz hesabın reddi (24 Ekim 2026): sayaç doldu ya da iş Plus'ta. Sebep yine
 * `insufficient_credits` (istemciler 402'yi ve bu kodu okuyor); ayrıntı `refusal`'da.
 */
export type FreeRefusal = { kind: "free_limit"; meter: FreeMeter } | { kind: "plus_required" };

export type ReservationResult =
  | { ok: true; reservationId: string; cost: number }
  | {
      ok: false;
      reason: "insufficient_credits" | "invalid_action" | "operation_in_progress" | "operation_completed" | "error";
      refusal?: FreeRefusal;
    };

const METERS: readonly FreeMeter[] = ["lesson", "chat", "photo", "included"];

/** SQL hata metninden ücretsiz reddi okur. */
export function parseFreeRefusal(message: string): FreeRefusal | null {
  if (message.includes("plus_required")) return { kind: "plus_required" };
  const match = message.match(/free_limit:([a-z]+)/);
  const meter = match?.[1] as FreeMeter | undefined;
  return meter && METERS.includes(meter) ? { kind: "free_limit", meter } : null;
}

/** Reddin HTTP karşılığı: hep 402; kod ekranın doğru kapıyı açması için. */
export function refusalCode(result: { reason: string; refusal?: FreeRefusal }): string {
  if (result.refusal?.kind === "plus_required") return "premium_required";
  if (result.refusal?.kind === "free_limit") return `free_${result.refusal.meter}_limit`;
  return result.reason;
}

export function newIdempotencyKey(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

/**
 * Kredi kuralı yedeği (29 Ekim 2026). Fiyatın iki kopyası var: kodda `CREDIT_PRICE_TABLE`, canlıda
 * `credit_rules`; ikisini bağlayan tek şey elle uygulanan göç. Yeni bir eylem kodunun göçü atlanınca SQL
 * `invalid_action` fırlatıyor ve iş 409 ile düşüyordu — oysa hata hiçbir yazımdan önce atılır, eksik satırı
 * koddaki bedelle ekleyip bir kez yeniden denemek güvenli.
 *
 * Kural: göç DEĞİŞİKLİĞİN kaynağı kalır. Kod yalnız EKSİK satırı ekler (`ignoreDuplicates` = INSERT … ON
 * CONFLICT DO NOTHING); var olan satır — yöneticinin /admin/kredi-kurallari'nda değiştirdiği bedel ya da
 * bilerek kapatılmış kural — asla güncellenmez. Eklenen satır `CODE_SEEDED_RULE_NOTE` ile işaretli;
 * `/admin/sistem` onu "göç yazılmalı" uyarısıyla gösterir. Örnek başına kod başına bir kez uyarı yazılır.
 */
const seededRuleCodes = new Set<string>();

/** Test: "kod başına bir kez uyarı" sayacını sıfırlar. */
export function resetCreditRuleSeedForTests() {
  seededRuleCodes.clear();
}

/** Eksik kuralı fiyat tablosundan ekler. `true` = yeniden denemeye değer (ekleme hatasız bitti). */
async function seedMissingCreditRule(service: SupabaseClient, actionCode: ActionCode): Promise<boolean> {
  if (!(actionCode in CREDIT_PRICE_TABLE)) return false;
  const seed = creditRuleSeed(actionCode);
  const { error } = await service
    .from("credit_rules")
    .upsert(seed, { onConflict: "action_code", ignoreDuplicates: true });
  if (error) {
    console.warn("credit_rule_seed_failed", { actionCode, code: error.code, message: error.message });
    return false;
  }
  if (!seededRuleCodes.has(actionCode)) {
    seededRuleCodes.add(actionCode);
    console.warn("credit_rule_seeded_from_code", { actionCode, credits: seed.credit_cost });
  }
  return true;
}

async function readActionCost(service: SupabaseClient, actionCode: ActionCode) {
  return service
    .from("credit_rules")
    .select("credit_cost")
    .eq("action_code", actionCode)
    .eq("active", true)
    .maybeSingle();
}

export async function getActionCost(
  service: SupabaseClient,
  actionCode: ActionCode,
): Promise<number | null> {
  const first = await readActionCost(service, actionCode);
  if (first.data?.credit_cost != null) return first.data.credit_cost;
  // Okuma düştüyse yazmayız: satır yok mu, bağlantı mı yok bilinmiyor.
  if (first.error) return null;
  // Satır yok: aynı yedek — eksikse fiyat tablosundan ekle, bir kez daha oku. Kapalı satır eklenmez,
  // okuma yine boş döner (çağıranlar kendi varsayılanına düşer).
  if (!(await seedMissingCreditRule(service, actionCode))) return null;
  const second = await readActionCost(service, actionCode);
  return second.data?.credit_cost ?? null;
}

export async function reserveCredits(
  service: SupabaseClient,
  userId: string,
  actionCode: ActionCode,
  idempotencyKey: string,
  /**
   * Kaç birim iş yapılacağı. Varsayılan 1 — on bir eylemin onu sabit fiyatlı
   * ve parametreyi hiç göndermiyor.
   *
   * Seslendirme için var: önbellek paylaşımlı olduğu için aynı istekte kimi
   * cümle bedava gelir, kimi yeniden üretilir. Düz ücret ikisini de yanlış
   * fiyatlar — bedava geleni faturalandırır, uzun üretimi zarara yazar.
   */
  quantity = 1,
  /**
   * Ücretsiz hesabın sayacı (24 Ekim 2026). Verilmezse işin varsayılanı (`defaultFreeMeter`):
   * ders/test/kart → ders, sohbet → mesaj, fotoğraf → fotoğraf. Yolda derse dahil işler "included",
   * sayaçsız iş (belge) `null`. Abone ve yönetici için yok sayılır.
   */
  options: { freeMeter?: FreeMeter | null } = {},
): Promise<ReservationResult> {
  // Miktar burada bir kez normalleşiyor ve RPC'ye de bu hâli gidiyor.
  // Ham değeri göndermek, sunucunun kırptığı bir sayıyla burada hesaplanan
  // tutarın ayrışması demekti: kullanıcıya bir rakam gösterip cüzdanından
  // başka bir rakam düşerdi. Sunucu tarafındaki kırpma yine duruyor —
  // `credit_reserve` tek başına da doğru davranmalı.
  const units = Math.min(Math.max(Math.trunc(quantity) || 1, 1), 1000);

  const meter = options.freeMeter === undefined ? defaultFreeMeter(actionCode) : options.freeMeter;
  // Sıra her çağrıda aynı: sayaçlı ayırma → (fonksiyon yoksa) eski `credit_reserve`.
  const callReserve = async () => {
    let { data, error } = await service.rpc("credit_reserve_metered", {
      p_user_id: userId,
      p_action_code: actionCode,
      p_idempotency_key: idempotencyKey,
      p_quantity: units,
      p_meter: meter,
    });
    // Yayın sırası: kod göçten önce çıkarsa (fonksiyon yok) eski yola düşer. Sessiz kalmasın: ücretsiz hesabın
    // sayacı bu yolda çalışmıyor, düşen ayırma düz `insufficient_credits` döner (inceleme, 24 Ekim 2026).
    if (error && (error.code === "PGRST202" || /Could not find the function public.credit_reserve_metered/.test(error.message ?? ""))) {
      console.warn("credit_reserve_metered_missing", { actionCode, meter });
      ({ data, error } = await service.rpc("credit_reserve", {
        p_user_id: userId,
        p_action_code: actionCode,
        p_idempotency_key: idempotencyKey,
        p_quantity: units,
      }));
    }
    return { data, error };
  };

  let { data, error } = await callReserve();
  // Kredi kuralı yedeği: satır yoksa fiyat tablosundan ekle ve TAM BİR KEZ yeniden dene. `invalid_action`
  // hiçbir yazımdan önce atılır (kilit yok, cüzdana dokunulmamış); ikinci cevap da hataysa bugünkü eşleme.
  if (error && (error.message ?? "").includes("invalid_action") && (await seedMissingCreditRule(service, actionCode))) {
    ({ data, error } = await callReserve());
  }

  if (error) {
    const refusal = parseFreeRefusal(error.message ?? "");
    if (refusal) return { ok: false, reason: "insufficient_credits", refusal };
    if (error.message.includes("insufficient")) {
      return { ok: false, reason: "insufficient_credits" };
    }
    if (error.message.includes("invalid_action")) {
      return { ok: false, reason: "invalid_action" };
    }
    return { ok: false, reason: "error" };
  }

  if (typeof data !== "string" || !data) return { ok: false, reason: "error" };
  const { data: claim, error: claimError } = await service.rpc("credit_claim_operation", {
    p_reservation_id: data,
    p_token: randomUUID(),
  });
  if (claimError) return { ok: false, reason: "error" };
  if (claim?.state !== "claimed") return {
    ok: false,
    reason: claim?.state === "busy" ? "operation_in_progress" : claim?.state === "committed" ? "operation_completed" : "error",
  };
  return { ok: true, reservationId: data, cost: claim.amount as number };
}

export async function commitCredits(
  service: SupabaseClient,
  reservationId: string,
) {
  const { error } = await service.rpc("credit_commit", { p_reservation_id: reservationId });
  if (error) {
    console.error("credit_transaction_failed", { operation: "commit", reservationId, code: error.code });
    throw new Error("credit_commit_failed");
  }
}

export async function refundCredits(
  service: SupabaseClient,
  reservationId: string,
) {
  const { error } = await service.rpc("credit_refund", { p_reservation_id: reservationId });
  if (error) {
    console.error("credit_transaction_failed", { operation: "refund", reservationId, code: error.code });
    throw new Error("credit_refund_failed");
  }
}

/**
 * Tek istekte (≤300 sn) biten eylemler. Bunların pending kalması Vercel
 * hard-kill'inden gelir — iade güvenli.
 *
 * `DOCUMENT_PAGE_PROCESS` YOK: PDF işleme tek rezervasyonu birçok chunk
 * isteğine yayar; 10 dk'dan uzun sürebilir. Ortada iade etmek son commit'i
 * sessiz no-op yapar (belge bedava işlenmiş olur).
 */
export const STALE_REFUND_ACTION_CODES: readonly ActionCode[] = [
  "AI_CHAT_STANDARD",
  "AI_CHAT_ADVANCED",
  "AI_CHAT_PARENT",
  "IMAGE_SOLUTION",
  "QUIZ_GENERATE",
  "FLASHCARD_GENERATE",
  "PRACTICE_EXAM_GENERATE",
  "PRACTICE_EXAM_GRADE",
  "STUDY_PLAN_GENERATE",
  "EXPORT_PDF",
  "AUDIO_SYNTHESIZE",
] as const;

/** Kullanıcı başına ders öncesi temizliği ucuz tut — birkaç dakikada bir. */
const STALE_CLEANUP_COOLDOWN_MS = 3 * 60_000;
const lastStaleCleanupByUser = new Map<string, number>();

/**
 * Vercel hard-kill (300 sn) sonrası pending kalan rezervasyonları iade et.
 * Yalnızca allowlist'teki tek-istek eylemleri; DOCUMENT_PAGE_PROCESS dokunulmaz.
 * Yeni migration yok. Best-effort.
 */
export async function refundStalePendingReservations(
  service: SupabaseClient,
  options: {
    userId?: string;
    /** Varsayılan 10 dakika. */
    olderThanMs?: number;
    limit?: number;
    /** true ise kullanıcı cooldown'ı yok sayılır (cron). */
    force?: boolean;
  } = {},
): Promise<number> {
  const olderThanMs = options.olderThanMs ?? 10 * 60_000;
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  if (options.userId && !options.force) {
    const last = lastStaleCleanupByUser.get(options.userId) ?? 0;
    if (Date.now() - last < STALE_CLEANUP_COOLDOWN_MS) return 0;
    lastStaleCleanupByUser.set(options.userId, Date.now());
  }
  try {
    let query = service
      .from("credit_reservations")
      .select("id, action_code, status")
      .eq("status", "pending")
      .in("action_code", [...STALE_REFUND_ACTION_CODES])
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(options.limit ?? 40);
    if (options.userId) query = query.eq("user_id", options.userId);
    const { data, error } = await query;
    if (error || !data?.length) return 0;
    let refunded = 0;
    for (const row of data) {
      const code = String(row.action_code ?? "");
      if (!(STALE_REFUND_ACTION_CODES as readonly string[]).includes(code)) continue;
      if (code === "DOCUMENT_PAGE_PROCESS") continue;
      try {
        await refundCredits(service, row.id as string);
        refunded += 1;
      } catch {
        // tek satır düşmesin diye devam
      }
    }
    if (refunded) {
      console.error("stale_credit_reservations_refunded", {
        count: refunded,
        userId: options.userId ?? null,
      });
    }
    return refunded;
  } catch {
    return 0;
  }
}

/** Test / cooldown sıfırlama. */
export function resetStaleCleanupCooldownForTests() {
  lastStaleCleanupByUser.clear();
}

/**
 * Abandoned DOCUMENT_PAGE_PROCESS reservations: document failed or stuck
 * with no progress for >24h → refund. Completed documents with a leftover
 * pending reservation → commit (charge was earned).
 */
export async function refundAbandonedDocumentReservations(
  service: SupabaseClient,
  options: { olderThanMs?: number; limit?: number } = {},
): Promise<number> {
  const olderThanMs = options.olderThanMs ?? 24 * 60 * 60_000;
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  try {
    const { data, error } = await service
      .from("credit_reservations")
      .select("id, user_id, idempotency_key, created_at")
      .eq("status", "pending")
      .eq("action_code", "DOCUMENT_PAGE_PROCESS")
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(options.limit ?? 40);
    if (error || !data?.length) return 0;

    let settled = 0;
    for (const row of data) {
      // Kaldığı yerden süren okumanın anahtarı `_p<sayfa>` ekiyle biter (31 Ekim 2026, pencereli işleme).
      const documentId = parseDocumentReservationKey(String(row.idempotency_key ?? ""))?.documentId ?? null;
      if (!documentId) continue;

      const { data: doc } = await service
        .from("documents")
        .select("id, status, updated_at")
        .eq("id", documentId)
        .maybeSingle();

      const status = (doc as { status?: string } | null)?.status;
      const updatedAt = (doc as { updated_at?: string } | null)?.updated_at;

      try {
        if (status === "completed") {
          await commitCredits(service, row.id as string);
          settled += 1;
          continue;
        }
        const staleProgress =
          !doc ||
          status === "failed" ||
          (updatedAt != null && updatedAt < cutoff);
        if (!staleProgress) continue;
        await refundCredits(service, row.id as string);
        settled += 1;
      } catch {
        // continue
      }
    }
    if (settled) {
      console.error("abandoned_document_reservations_settled", { count: settled });
    }
    return settled;
  } catch {
    return 0;
  }
}

/**
 * Sesin kendi eylem kodlari.
 *
 * Seslendirme ve cozumleme krediden dusmuyor (bedeli dugume dahil), bu yuzden
 * `ActionCode` birligine girmiyorlar — ama maliyeti olan tek kalem olmalari
 * onlari olculmesi en gerekli yer yapiyor. `ai_usage_events.action_code`
 * serbest metin oldugu icin sema degisikligi gerekmiyor.
 */
export type UsageCode =
  | ActionCode
  | "TTS_SYNTHESIZE"
  | "STT_TRANSCRIBE"
  /** Adaptive Learning Engine — orchestration (0 student credits). */
  | "ADAPTIVE_JEV"
  | "ADAPTIVE_DECISION"
  | "ADAPTIVE_DECISION_ESCALATION"
  | "ADAPTIVE_DECISION_FALLBACK"
  | "ADAPTIVE_ACTION_CONTENT"
  | "ADAPTIVE_ANSWER_EVAL"
  /** Yeni sohbetin başlığı (0 kredi; küçük model, sohbet başına bir kez). */
  | "CHAT_TITLE"
  /** Uzun belgenin alt başlıklarını ana konulara toplama (0 kredi, belge başına bir kez). */
  | "TOPIC_MAP_GROUP"
  /** Sayfa temizliği: PDF metin katmanının yazım/tanıma hataları (0 kredi, sayfa başına bir kez). */
  | "DOCUMENT_CLEAN"
  /** Büyük ana konuyu kavram birimlerine bölme (0 kredi, belge başına bir kez). */
  | "TOPIC_UNITS"
  /** Hazırlığın içerikten adı (0 kredi, kurulum başına bir kez). */
  | "PREP_TITLE"
  /** Sıradaki dersin önceden yazımı (kredi öğrenci dersi açınca ayrıca düşer). */
  | "LESSON_PREFETCH"
  /** Sıradaki test, kart, podcast, sözlü… önceden yazımı (18 Ekim 2026; kredi açılınca düşer). */
  | "CONTENT_PREFETCH"
  /** Konu haritası (tek seferlik özet; 0 kredi, belge başına sabit işleme ücreti var). */
  | "TOPIC_MAP_OUTLINE"
  /** Hazırlık kurulum sohbeti (0 kredi; ücretsizde hazırlık sayısı sınırlı). */
  | "PREP_INTAKE";

export async function recordUsage(
  service: SupabaseClient,
  params: {
    userId: string;
    actionCode: UsageCode;
    model: string;
    tokensIn: number;
    tokensOut: number;
    reservationId?: string | null;
  },
) {
  // tokensIn/Out = FATURALANAN BIRIM. Metin modellerinde jeton; seslendirmede
  // gonderilen karakter, cozumlemede yuklenen kilobayt. Fiyat satirlari
  // (ai_model_prices) her model icin ayni birimle yaziliyor.
  await service.from("ai_usage_events").insert({
    user_id: params.userId,
    action_code: params.actionCode,
    model: params.model,
    tokens_in: params.tokensIn,
    tokens_out: params.tokensOut,
    reservation_id: params.reservationId ?? null,
  });
}
