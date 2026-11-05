import "server-only";

type Bucket = { count: number; resetAt: number };

const memoryBuckets = new Map<string, Bucket>();

/**
 * Bellek yedeği sonsuza kadar büyümesin. Vercel'de bir sunucu örneği saatlerce
 * ayakta kalabiliyor; her yeni anahtar orada kalırsa bellek sızıntısı olur.
 */
const MEMORY_CEILING = 5000;

/**
 * Redis REST çağrısı en fazla bu kadar beklenir. Upstash takılırsa (ağ, kota,
 * bölge kesintisi) istek süresiz asılı kalmasın: süre dolunca bellek yedeğine
 * düşülür (fail-open değil, instance başına yedek sınır).
 */
export const REDIS_TIMEOUT_MS = 400;

function warnRedis(op: string, err: unknown) {
  console.warn(`[rate-limit] Redis ${op} başarısız, bellek yedeği:`, err instanceof Error ? err.name : err);
}

/**
 * Devre kesici (6 Kasım 2026). Upstash düştüğünde her istek 400 ms zaman aşımını bekleyip ancak sonra
 * bellek yedeğine geçiyordu; yük altında bu, her API çağrısına gecikme ekliyordu. Art arda 3 hatadan
 * sonra Redis 30 sn hiç sorulmaz, doğrudan bellek yedeği kullanılır; süre dolunca yeniden denenir.
 */
export const REDIS_BREAKER_THRESHOLD = 3;
export const REDIS_BREAKER_COOLDOWN_MS = 30_000;
const breaker = { failures: 0, openUntil: 0 };

function redisFailed(op: string, err: unknown) {
  warnRedis(op, err);
  breaker.failures += 1;
  if (breaker.failures >= REDIS_BREAKER_THRESHOLD) {
    breaker.openUntil = Date.now() + REDIS_BREAKER_COOLDOWN_MS;
    breaker.failures = 0;
    console.warn(`[rate-limit] Redis devre kesici açık: ${REDIS_BREAKER_COOLDOWN_MS / 1000} sn bellek yedeği`);
  }
}

function redisSucceeded() {
  breaker.failures = 0;
}

/** Kesici açıkken Redis yok sayılır. */
function activeRedis(): { url: string; token: string } | null {
  const redis = redisConfig();
  if (!redis) return null;
  if (breaker.openUntil > Date.now()) return null;
  return redis;
}

/** Kesici şu an açık mı (yönetim ekranı ve testler). */
export function redisBreakerOpen(now = Date.now()): boolean {
  return breaker.openUntil > now;
}

/** Yalnız testler: kesiciyi sıfırla. */
export function resetRedisBreaker() {
  breaker.failures = 0;
  breaker.openUntil = 0;
}

type PipelineRow = { result?: unknown; error?: unknown };

/** Pipeline satırlarından biri hata taşıyorsa ya da beklenen sayıda satır gelmediyse yanıt geçersizdir. */
function pipelineRowsOk(data: unknown, rows: number): data is PipelineRow[] {
  if (!Array.isArray(data) || data.length < rows) return false;
  return data.every((row) => Boolean(row) && typeof row === "object" && !(row as PipelineRow).error);
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** Pencerenin kapanma anı (epoch, ms). `Retry-After` buradan hesaplanır. */
  resetAt: number;
};

/**
 * Redis bağlantısı — iki ayrı isim seti.
 *
 * 5 Eylül 2026'da bulundu: Upstash 1 Eylül'den beri projeye bağlıydı ve
 * bekliyordu, ama hız sınırı hiç çalışmamıştı. Sebep basit — Vercel'in
 * Upstash entegrasyonu değişkenleri `KV_REST_API_URL` / `KV_REST_API_TOKEN`
 * adıyla enjekte ediyor, kod ise `UPSTASH_REDIS_REST_URL` arıyordu. İki taraf
 * da doğruydu, sadece aynı şeye iki farklı ad veriyorlardı.
 *
 * Panele ikinci bir kopya eklemek yerine kodun iki adı da tanıması tercih
 * edildi: aynı anahtarı iki değişkende tutmak, ileride anahtar
 * yenilendiğinde birinin güncellenip diğerinin unutulacağı bir tuzak olurdu.
 *
 * `UPSTASH_*` önce bakılıyor: biri elle bu adı verdiyse niyeti açıktır.
 * `KV_REST_API_READ_ONLY_TOKEN` bilerek kullanılmıyor — sayaç yazma ister.
 */
