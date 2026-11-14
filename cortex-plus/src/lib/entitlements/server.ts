import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStudentAccountContext } from "@/lib/student/account-context";
import { firstLessonStatus } from "@/lib/billing/free-topic-gate";
import { spendBreakerBlocks } from "@/lib/billing/spend-breaker";
import { photoAbuseBlocked } from "@/lib/billing/photo-abuse-guard";
import { errorResponse } from "@/lib/api/guards";
import { getGate, snapshotFromAccount } from "@/lib/entitlements/gate";
import type { Action, EntitlementSnapshot, Gate, GateContext, GateReason } from "@/lib/entitlements/types";

/*
  Sunucu tarafı (Faz 3A). Kullanıcı ve plan YALNIZ sunucu oturumundan ve veritabanından okunur; istemciden gelen
  hiçbir değer karara girmez.

  Rotalar bugün hakkı zaten zorluyor (SQL `credit_reserve_metered`, `freeLessonRefused`, `freeTopicGate` …) ve
  sunucu gerçektir. Bu yüzden `assertGate` rotalara İKİNCİ bir ön kontrol olarak takılmadı: ikinci bir karar
  ancak birinciyle ayrışabilirdi (OTONOM §9). Her hak reddinin gövdesi `gate` taşır (`errorResponse`,
  `gateFromRefusal`); `assertGate`, hak kararını önceden isteyen yeni bir uç için hazırdır.
*/

/** Hesabın kapı girdisi: kabuk hesabı + ücretsiz hesapta ilk ders, harcama sigortası, okunamayan fotoğraf. */
export async function entitlementSnapshot(service: SupabaseClient, userId: string, now: Date = new Date()): Promise<EntitlementSnapshot> {
  const account = await getStudentAccountContext(service, userId);
  const base = snapshotFromAccount(account, {}, now);
  if (base.plan !== "free") return base;
  const [firstLesson, spendCap, photoAbuse] = await Promise.all([
    firstLessonStatus(service, userId).then((status) => status?.state ?? null).catch(() => null),
    spendBreakerBlocks(service, userId, { meter: "chat" }).catch(() => false),
    photoAbuseBlocked(service, userId).catch(() => false),
  ]);
  return { ...base, firstLesson, spendCap, photoAbuse };
}

export type AssertedGate = { ok: true; gate: Gate } | { ok: false; gate: Gate; response: Response };

/** Kapının nedeninden sunucunun bugünkü ret kodu (aynı Türkçe metin `errorResponse`'tan gelsin, metin uydurulmasın). */
export function refusalCodeForGate(reason: GateReason): string {
  switch (reason) {
    case "free_first_lesson_used":
      return "free_lesson_limit";
    case "feature_requires_plus":
      return "premium_required";
    case "daily_messages_used":
      return "free_chat_limit";
    case "daily_photo_used":
      return "free_photo_limit";
    case "spend_cap":
      return "spend_cap_free";
    case "free_topic_limit":
    case "free_prep_limit":
    case "free_included_limit":
    case "free_photo_abuse_limit":
      return reason;
    default:
      return "insufficient_credits";
  }
}

/** Kapı kilitliyse 402 + `{ gate }` (`errorResponse` biçimi; metin bugünkü ret metni). */
export async function assertGate(
  service: SupabaseClient,
  userId: string,
  action: Action,
  context: GateContext = {},
  /** Testte hesap okuyucusu değiştirilir; uçlarda hep `entitlementSnapshot`. */
  load: typeof entitlementSnapshot = entitlementSnapshot,
): Promise<AssertedGate> {
  const gate = getGate(await load(service, userId), action, context);
  if (gate.state !== "locked") return { ok: true, gate };
  // Ret kodu bugünkü sunucunun kodlarından biri: free_lesson_limit, free_chat_limit, free_photo_limit, premium_required,
  // free_topic_limit, free_prep_limit, free_included_limit, free_photo_abuse_limit, spend_cap_free, insufficient_credits.
  return {
    ok: false,
    gate,
    response: errorResponse(402, refusalCodeForGate(gate.reason), { gate }),
  };
}
