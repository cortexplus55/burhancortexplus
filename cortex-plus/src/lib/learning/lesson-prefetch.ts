import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { spendableCredits } from "@/lib/credits/spendable-server";
import { env } from "@/lib/env";
import { DEFAULT_FAMILIARITY, DEFAULT_MOOD, parseFamiliarity, type Familiarity, type Mood } from "@/lib/learning/session-signals";

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
  return (await spendableCredits(service, userId, now)) >= cost;
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

/**
 * Bu dersten sonra gelen ilk açılmamış ders: önce aynı konunun yolunda, yoksa sıradaki konunun
 * ilk dersi (18 Ekim 2026, ürün sahibinin kararı: konu değişse de sıradaki ders hazır beklesin).
 */
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
  const rows = data ?? [];
  const sameTopic = rows.find((row) => {
    const meta = row.session_meta as { topicId?: unknown } | null;
    const topicId = meta && typeof meta.topicId === "string" ? meta.topicId : null;
    return input.topicId ? topicId === input.topicId : true;
  });
  return ((sameTopic ?? rows[0])?.id as string | undefined) ?? null;
}

/** Hazırlığın ilk açılmamış dersi ve konusunun kayıtlı aşinalığı (yoksa varsayılan). */
export async function firstLessonNode(
  service: SupabaseClient,
  prepId: string,
): Promise<{ nodeId: string; familiarity: Familiarity } | null> {
  const { data } = await service
    .from("exam_prep_nodes")
    .select("id, session_meta")
    .eq("exam_prep_id", prepId)
    .eq("kind", "lesson")
    .neq("status", "done")
    .order("sort_order")
    .limit(1)
    .maybeSingle();
  if (!data?.id) return null;
  const meta = data.session_meta as { topicId?: unknown } | null;
  const topicId = meta && typeof meta.topicId === "string" ? meta.topicId : null;
  let familiarity: Familiarity = DEFAULT_FAMILIARITY;
  if (topicId) {
    const { data: topic } = await service.from("exam_prep_topics").select("familiarity").eq("id", topicId).maybeSingle();
    familiarity = parseFamiliarity(topic?.familiarity ?? DEFAULT_FAMILIARITY);
  }
  return { nodeId: data.id as string, familiarity };
}

/**
 * Bir dersi arka planda yazdır. Yanıt gönderildikten sonra (`after`) çağrılır; isteği
 * başlatıp ayrılır — yazım kendi fonksiyonunda sürer.
 */
export async function requestLessonPrefetch(
  service: SupabaseClient,
  input: { origin: string; userId: string; prepId: string; nodeId: string; familiarity: Familiarity; mood: Mood },
) {
  try {
    if (await nodeHasAttempts(service, input.nodeId)) return;
    const { data: existing } = await service
      .from("exam_prep_prefetch")
      .select("node_id")
      .eq("node_id", input.nodeId)
      .maybeSingle();
    if (existing) return;
    const token = prefetchToken(input.userId, input.nodeId);
    if (!token) return;
    await fetch(`${input.origin}/api/learning/exam-prep/node`, {
      method: "POST",
      headers: { "content-type": "application/json", [PREFETCH_HEADER]: token },
      body: JSON.stringify({
        prepId: input.prepId,
        nodeId: input.nodeId,
        action: "start",
        prefetch: true,
        familiarity: input.familiarity,
        mood: input.mood,
        clientRequestId: randomUUID(),
      }),
      // Yazım bir dakikanın altında sürer; beklemiyoruz. Bağlantı kopsa da öteki
      // fonksiyon işini bitirir.
      signal: AbortSignal.timeout(8_000),
    }).catch(() => undefined);
  } catch (error) {
    console.error("lesson_prefetch_request_failed", {
      cause: error instanceof Error ? error.message.slice(0, 160) : "unknown",
    });
  }
}

/** Öğrenci bir dersi açınca yolundaki sıradaki ders yazılsın. */
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
  const nextId = await nextLessonNode(service, input).catch(() => null);
  if (!nextId) return;
  await requestLessonPrefetch(service, { ...input, nodeId: nextId });
}

