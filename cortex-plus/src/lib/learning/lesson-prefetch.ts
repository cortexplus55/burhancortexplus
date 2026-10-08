import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Familiarity, Mood } from "@/lib/learning/session-signals";

/**
 * Sıradaki dersin önceden hazırlanması (3 Ekim 2026, ürün sahibinin kararı).
 *
 * Öğrenci bir dersi açınca yolundaki bir sonraki ders arka planda yazılır ve
 * `exam_prep_prefetch`'te bekler. Öğrenci o dersi açınca beklemeden gelir;
 * kredi yalnız o an düşer. Açılmayan dersin model maliyeti bizde kalır.
 *
 * Arka plan isteği öğrencinin çerezini taşımaz: Supabase yenileme anahtarını
 * iki ayrı istekte kullanmak oturumu düşürebilir. Onun yerine sunucunun
 * imzaladığı kısa ömürlü bir başlık taşır; yalnız sunucu üretebilir.
 */

export const PREFETCH_HEADER = "x-cp-lesson-prefetch";
const TOKEN_TTL_MS = 2 * 60_000;
/** Yazımı yarıda kalmış kayıt bu süreden sonra yeniden denenebilir. */
const STALE_CREATING_MS = 10 * 60_000;

function prefetchSecret(): string | null {
  return env.APP_SECRET || env.SUPABASE_SECRET_KEY || null;
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(`lesson-prefetch:${payload}`).digest("hex");
}

export function prefetchToken(userId: string, nodeId: string, now = Date.now()): string | null {
  const secret = prefetchSecret();
  if (!secret) return null;
  const payload = `${userId}.${nodeId}.${now + TOKEN_TTL_MS}`;
  return `${payload}.${sign(payload, secret)}`;
}