function redisConfig(): { url: string; token: string } | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

/** Sayaç gerçekten paylaşımlı mı — `/admin/sistem` bunu gösteriyor. */
export function rateLimitBackend(): "redis" | "memory" {
  return redisConfig() ? "redis" : "memory";
}

function sweepMemory(now: number) {
  if (memoryBuckets.size < MEMORY_CEILING) return;
  for (const [key, bucket] of memoryBuckets) {
    if (bucket.resetAt < now) memoryBuckets.delete(key);
  }
  // Hepsi hâlâ canlıysa en eskileri at; sayaç sıfırlanır, sızıntı olmaz.
  if (memoryBuckets.size >= MEMORY_CEILING) {
    const excess = memoryBuckets.size - Math.floor(MEMORY_CEILING / 2);
    let dropped = 0;
    for (const key of memoryBuckets.keys()) {
      memoryBuckets.delete(key);
      if (++dropped >= excess) break;
    }
  }
}

/**
 * Upstash varsa sayaç orada, yoksa sunucunun kendi belleğinde tutulur.
 *
 * Bu ayrımın önemi: Vercel'de her istek başka bir sunucu örneğine düşebiliyor.
 * Bellek yedeği yerel geliştirmede ve testte doğru çalışır, üretimde ise
 * sınırı fiilen kat kat gevşetir. Yani Upstash bağlı değilken buradaki
 * sayılara güvenilmez — koruma asıl Redis ile başlıyor.
 *
 * Redis'e ulaşılamazsa kapı kapatılmaz, bellek yedeğine düşülür: bir Redis
 * kesintisi yüzünden öğrencinin dersi yarıda kalmasın.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const redis = activeRedis();
  const now = Date.now();

  if (redis) {
    try {
      // SET … EX … NX anahtarı yalnızca yokken yaratır ve ömrünü aynı anda
      // verir. Ayrı bir EXPIRE çağrısı olsaydı ve o çağrı hata alsaydı anahtar
      // ölümsüz kalır, kullanıcı kalıcı olarak kapıda dururdu.
      const res = await fetch(`${redis.url}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${redis.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          ["SET", key, "0", "EX", String(windowSeconds), "NX"],
          ["INCR", key],
          ["TTL", key],
        ]),
        cache: "no-store",
        signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`http_${res.status}`);
      const data: unknown = await res.json();
      // Sayı yerine hata gelen yanıt (ör. satırda `error`) eskiden 0 sayılıp isteği geçiriyordu:
      // artık Redis hatası sayılır ve bellek yedeği karar verir.
      if (!pipelineRowsOk(data, 3)) throw new Error("invalid_pipeline_result");
      const count = Number(data[1]?.result);
      if (!Number.isFinite(count) || count < 1) throw new Error("non_numeric_count");
      const ttlRaw = Number(data[2]?.result);
      const ttl = Number.isFinite(ttlRaw) ? ttlRaw : windowSeconds;
      redisSucceeded();
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        resetAt: now + (ttl > 0 ? ttl : windowSeconds) * 1000,
      };
    } catch (err) {
      redisFailed("call", err);
    }
  }

  sweepMemory(now);
  const bucket = memoryBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    const resetAt = now + windowSeconds * 1000;
    memoryBuckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }
  bucket.count += 1;
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

/**
 * Sayacı artırmadan okur.
 *
 * Gerekiyor çünkü bazı sayaçlar her isteği değil yalnızca başarısız denemeyi
 * saymalı (yanlış sınıf kodu gibi). Böyle bir sayaçta kapıyı `rateLimit` ile
 * yoklamak, doğru kodu giren öğrencinin de kotasını yerdi.
 */
