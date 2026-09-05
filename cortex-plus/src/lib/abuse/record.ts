import "server-only";
import { createHmac } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";

export type AbuseSignal =
  | "rate_limit"
  | "daily_cap"
  | "moderation"
  | "multi_account"
  | "token_bruteforce"
  | "storage_cap"
  | "session_spread";

export type AbuseSeverity = "low" | "medium" | "high";

/**
 * IP'nin geri çevrilemez özeti.
 *
 * Ham IP kişisel veri; sömürüyü yakalamak için "aynı yerden mi geliyor"
 * bilgisi yeterli. `APP_SECRET` yoksa (yerel geliştirme) sabit bir tuz
 * kullanılıyor — o ortamda zaten korunacak gerçek kullanıcı yok.
 */
export function hashIp(ip: string | null): string | null {
  if (!ip || ip === "local") return null;
  return createHmac("sha256", env.APP_SECRET ?? "cortex-local-salt")
    .update(ip)
    .digest("hex")
    .slice(0, 32);
}

export function requestIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();
  return ip && ip.length > 0 ? ip : null;
}

type RecordParams = {
  signal: AbuseSignal;
  severity?: AbuseSeverity;
  scope?: string;
  userId?: string | null;
  request?: Request;
  ip?: string | null;
  metadata?: Record<string, unknown>;
  /**
   * Aynı sinyalin kaç saniyede bir yazılacağı. Sınıra takılan bir bot
   * saniyede yüzlerce 429 üretir; hepsini yazsak koruma tablosunun kendisi
   * sele dönüşürdü. Varsayılan bir saat: "bu kullanıcı bugün bu uçta takıldı"
   * bilgisi için fazlasıyla yeterli.
   */
  dedupeSeconds?: number;
};

/**
 * Sinyali kaydeder. Hiçbir koşulda çağıran isteği düşürmez — koruma
 * kaydının başarısızlığı, korunan işlemi engellemek için bir sebep değil.
 */
export async function recordAbuse(params: RecordParams): Promise<void> {
  try {
    const ip = params.ip ?? (params.request ? requestIp(params.request) : null);
    const ipHash = hashIp(ip);
    const identity = params.userId ?? ipHash ?? "anon";
    const dedupeKey = `cortex:abuse-log:${params.signal}:${params.scope ?? "-"}:${identity}`;

    const gate = await rateLimit(dedupeKey, 1, params.dedupeSeconds ?? 3600);
    if (!gate.allowed) return;

    await createServiceClient()
      .from("abuse_events")
      .insert({
        user_id: params.userId ?? null,
        signal: params.signal,
        severity: params.severity ?? "low",
        scope: params.scope ?? null,
        ip_hash: ipHash,
        metadata: params.metadata ?? {},
      });
  } catch {
    // Sessiz: koruma kaydı tutulamadı diye kullanıcının işi yarıda kalmaz.
  }
}
