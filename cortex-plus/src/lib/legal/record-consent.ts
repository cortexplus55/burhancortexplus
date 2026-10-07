import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LEGAL_VERSIONS } from "@/lib/legal/versions";

/*
  Kayıt onayı eskiden yalnızca tarayıcıda yaşıyordu: kutu işaretlenmeden
  kayıt olunmuyordu ama işaretlendiği hiçbir yerde yazmıyordu.
  `consent_records` tablosu ilk migration'dan beri vardı ve canlıda 0
  satırdı (29 Eylül 2026). Ödemedeki sözleşme onayı ise denetim kaydına
  yazılıyor; kayıttaki KVKK/kullanım koşulları onayı bunun eşi.

  IP ham tutulmuyor, kullanıcıya bağlı bir özetle tutuluyor: kolon adı
  zaten `ip_hash`. "Şu IP'den mi onaylandı" sorusu özet karşılaştırılarak
  cevaplanabiliyor; tablo sızsa bile IP listesi çıkmıyor.
*/

export function hashConsentIp(ip: string | null | undefined, userId: string): string | null {
  const clean = ip?.split(",")[0]?.trim();
  if (!clean) return null;
  return createHash("sha256").update(`${clean}:${userId}`).digest("hex");
}

/** İsteği yapanın IP'si (Vercel ilk adresi x-forwarded-for'a yazar). */
export async function requestIp(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    const list = await headers();
    return list.get("x-forwarded-for") ?? list.get("x-real-ip");
  } catch {
    return null;
  }
}

export async function recordSignupConsent(
  service: SupabaseClient,
  input: { userId: string; acceptedAt: string; ip?: string | null },
): Promise<{ ok: boolean; inserted: number }> {
  const { data: existing, error: readError } = await service
    .from("consent_records")
    .select("consent_type, version")
    .eq("user_id", input.userId);
  if (readError) {
    console.error("consent_record_failed", { userId: input.userId, step: "read", error: readError.message });
    return { ok: false, inserted: 0 };
  }
  const have = new Set((existing ?? []).map((row) => `${row.consent_type}@${row.version}`));
  const ipHash = hashConsentIp(input.ip, input.userId);
  const rows = Object.entries(LEGAL_VERSIONS)
    .filter(([type, version]) => !have.has(`${type}@${version}`))
    .map(([type, version]) => ({
      user_id: input.userId,
      consent_type: type,
      version,
      accepted_at: input.acceptedAt,
      ip_hash: ipHash,
    }));
  if (!rows.length) return { ok: true, inserted: 0 };
  const { error } = await service.from("consent_records").insert(rows);
  if (error) {
    console.error("consent_record_failed", { userId: input.userId, step: "insert", error: error.message });
    return { ok: false, inserted: 0 };
  }
  return { ok: true, inserted: rows.length };
}

/** Onay anı: istemcinin bildirdiği an geçerli ve geçmişteyse o, değilse şimdi. */
export function consentMoment(claimed: unknown, now = new Date()): string {
  if (typeof claimed === "string") {
    const time = Date.parse(claimed);
    // Gelecek ya da bir haftadan eski bir an kanıt değil; sunucu saatine düş.
    if (!Number.isNaN(time) && time <= now.getTime() && now.getTime() - time < 7 * 86_400_000) {
      return new Date(time).toISOString();
    }
  }
  return now.toISOString();
}