export async function peekCount(key: string): Promise<number> {
  const redis = activeRedis();

  if (redis) {
    try {
      const res = await fetch(`${redis.url}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${redis.token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`http_${res.status}`);
      const data = (await res.json()) as PipelineRow;
      if (data?.error) throw new Error("redis_error");
      redisSucceeded();
      return Number(data?.result ?? 0) || 0;
    } catch (err) {
      redisFailed("call", err);
    }
  }

  const bucket = memoryBuckets.get(key);
  if (!bucket || bucket.resetAt < Date.now()) return 0;
  return bucket.count;
}

const memorySets = new Map<string, { members: Set<string>; resetAt: number }>();

/**
 * Bir anahtara düşen farklı değerlerin sayısı — "bu hesap bugün kaç ayrı
 * yerden kullanıldı" sorusu için.
 *
 * Sayaçtan farkı tekrarları saymaması: aynı yerden gelen yüz istek bir
 * sayılıyor. Hesap paylaşımının izi istek sayısında değil, yerlerin
 * çeşitliliğinde.
 */
export async function trackDistinct(
  key: string,
  member: string,
  windowSeconds: number,
): Promise<number> {
  const redis = activeRedis();
  const now = Date.now();

  if (redis) {
    try {
      const res = await fetch(`${redis.url}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${redis.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          ["SADD", key, member],
          ["EXPIRE", key, String(windowSeconds)],
          ["SCARD", key],
        ]),
        cache: "no-store",
        signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`http_${res.status}`);
      const data: unknown = await res.json();
      if (!pipelineRowsOk(data, 3)) throw new Error("invalid_pipeline_result");
      const size = Number(data[2]?.result);
      if (!Number.isFinite(size)) throw new Error("non_numeric_count");
      redisSucceeded();
      return size;
    } catch (err) {
      redisFailed("call", err);
    }
  }

  const existing = memorySets.get(key);
  if (!existing || existing.resetAt < now) {
    memorySets.set(key, {
      members: new Set([member]),
      resetAt: now + windowSeconds * 1000,
    });
    return 1;
  }
  existing.members.add(member);
  if (memorySets.size >= MEMORY_CEILING) {
    for (const [k, v] of memorySets) {
      if (v.resetAt < now) memorySets.delete(k);
    }
  }
  return existing.members.size;
}

/** 429 yanıtına konacak `Retry-After` (saniye, en az 1). */
export function retryAfterSeconds(result: RateLimitResult): number {
  return Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
}

/**
 * Adresten türeyen anahtar. Yalnızca giriş yapmamış istekler için:
 * okuldan ya da yurttan giren onlarca öğrenci tek adresi paylaşıyor, giriş
 * yapmış kullanıcıyı adrese göre saymak onları birbirinin kotasından yerdi.
 */
export function clientKey(request: Request, scope: string) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? "local";
  return `cortex:${scope}:${ip}`;
}

/** Giriş yapmış kullanıcının anahtarı — sayaç kişiye bağlı. */
export function userKey(userId: string, scope: string) {
  return `cortex:u:${scope}:${userId}`;
}

/**
 * Günlük tavan anahtarı. Tarih anahtarın içinde: gün dönünce yeni anahtar
 * doğar, eskisi kendiliğinden ölür.
 */
export function dailyKey(userId: string, scope: string, at = new Date()) {
  return `cortex:d:${scope}:${userId}:${at.toISOString().slice(0, 10)}`;
}

/**
 * Redis'e ham komut dizisi (Upstash REST pipeline). Redis yoksa ya da ulaşılamazsa null:
 * çağıran kapıyı kapatmaz, kendi yedeğine düşer. Üretim yuvaları bunu kullanıyor.
 */
export async function redisPipeline(commands: string[][]): Promise<unknown[] | null> {
  const redis = activeRedis();
  if (!redis) return null;
  try {
    const res = await fetch(`${redis.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${redis.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      cache: "no-store",
      signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`http_${res.status}`);
    const data = (await res.json()) as PipelineRow[];
    if (!Array.isArray(data)) throw new Error("invalid_pipeline_result");
    redisSucceeded();
    // Satır hatası (komutun kendi hatası) çağıranın anlamıdır: kesiciyi tetiklemez, o satır null döner.
    return data.map((row) => row?.result ?? null);
  } catch (err) {
    redisFailed("pipeline", err);
    return null;
  }
}
