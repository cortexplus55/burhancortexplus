import "server-only";
import { redisPipeline } from "@/lib/rate-limit";

/*
  Süren üretimi paylaş (31 Ekim 2026, Paket J2 #9).

  Ders ve test yol rotasından geçer; orada aynı anda tek "hazırlanıyor" kaydı var (node/reserve.ts). Hazırlığın podcast
  sayfası ve video ders kendi uçlarından üretilir ve her sekme kendi istek kimliğiyle ayrı kredi ayırıyordu: iki sekme =
  iki podcast (12 + ses) ya da iki video (280). Burada anahtar öğrenci + hazırlık + konu + iş + seçim: aynı anda yalnız
  bir istek üretir; ikincisi birincinin bitmesini bekler (kilit kalkana kadar), sonra sonucu okur (podcast önbellekten,
  video son kayıttan). Kilit süreli (işlev çökerse düşer). Redis yoksa bu sunucunun belleği; Redis'e ulaşılamazsa kapı
  kapanmaz (eski davranış).
*/

const memoryLocks = new Map<string, number>();

async function acquire(key: string, ttlMs: number): Promise<boolean | null> {
  const result = await redisPipeline([["SET", `inflight:${key}`, String(Date.now()), "NX", "PX", String(ttlMs)]]);
  if (result) return result[0] === "OK";
  const now = Date.now();
  const until = memoryLocks.get(key);
  if (until && until > now) return false;
  memoryLocks.set(key, now + ttlMs);
  return true;
}

async function held(key: string): Promise<boolean> {
  const result = await redisPipeline([["EXISTS", `inflight:${key}`]]);
  if (result) return Number(result[0]) === 1;
  const until = memoryLocks.get(key);
  return Boolean(until && until > Date.now());
}

async function release(key: string): Promise<void> {
  memoryLocks.delete(key);
  await redisPipeline([["DEL", `inflight:${key}`]]);
}

export type ShareOptions = {
  /** Kilidin ömrü: işlevin tavanından biraz uzun. */
  ttlMs?: number;
  /** İkinci isteğin bekleme tavanı. */
  waitMs?: number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * `run` yalnız kilidi alan istekte çalışır. Kilit başkasındaysa kalkana kadar beklenir, sonra `afterWait` çağrılır
 * (birincinin sonucunu okur ya da — önbellekli işte — `run`'ı yeniden çağırıp önbellekten alır).
 */
export async function shareInFlight<T>(
  key: string,
  run: () => Promise<T>,
  afterWait: () => Promise<T>,
  options: ShareOptions = {},
): Promise<T> {
  const ttlMs = options.ttlMs ?? 330_000;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const acquired = await acquire(key, ttlMs).catch(() => null);
  if (acquired !== false) {
    try {
      return await run();
    } finally {
      if (acquired) await release(key).catch(() => undefined);
    }
  }
  const waitUntil = Date.now() + (options.waitMs ?? 240_000);
  while (Date.now() < waitUntil && (await held(key).catch(() => false))) {
    await sleep(options.pollMs ?? 2_000);
  }
  return afterWait();
}

export function resetInflightForTests() {
  memoryLocks.clear();
}
