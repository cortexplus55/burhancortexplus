import "server-only";
import { redisPipeline, rateLimitBackend } from "@/lib/rate-limit";

/**
 * Üretim yuvaları — aynı anda en çok N içerik üretimi (19 Ekim 2026, satışa hazırlık Faz 3.2).
 *
 * Neden: her ders, test, podcast birkaç dakikalık model çağrısı zinciri. Lansmanda yüzlerce öğrenci
 * aynı anda "Ders oluştur"a basarsa OpenAI dakikalık sınırı (429) aşılır ve hepsi birden yavaşlar ya
 * da düşer. Yuva dolunca yeni istek hata vermez: öğrenci isteği yer açılana kadar (en çok
 * `STUDENT_WAIT_MS`) bekler, yine dolu ise `generation_busy` döner ve ekran "sıradasın" diyerek
 * kendiliğinden yeniden dener. Önceden yazım (öğrenci beklemiyor) yuvaların yalnız %70'ini
 * kullanabilir ve beklemez: öğrenci isteğine yer kalsın.
 *
 * Yuva Upstash'te süreli bir kira kaydı (sorted set, skor = bitiş anı): işlev çökerse kira
 * `LEASE_MS` sonra kendiliğinden düşer. Redis'e ulaşılamazsa kapı kapanmaz (ders yarıda kalmasın);
 * Redis hiç yoksa (yerel, test) sayaç bu sunucunun belleğinde.
 */

const KEY = "gen:slots";
/** Rota tavanı 300 sn; kira biraz daha uzun ki süren iş sayılmaya devam etsin. */
const LEASE_MS = 6 * 60_000;
const STUDENT_WAIT_MS = 25_000;
const POLL_MS = 1_000;
/** Önceden yazımın kullanabileceği pay. */
const PREFETCH_SHARE = 0.7;

export function generationSlotLimit(): number {
  const raw = Number(process.env.GENERATION_SLOTS);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 40;
}

export type SlotPriority = "student" | "prefetch";
export type GenerationSlot = { ok: true; release: () => Promise<void> } | { ok: false; active: number; limit: number };

const memoryLeases = new Map<string, number>();

function sweepMemory(now: number) {
  for (const [lease, until] of memoryLeases) if (until <= now) memoryLeases.delete(lease);
}

async function tryAcquire(lease: string, limit: number): Promise<{ ok: boolean; active: number } | null> {
  const now = Date.now();
  const result = await redisPipeline([
    ["ZREMRANGEBYSCORE", KEY, "-inf", String(now)],
    ["ZADD", KEY, String(now + LEASE_MS), lease],
    ["ZCARD", KEY],
    ["PEXPIRE", KEY, String(LEASE_MS * 2)],
  ]);
  if (!result) return null;
  const active = Number(result[2] ?? 0);
  if (active <= limit) return { ok: true, active };
  await redisPipeline([["ZREM", KEY, lease]]);
  return { ok: false, active: active - 1 };
}

/**
 * Bir üretim için yuva alır. `ok: false` yalnız yuvalar gerçekten doluyken döner; çağıran
 * `generation_busy` (503) verir. Alınan yuva `release` ile bırakılır (bırakılmazsa kira düşer).
 */
export async function acquireGenerationSlot(
  priority: SlotPriority,
  options: { waitMs?: number; pollMs?: number } = {},
): Promise<GenerationSlot> {
  const max = generationSlotLimit();
  const limit = priority === "prefetch" ? Math.max(1, Math.floor(max * PREFETCH_SHARE)) : max;
  const waitMs = options.waitMs ?? (priority === "prefetch" ? 0 : STUDENT_WAIT_MS);
  const pollMs = Math.max(1, options.pollMs ?? POLL_MS);
  const lease = crypto.randomUUID();
  const deadline = Date.now() + waitMs;

  if (rateLimitBackend() === "memory") {
    for (;;) {
      const now = Date.now();
      sweepMemory(now);
      if (memoryLeases.size < limit) {
        memoryLeases.set(lease, now + LEASE_MS);
        return { ok: true, release: async () => void memoryLeases.delete(lease) };
      }
      if (Date.now() + pollMs > deadline) return { ok: false, active: memoryLeases.size, limit };
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }

  for (;;) {
    const attempt = await tryAcquire(lease, limit);
    // Redis'e ulaşılamadı: kapı kapanmaz.
    if (!attempt) return { ok: true, release: async () => undefined };
    if (attempt.ok) {
      return {
        ok: true,
        release: async () => {
          await redisPipeline([["ZREM", KEY, lease]]);
        },
      };
    }
    if (Date.now() + pollMs > deadline) return { ok: false, active: attempt.active, limit };
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

/** Şu an süren üretim sayısı — `/admin/sistem`. Redis yoksa bu sunucunun sayısı. */
export async function generationSlotsInUse(): Promise<{ active: number; limit: number; shared: boolean }> {
  const limit = generationSlotLimit();
  if (rateLimitBackend() === "memory") {
    sweepMemory(Date.now());
    return { active: memoryLeases.size, limit, shared: false };
  }
  const result = await redisPipeline([
    ["ZREMRANGEBYSCORE", KEY, "-inf", String(Date.now())],
    ["ZCARD", KEY],
  ]);
  return { active: Number(result?.[1] ?? 0), limit, shared: Boolean(result) };
}

/** `fn`'i bir yuvayla çalıştırır; yuva yoksa `busy` döner, `fn` hiç çağrılmaz. */
export async function withGenerationSlot<T>(
  priority: SlotPriority,
  fn: () => Promise<T>,
  busy: (slot: { active: number; limit: number }) => T,
): Promise<T> {
  const slot = await acquireGenerationSlot(priority);
  if (!slot.ok) {
    console.warn("generation_busy", { priority, active: slot.active, limit: slot.limit });
    return busy(slot);
  }
  try {
    return await fn();
  } finally {
    await slot.release().catch(() => undefined);
  }
}
