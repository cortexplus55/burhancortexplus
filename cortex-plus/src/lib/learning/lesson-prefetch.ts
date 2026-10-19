import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { spendableCredits } from "@/lib/credits/spendable-server";
import { env } from "@/lib/env";
import { DEFAULT_FAMILIARITY, DEFAULT_MOOD, parseFamiliarity, type Familiarity, type Mood } from "@/lib/learning/session-signals";
import { difficultyFromFamiliarity } from "@/lib/learning/lesson-open";
import { DEFAULT_PODCAST_LENGTH } from "@/lib/learning/podcast-formats";
import { prepTopicMatch } from "@/lib/learning/prep-topic-lookup";

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

/**
 * Yazılıyor ya da süren kayıt var mı. Isınma yazımı (19 Ekim 2026) bitmiş kayıtları saymaz:
 * bitmiş dersin düğümü yeniden açılınca ("Farklı anlat") yeni ders yine önceden yazılır.
 */
export async function nodeHasOpenAttempt(service: SupabaseClient, nodeId: string) {
  const { data } = await service
    .from("exam_prep_node_attempts")
    .select("id")
    .eq("node_id", nodeId)
    .in("status", ["creating", "active"])
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
  options: { warm?: boolean } = {},
): Promise<boolean> {
  // Isınma yazımında bitmiş eski kayıtlar engel değil; yalnız süren bir kayıt varsa atılır.
  if (options.warm ? await nodeHasOpenAttempt(service, nodeId) : await nodeHasAttempts(service, nodeId)) {
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

/**
 * Önceden hazırlanan etkinlikler (18 Ekim 2026, ürün sahibinin kararı: "hep bir adım önde").
 * Zayıf nokta, odaklı pratik, son kontrol ve aralıklı tekrar öğrencinin kayıtlarından açılışta
 * model çağırmadan kurulur — erken kurulsa son yanlışları kaçırırdı. Yazılı deneme ve sohbet
 * kendi akışlarında.
 */
export const PREFETCH_KINDS: ReadonlySet<string> = new Set(["lesson", "quiz", "true_false", "flashcards", "podcast", "oral"]);

/** Seçimli etkinliklerin varsayılanları: önceden yazım bunlarla yazılır (istemcinin ilk seçimi). */
export const PREFETCH_DEFAULTS = {
  podcastLength: DEFAULT_PODCAST_LENGTH,
  oralQuestionCount: 3,
  /** "Yardımsever" öğretmen. */
  oralMood: "calm" as Mood,
  oralDifficulty: "orta" as const,
};

/**
 * Hazır içerik öğrencinin seçimine uyuyor mu: aynı anahtar. Ders yalnız aşinalık kuşağına bakar;
 * test, doğru/yanlış ve kartlar zorluğa; podcast süreye; sözlü soru sayısı, konu ve öğretmen tipine.
 */
export function prefetchVariant(
  kind: string,
  input: {
    topicLabel: string;
    difficulty?: string | null;
    podcastLength?: string | null;
    oralQuestionCount?: number | null;
    oralScope?: string | null;
    mood?: string | null;
  },
): string {
  if (kind === "lesson") return "lesson";
  if (kind === "podcast") return `podcast:${input.podcastLength ?? PREFETCH_DEFAULTS.podcastLength}`;
  if (kind === "oral") {
    const topic = input.oralScope === "all" ? "*" : input.topicLabel.trim().toLocaleLowerCase("tr");
    return `oral:${input.oralQuestionCount ?? PREFETCH_DEFAULTS.oralQuestionCount}:${topic}:${input.mood ?? PREFETCH_DEFAULTS.oralMood}:${input.difficulty ?? PREFETCH_DEFAULTS.oralDifficulty}`;
  }
  return `${kind}:${input.difficulty ?? "orta"}`;
}

/** Hazır içerik var mı, öğrencinin seçimine uyuyor mu — henüz almadan bakar. */
export async function peekPrefetchedLesson(
  service: SupabaseClient,
  input: { userId: string; nodeId: string; familiarity: Familiarity; variant?: string },
): Promise<boolean> {
  const { data } = await service
    .from("exam_prep_prefetch")
    .select("familiarity, status, payload")
    .eq("node_id", input.nodeId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (!data || data.status !== "ready") return false;
  const stored = (data.payload as { prefetchVariant?: unknown } | null)?.prefetchVariant;
  const variantMismatch = Boolean(input.variant && typeof stored === "string" && stored !== input.variant);
  if (familiarityBand(data.familiarity as Familiarity) !== familiarityBand(input.familiarity) || variantMismatch) {
    // Öğrenci başka bir düzey ya da seçim istiyor; hazır içerik artık ona göre değil.
    await dropPrefetch(service, input.nodeId);
    return false;
  }
  return true;
}

/**
 * Yazımı süren (akışsız) hazır içeriği bekle: test, kartlar, podcast kayda bütün olarak düşer.
 * Hazır olunca döner; kayıt yoksa, bayatsa ya da süre dolduysa hemen.
 */
export async function waitForPrefetchReady(
  service: SupabaseClient,
  input: { userId: string; nodeId: string; maxMs: number },
  now: () => number = Date.now,
): Promise<boolean> {
  const deadline = now() + input.maxMs;
  for (;;) {
    const { data } = await service
      .from("exam_prep_prefetch")
      .select("status, updated_at")
      .eq("node_id", input.nodeId)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (!data) return false;
    if (data.status === "ready") return true;
    if (now() - Date.parse(String(data.updated_at ?? "")) >= STALE_CREATING_MS) return false;
    if (now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
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

type PathRow = { id: string; kind: string; status: string | null; session_meta: unknown };

/**
 * Düğümün konusunun kurulumda kaydedilen aşinalığı. Düğüm sayfasıyla aynı sıra: düğümün konusu,
 * yoksa hazırlığın etkin konusu, o da yoksa varsayılan (18 Ekim 2026 canlı: konu kimliği olmayan
 * düğümde önceden yazım "temel" düzeyle yazdı, öğrencinin "duymuştum"u tutmadı, ders iki kez yazıldı).
 */
export async function nodeFamiliarity(service: SupabaseClient, prepId: string, sessionMeta: unknown): Promise<Familiarity> {
  const meta = sessionMeta as { topicId?: unknown } | null;
  let topicId = meta && typeof meta.topicId === "string" ? meta.topicId : null;
  if (!topicId) {
    const { data: prep } = await service.from("exam_preps").select("active_topic_id").eq("id", prepId).maybeSingle();
    topicId = (prep?.active_topic_id as string | null | undefined) ?? null;
  }
  const match = topicId ? prepTopicMatch(topicId) : null;
  if (!match) return DEFAULT_FAMILIARITY;
  // Belgeli hazırlıkta düğüm belgedeki konu düğümünü tutar (`prepTopicMatch`).
  const { data } = await service
    .from("exam_prep_topics")
    .select("familiarity")
    .eq("exam_prep_id", prepId)
    .or(match)
    .limit(1)
    .maybeSingle();
  return parseFamiliarity(data?.familiarity ?? DEFAULT_FAMILIARITY);
}

/**
 * Yolda bu sıradan sonra gelen ilk önceden hazırlanabilir etkinlik. Arada öğrencinin kayıtlarından
 * anında kurulan (zayıf nokta, son kontrol…) adımlar atlanır; en çok üç adım ileriye bakılır.
 */
export async function nextPrefetchNode(
  service: SupabaseClient,
  input: { prepId: string; afterSortOrder: number },
): Promise<PathRow | null> {
  const { data } = await service
    .from("exam_prep_nodes")
    .select("id, kind, status, session_meta")
    .eq("exam_prep_id", input.prepId)
    .gt("sort_order", input.afterSortOrder)
    .neq("status", "done")
    .order("sort_order")
    .limit(3);
  return ((data ?? []) as PathRow[]).find((row) => PREFETCH_KINDS.has(row.kind)) ?? null;
}

/**
 * Bir etkinliği arka planda yazdır (varsayılan seçimlerle). Yanıt gönderildikten sonra
 * (`after`) çağrılır; isteği başlatıp ayrılır — yazım kendi fonksiyonunda sürer.
 */
export async function requestNodePrefetch(
  service: SupabaseClient,
  input: { origin: string; userId: string; prepId: string; node: PathRow },
  /**
   * warm (19 Ekim 2026): öğrenci ders düğümünü açtı, kartlara bakıyor. Yazım hemen ve hızlı
   * işlemle başlar; bitmiş eski kayıtlar engel değil (yalnız süren kayıt), bayat yazım devralınır.
   */
  options: { warm?: boolean } = {},
) {
  try {
    if (!PREFETCH_KINDS.has(input.node.kind)) return;
    const warm = options.warm === true;
    if (warm ? await nodeHasOpenAttempt(service, input.node.id) : await nodeHasAttempts(service, input.node.id)) return;
    const { data: existing } = await service
      .from("exam_prep_prefetch")
      .select("node_id, status, updated_at")
      .eq("node_id", input.node.id)
      .maybeSingle();
    if (existing) {
      if (!warm) return;
      const fresh = Date.now() - Date.parse(String(existing.updated_at ?? "")) < STALE_CREATING_MS;
      if (existing.status === "ready" || fresh) return;
    }
    const token = prefetchToken(input.userId, input.node.id);
    if (!token) return;
    const familiarity = await nodeFamiliarity(service, input.prepId, input.node.session_meta);
    const oral = input.node.kind === "oral";
    await fetch(`${input.origin}/api/learning/exam-prep/node`, {
      method: "POST",
      headers: { "content-type": "application/json", [PREFETCH_HEADER]: token },
      body: JSON.stringify({
        prepId: input.prepId,
        nodeId: input.node.id,
        action: "start",
        prefetch: true,
        familiarity,
        mood: oral ? PREFETCH_DEFAULTS.oralMood : DEFAULT_MOOD,
        difficulty: oral ? PREFETCH_DEFAULTS.oralDifficulty : difficultyFromFamiliarity(familiarity),
        ...(input.node.kind === "podcast" ? { podcastLength: PREFETCH_DEFAULTS.podcastLength } : {}),
        ...(oral ? { oralQuestionCount: PREFETCH_DEFAULTS.oralQuestionCount, oralScope: "topic", voiceMode: false } : {}),
        ...(warm ? { warm: true } : {}),
        lessonFormat: 3,
        clientRequestId: randomUUID(),
      }),
      // Yazım bir dakikanın altında sürer; beklemiyoruz. Bağlantı kopsa da öteki
      // fonksiyon işini bitirir.
      signal: AbortSignal.timeout(8_000),
    }).catch(() => undefined);
  } catch (error) {
    console.error("prefetch_request_failed", {
      cause: error instanceof Error ? error.message.slice(0, 160) : "unknown",
    });
  }
}

/** Öğrenci bir etkinliği açınca yolundaki sıradaki hazırlanır ("hep bir adım önde"). */
export async function requestNextPrefetch(
  service: SupabaseClient,
  input: { origin: string; userId: string; prepId: string; sortOrder: number },
) {
  const next = await nextPrefetchNode(service, { prepId: input.prepId, afterSortOrder: input.sortOrder }).catch(() => null);
  if (next) await requestNodePrefetch(service, { ...input, node: next });
}

/**
 * Hazırlık kurulunca ve hazırlık sayfası her açıldığında "Sıradaki" hazır değilse yazılır
 * (18 Ekim 2026). Sıradaki etkinlik açılmış ama bitmemişse ondan sonraki hazırlanır.
 */
export async function requestPrepPrefetch(
  service: SupabaseClient,
  input: { origin: string; userId: string; prepId: string },
) {
  try {
    const { data } = await service
      .from("exam_prep_nodes")
      .select("id, kind, status, session_meta, sort_order")
      .eq("exam_prep_id", input.prepId)
      .neq("status", "done")
      .order("sort_order")
      .limit(4);
    const rows = (data ?? []) as (PathRow & { sort_order: number })[];
    const first = rows[0];
    if (!first) return;
    const target = (await nodeHasAttempts(service, first.id))
      ? await nextPrefetchNode(service, { prepId: input.prepId, afterSortOrder: first.sort_order })
      : (rows.find((row) => PREFETCH_KINDS.has(row.kind)) ?? null);
    if (target) await requestNodePrefetch(service, { ...input, node: target });
  } catch (error) {
    console.error("prep_prefetch_failed", { cause: error instanceof Error ? error.message.slice(0, 160) : "unknown" });
  }
}