/** Geçerli imza → çağıranın kimliği. Süresi geçmiş ya da bozuk imza → null. */
export function verifyPrefetchToken(
  token: string | null,
  now = Date.now(),
): { userId: string; nodeId: string } | null {
  const secret = prefetchSecret();
  if (!secret || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [userId, nodeId, exp, mac] = parts;
  const expected = sign(`${userId}.${nodeId}.${exp}`, secret);
  if (mac.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  if (!(Number(exp) > now)) return null;
  return { userId, nodeId };
}

/**
 * Aşinalık dersin nereden başlayacağını belirliyor. Hazır ders, öğrencinin
 * yeni seçimi aynı kuşaktaysa kullanılır; değilse yeniden yazılır.
 */
export function familiarityBand(level: Familiarity): "weak" | "mid" | "strong" {
  if (level === "new" || level === "heard") return "weak";
  if (level === "good" || level === "confident") return "strong";
  return "mid";
}

/**
 * Öğrenci sıradaki dersi açabilecek mi? `credit_reserve` ile aynı hesap:
 * satın alınan kredi (`balance`) + dönem hakkı (`free_allowance_remaining` —
 * abonenin aylık, ücretsizin günlük hakkı da burada). Dönemi bitmiş hak ilk
 * işlemde yenileneceği için tam sayılır. Yalnız `balance`'a bakmak (#243)
 * gerçek abonede önceden hazırlamayı hiç çalıştırmıyordu.
 */
export async function canAffordLesson(
  service: SupabaseClient,
  userId: string,
  cost: number,
  now = Date.now(),
): Promise<boolean> {
  const { data: admin } = await service.rpc("is_admin", { uid: userId });
  if (admin === true) return true;
  const { data } = await service
    .from("credit_wallets")
    .select("balance, free_allowance_remaining, period_allowance, period_ends_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return false;
  const ended = data.period_ends_at ? new Date(data.period_ends_at as string).getTime() <= now : false;
  const allowance = Number((ended ? data.period_allowance : data.free_allowance_remaining) ?? 0);
  return Number(data.balance ?? 0) + allowance >= cost;
}

export async function nodeHasAttempts(service: SupabaseClient, nodeId: string) {
  const { data } = await service
    .from("exam_prep_node_attempts")
    .select("id")
    .eq("node_id", nodeId)
    .limit(1);
  return Boolean(data?.length);
}

/** Yazıma başlamadan önce düğümü sahiplen. Başkası yazıyorsa false. */
export async function claimPrefetchSlot(
  service: SupabaseClient,
  row: { nodeId: string; prepId: string; userId: string; topicId: string | null; familiarity: Familiarity },
): Promise<boolean> {
  const record = {
    node_id: row.nodeId,
    exam_prep_id: row.prepId,
    user_id: row.userId,
    topic_id: row.topicId,
    familiarity: row.familiarity,
    status: "creating",
    payload: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const inserted = await service.from("exam_prep_prefetch").insert(record);
  if (!inserted.error) return true;
  // Yarıda kalmış eski yazım: devral.
  const { data } = await service
    .from("exam_prep_prefetch")
    .update(record)
    .eq("node_id", row.nodeId)
    .eq("status", "creating")
    .lt("updated_at", new Date(Date.now() - STALE_CREATING_MS).toISOString())
    .select("node_id");
  return Boolean(data?.length);
}

export async function dropPrefetch(service: SupabaseClient, nodeId: string) {
  await service.from("exam_prep_prefetch").delete().eq("node_id", nodeId).then(undefined, () => undefined);
}

/** Yazım bitti. Bu arada öğrenci dersi kendisi açtıysa hazır ders atılır. */
export async function storePrefetchedLesson(
  service: SupabaseClient,
  nodeId: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  if (await nodeHasAttempts(service, nodeId)) {
    await dropPrefetch(service, nodeId);
    return false;
  }
  const { error } = await service
    .from("exam_prep_prefetch")
    .update({ status: "ready", payload, updated_at: new Date().toISOString() })
    .eq("node_id", nodeId)
    .eq("status", "creating");
  return !error;
}

/** Hazır ders var mı, öğrencinin seçimine uyuyor mu — henüz almadan bakar. */
export async function peekPrefetchedLesson(
  service: SupabaseClient,
  input: { userId: string; nodeId: string; familiarity: Familiarity },
): Promise<boolean> {
  const { data } = await service
    .from("exam_prep_prefetch")
    .select("familiarity, status")
    .eq("node_id", input.nodeId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (!data || data.status !== "ready") return false;
  if (familiarityBand(data.familiarity as Familiarity) !== familiarityBand(input.familiarity)) {
    // Öğrenci başka bir yerden başlamak istiyor; hazır ders artık ona göre değil.
    await dropPrefetch(service, input.nodeId);
    return false;
  }
  return true;
}

/** Hazır dersi tek seferlik al (siler). Aynı anda iki açılışta yalnız biri alır. */
export async function takePrefetchedLesson(
  service: SupabaseClient,
  input: { userId: string; nodeId: string },
): Promise<{ payload: Record<string, unknown>; topicId: string | null } | null> {
  const { data } = await service
    .from("exam_prep_prefetch")
    .delete()
    .eq("node_id", input.nodeId)
    .eq("user_id", input.userId)
    .eq("status", "ready")
    .select("payload, topic_id")
    .maybeSingle();
  if (!data?.payload || typeof data.payload !== "object") return null;
  return {
    payload: data.payload as Record<string, unknown>,
    topicId: (data.topic_id as string | null) ?? null,
  };
}

/** Aynı konunun yolunda bu dersten sonra gelen ilk açılmamış ders. */
export async function nextLessonNode(
  service: SupabaseClient,
  input: { prepId: string; sortOrder: number; topicId: string | null },
): Promise<string | null> {
  const { data } = await service
    .from("exam_prep_nodes")
    .select("id, status, session_meta")
    .eq("exam_prep_id", input.prepId)
    .eq("kind", "lesson")
    .gt("sort_order", input.sortOrder)
    .neq("status", "done")
    .order("sort_order")
    .limit(12);
  const next = (data ?? []).find((row) => {
    const meta = row.session_meta as { topicId?: unknown } | null;
    const topicId = meta && typeof meta.topicId === "string" ? meta.topicId : null;
    return input.topicId ? topicId === input.topicId : true;
  });
  return (next?.id as string | undefined) ?? null;
}

/**
 * Sıradaki dersi arka planda yazdır. Yanıt gönderildikten sonra (`after`)
 * çağrılır; isteği başlatıp ayrılır — yazım kendi fonksiyonunda sürer.
 */
export async function requestNextLessonPrefetch(
  service: SupabaseClient,
  input: {
    origin: string;
    userId: string;
    prepId: string;
    sortOrder: number;
    topicId: string | null;
    familiarity: Familiarity;
    mood: Mood;
  },
) {
  try {
    const nextId = await nextLessonNode(service, input);
    if (!nextId || (await nodeHasAttempts(service, nextId))) return;
    const { data: existing } = await service
      .from("exam_prep_prefetch")
      .select("node_id")
      .eq("node_id", nextId)
      .maybeSingle();
    if (existing) return;
    const token = prefetchToken(input.userId, nextId);
    if (!token) return;
    await fetch(`${input.origin}/api/learning/exam-prep/node`, {
      method: "POST",
      headers: { "content-type": "application/json", [PREFETCH_HEADER]: token },
      body: JSON.stringify({
        prepId: input.prepId,
        nodeId: nextId,
        action: "start",
        prefetch: true,
        familiarity: input.familiarity,
        mood: input.mood,
        clientRequestId: randomUUID(),
      }),
      // Yazım 1-3 dakika sürer; beklemiyoruz. Bağlantı kopsa da öteki
      // fonksiyon işini bitirir.
      signal: AbortSignal.timeout(8_000),
    }).catch(() => undefined);
  } catch (error) {
    console.error("lesson_prefetch_request_failed", {
      cause: error instanceof Error ? error.message.slice(0, 160) : "unknown",
    });
  }
}
