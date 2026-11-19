/**
 * Paylaşımlı kısa süreli önbellek (Faz 2, madde 2.2): Upstash Redis varsa orada, yoksa (ya da Redis düşükse) sunucu
 * örneğinin belleğinde sınırlı bir LRU. Middleware (Edge) ve sunucu kodu aynı modülü kullanır; bu yüzden
 * `server-only` yoktur ve yalnız `fetch` kullanılır.
 *
 * Kural: önbellek yalnız OKUMA/GÖSTERİM içindir. Kredi düşümü, iade, ödeme ve kapı kararları SQL'deki atomik
 * fonksiyonlarda kalır (credit_reserve*, credit_commit, credit_refund, finalize_paytr_payment); buradaki değer bayat
 * olsa bile hiçbir harcama kararı ona dayanmaz.
 *
 * Redis hatası isteği asla düşürmez (fail-open): okuma "yok", yazma ve silme sessizce bellek yedeğine iner. Art arda
 * hatada kısa devre kesici açılır; Redis bir süre hiç sorulmaz.
 */

export const SHARED_CACHE_TIMEOUT_MS = 300;
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 30_000;
const MEMORY_MAX = 2000;

type MemoryEntry = { value: string; expiresAt: number };

const memory = new Map<string, MemoryEntry>();
const breaker = { failures: 0, openUntil: 0 };
/** Birim testlerinde varsayılan kapalı (özellik bayrağı önbelleğiyle aynı kural): testler birbirinin değerini görmesin. */
let cacheInTests = false;

function cacheActive(): boolean {
  return cacheInTests || !process.env.VITEST;
}

function redisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  if (breaker.openUntil > Date.now()) return null;
  return { url, token };
}

function failed() {
  breaker.failures += 1;
  if (breaker.failures >= BREAKER_THRESHOLD) {
    breaker.failures = 0;
    breaker.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
  }
}

async function redis(commands: string[][]): Promise<unknown[] | null> {
  const config = redisConfig();
  if (!config) return null;
  try {
    const res = await fetch(`${config.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      cache: "no-store",
      signal: AbortSignal.timeout(SHARED_CACHE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`http_${res.status}`);
    const data = (await res.json()) as { result?: unknown; error?: unknown }[];
    if (!Array.isArray(data)) throw new Error("invalid_pipeline_result");
    breaker.failures = 0;
    return data.map((row) => (row && !row.error ? (row.result ?? null) : null));
  } catch {
    failed();
    return null;
  }
}

function memoryGet(key: string, now = Date.now()): string | null {
  const hit = memory.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= now) {
    memory.delete(key);
    return null;
  }
  // LRU: okunan anahtar sona taşınır.
  memory.delete(key);
  memory.set(key, hit);
  return hit.value;
}

function memorySet(key: string, value: string, ttlSeconds: number) {
  memory.delete(key);
  memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  while (memory.size > MEMORY_MAX) {
    const oldest = memory.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    memory.delete(oldest);
  }
}

/** Önbellekteki JSON değer; yoksa, süresi dolduysa ya da okunamazsa null. */
export async function sharedCacheGet<T>(key: string): Promise<T | null> {
  if (!cacheActive()) return null;
  const viaRedis = redisConfig() ? await redis([["GET", key]]) : null;
  const raw = viaRedis ? (typeof viaRedis[0] === "string" ? (viaRedis[0] as string) : null) : memoryGet(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Değeri `ttlSeconds` saniyeliğine yazar. Redis yazamazsa bellek yedeğine yazılır. */
export async function sharedCacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!cacheActive()) return;
  const raw = JSON.stringify(value);
  const result = redisConfig() ? await redis([["SET", key, raw, "EX", String(Math.max(1, Math.round(ttlSeconds)))]]) : null;
  if (!result) memorySet(key, raw, ttlSeconds);
}

/** Anahtarları hem Redis'ten hem bellekten siler (bayat görünüm kalmasın). */
export async function sharedCacheDelete(keys: string[]): Promise<void> {
  for (const key of keys) memory.delete(key);
  if (keys.length && redisConfig()) await redis([["DEL", ...keys]]);
}

/** Yalnız testler: belleği ve kesiciyi sıfırlar; `cache: true` önbelleği testte açar. */
export function resetSharedCacheForTests(options: { cache?: boolean } = {}) {
  cacheInTests = Boolean(options.cache);
  memory.clear();
  breaker.failures = 0;
  breaker.openUntil = 0;
}
