import "server-only";

type Bucket = { count: number; resetAt: number };

const memoryBuckets = new Map<string, Bucket>();

export type RateLimitResult = { allowed: boolean; remaining: number };

/**
 * Upstash is used when configured; otherwise an in-process window keeps local
 * development and CI deterministic without external dependencies.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

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

/**
 * Vercel sets `x-vercel-forwarded-for` itself and strips any client-supplied
 * copy, so it is preferred over `x-forwarded-for`, whose leftmost entry is only
 * trustworthy because the platform rewrites it.
 */
export function clientKey(request: Request, scope: string) {
  const trusted = request.headers.get("x-vercel-forwarded-for");
  const forwarded = trusted ?? request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "local";
  return `cortex:ip:${scope}:${ip}`;
}

/** Per-caller quota key. Survives the caller changing networks. */
export function userKey(userId: string, scope: string) {
  return `cortex:user:${scope}:${userId}`;
}