/**
 * Hazırlık kurulunca ilk ders hemen yazılmaya başlar (18 Ekim 2026): öğrenci hazırlık
 * sayfasından "Devam et"e basana kadar dersin başı hazır olur.
 */
export async function requestFirstLessonPrefetch(
  service: SupabaseClient,
  input: { origin: string; userId: string; prepId: string },
) {
  const first = await firstLessonNode(service, input.prepId).catch(() => null);
  if (!first) return;
  await requestLessonPrefetch(service, {
    origin: input.origin,
    userId: input.userId,
    prepId: input.prepId,
    nodeId: first.nodeId,
    familiarity: first.familiarity,
    mood: DEFAULT_MOOD,
  });
}

/**
 * Yazımı süren hazır ders (18 Ekim 2026). Önceden yazım da kavram kavram kayda düşer;
 * öğrenci o sırada dersi açarsa ikinci kez yazılmaz: kayıt "devralınır", öğrenci
 * denetlenmiş kısmı hemen görür, kalanı yazıldıkça gelir. Aşinalık kuşağı tutmalı ve yazım
 * ilerliyor olmalı; ilk kavram henüz çıkmadıysa `waitMs` kadar beklenir.
 */
export async function peekBuildingPrefetch(
  service: SupabaseClient,
  input: { userId: string; nodeId: string; familiarity: Familiarity; waitMs?: number },
  now: () => number = Date.now,
): Promise<{ status: "ready" } | { status: "building"; payload: Record<string, unknown> } | null> {
  const deadline = now() + (input.waitMs ?? 0);
  for (;;) {
    const { data } = await service
      .from("exam_prep_prefetch")
      .select("familiarity, status, payload, updated_at")
      .eq("node_id", input.nodeId)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (!data) return null;
    if (familiarityBand(data.familiarity as Familiarity) !== familiarityBand(input.familiarity)) return null;
    if (data.status === "ready") return { status: "ready" };
    const fresh = now() - Date.parse(String(data.updated_at ?? "")) < STALE_CREATING_MS;
    if (!fresh) return null;
    if (data.payload && typeof data.payload === "object" && (data.payload as { type?: unknown }).type === "lesson") {
      return { status: "building", payload: data.payload as Record<string, unknown> };
    }
    if (now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

/** Devralınmış kaydı bulur: önceden yazım her kavramda onu da günceller. */
export async function adoptedPrefetchAttempt(
  service: SupabaseClient,
  nodeId: string,
): Promise<{ id: string; generationId: string; clientRequestId: string | null; userId: string } | null> {
  const { data } = await service
    .from("exam_prep_node_attempts")
    .select("id, generation_id, client_request_id, user_id, payload")
    .eq("node_id", nodeId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const payload = data?.payload as { adoptedPrefetch?: unknown } | null | undefined;
  if (!data?.id || payload?.adoptedPrefetch !== true) return null;
  return {
    id: data.id as string,
    generationId: data.generation_id as string,
    clientRequestId: (data.client_request_id as string | null) ?? null,
    userId: data.user_id as string,
  };
}

/** Önceden yazımın denetlenmiş kısmı: hazır ders kaydına (ve devralındıysa öğrencinin kaydına). */
export async function publishPrefetchPartial(
  service: SupabaseClient,
  nodeId: string,
  payload: Record<string, unknown>,
  now = Date.now(),
) {
  const partial = { ...payload, building: true, builtAt: new Date(now).toISOString() };
  await service
    .from("exam_prep_prefetch")
    .update({ payload: partial, updated_at: new Date(now).toISOString() })
    .eq("node_id", nodeId)
    .eq("status", "creating")
    .then(undefined, () => undefined);
  const adopted = await adoptedPrefetchAttempt(service, nodeId).catch(() => null);
  if (adopted) {
    await service
      .from("exam_prep_node_attempts")
      .update({ payload: { ...partial, adoptedPrefetch: true } })
      .eq("id", adopted.id)
      .eq("generation_id", adopted.generationId)
      .then(undefined, () => undefined);
  }
}
