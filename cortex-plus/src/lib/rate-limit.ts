import "server-only";

type Bucket = { count: number; resetAt: number };

const memoryBuckets = new Map<string, Bucket>();

export type RateLimitResult = { allowed: boolean; remaining: number };

/**
 * Upstash is used when configured; otherwise an in-process window keeps local
 * development and CI deterministic without external dependencies.
 */
let warnedAboutMemoryFallback = false;

/**
 * The in-memory bucket is per-instance. That is fine locally and in CI, but on
 * a serverless host every concurrent lambda keeps its own counter, so a limit
 * of 40 becomes 40 *per instance* — which is not a limit. Say so once at
 * startup rather than letting it degrade in silence.
 */
function warnIfLimiterIsLocalOnly() {
  if (warnedAboutMemoryFallback) return;
  warnedAboutMemoryFallback = true;
  if (process.env.NODE_ENV !== "production") return;
  console.warn(
    "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN yok — limitler bellek içi ve " +
      "her sunucu örneği için ayrı sayıyor; dağıtık limit uygulanmıyor.",
  );
}

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) warnIfLimiterIsLocalOnly();

  if (url && token) {
    try {
      const res = await fetch(`${url}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          ["INCR", key],
          ["EXPIRE", key, String(windowSeconds), "NX"],
        ]),
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { result: number }[];
        const count = Number(data?.[0]?.result ?? 0);
        return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
      }
    } catch {
      // fall through to in-memory limiting
    }
  }

  const now = Date.now();
  const bucket = memoryBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1 };
  }
  bucket.count += 1;
  return { allowed: bucket.count <= limit, remaining: Math.max(0, limit - bucket.count) };
}

export function clientKey(request: Request, scope: string) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? "local";
  return `cortex:${scope}:${ip}`;
}
