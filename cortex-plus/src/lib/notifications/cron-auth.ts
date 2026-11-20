import { timingSafeEqual } from "node:crypto";

/**
 * Cron uçlarının kimliği: Vercel Cron `Authorization: Bearer $CRON_SECRET` gönderir. Anahtar tanımlı değilse uç kapalıdır.
 * Karşılaştırma sabit sürede.
 */
export function cronAuthorized(request: Request, env: Record<string, string | undefined> = process.env): boolean {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
