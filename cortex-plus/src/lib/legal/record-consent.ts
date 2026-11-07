import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AGE_DECLARATION, LEGAL_VERSIONS, consentKey, type ConsentType } from "@/lib/legal/versions";
import {
  ageProblem,
  validReadEvidence,
  type AgeDeclaration,
  type ConsentEvidence,
  type ConsentRow,
} from "@/lib/legal/consent-evidence";
import { missingColumn } from "@/lib/learning/missing-column";

/*
  Kayıt onayı eskiden yalnızca tarayıcıda yaşıyordu: kutu işaretlenmeden
  kayıt olunmuyordu ama işaretlendiği hiçbir yerde yazmıyordu.
  `consent_records` tablosu ilk migration'dan beri vardı ve canlıda 0
  satırdı (29 Eylül 2026). Ödemedeki sözleşme onayı ise denetim kaydına
  yazılıyor; kayıttaki KVKK/kullanım koşulları onayı bunun eşi.

  IP ham tutulmuyor, kullanıcıya bağlı bir özetle tutuluyor: kolon adı
  zaten `ip_hash`. "Şu IP'den mi onaylandı" sorusu özet karşılaştırılarak
  cevaplanabiliyor; tablo sızsa bile IP listesi çıkmıyor.

  7 Kasım 2026 (uyum paketi): satır artık bir kanıt da taşıyor (`evidence`): metnin hangi sürümü ne zaman açıldı,
  ne zaman onaylandı, sonuna kadar kaydırıldı mı; yaş beyanında 18 altı mı ve velinin izni beyan edildi mi.
  Kanıtı olmayan onay (eski istemci, eski hesap verisi) bugünkü sürüm adına YAZILMAZ: öğrenci o metni hiç
  görmedi. Eksik onayı bir sonraki girişte onay kapısı ister.
*/

export function hashConsentIp(ip: string | null | undefined, salt: string): string | null {
  const clean = ip?.split(",")[0]?.trim();
  if (!clean) return null;
  return createHash("sha256").update(`${clean}:${salt}`).digest("hex");
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

export type ConsentItem = {
  type: string;
  version: string;
  acceptedAt: string;
  evidence?: Record<string, unknown> | null;
};

/** Öğrencinin kayıtlı onay satırları; okunamazsa `null` (çağıran "bilmiyorum" der, kapıyı açmaz). */
export async function loadConsentRows(service: SupabaseClient, userId: string): Promise<ConsentRow[] | null> {
  const { data, error } = await service
    .from("consent_records")
    .select("consent_type, version")
    .eq("user_id", userId);
  if (error) {
    console.error("consent_record_failed", { userId, step: "read", error: error.message });
    return null;
  }
  return (data ?? []) as ConsentRow[];
}

/**
 * Onay satırlarını yazar; aynı `tür@sürüm` ikinci kez yazılmaz. Göç (evidence sütunu) canlıda yoksa satır kanıtsız
 * yazılır: onayın kendisi kaybolmasın.
 */
export async function recordConsents(
  service: SupabaseClient,
  input: { userId: string; items: ConsentItem[]; ip?: string | null },
): Promise<{ ok: boolean; inserted: number }> {
  if (!input.items.length) return { ok: true, inserted: 0 };
  const existing = await loadConsentRows(service, input.userId);
  if (!existing) return { ok: false, inserted: 0 };
  const have = new Set(existing.map((row) => consentKey(row.consent_type, row.version)));
  const ipHash = hashConsentIp(input.ip, input.userId);
  const seen = new Set<string>();
  const rows = input.items
    .filter((item) => {
      const key = consentKey(item.type, item.version);
      if (have.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => ({
      user_id: input.userId,
      consent_type: item.type,
      version: item.version,
      accepted_at: item.acceptedAt,
      ip_hash: ipHash,
      evidence: item.evidence ?? null,
    }));
  if (!rows.length) return { ok: true, inserted: 0 };
  let { error } = await service.from("consent_records").insert(rows);
  if (error && missingColumn(error)) {
    const withoutEvidence = rows.map((row) => {
      const copy: Record<string, unknown> = { ...row };
      delete copy.evidence;
      return copy;
    });
    ({ error } = await service.from("consent_records").insert(withoutEvidence));
  }
  if (error) {
    console.error("consent_record_failed", { userId: input.userId, step: "insert", error: error.message });
    return { ok: false, inserted: 0 };
  }
  return { ok: true, inserted: rows.length };
}

/** Kayıt sihirbazının (ya da onay kapısının) kanıtlarından yazılacak satırlar. Saf: test bunu doğrudan sınar. */
export function consentItemsFrom(
  input: { acceptedAt: string; documents?: ConsentEvidence | null; age?: AgeDeclaration | null },
  now: Date = new Date(),
): ConsentItem[] {
  const items: ConsentItem[] = [];
  for (const [type, version] of Object.entries(LEGAL_VERSIONS) as [ConsentType, string][]) {
    const evidence = input.documents?.[type];
    if (!validReadEvidence(evidence, version, now)) continue;
    items.push({ type, version, acceptedAt: consentMoment(evidence.confirmedAt, now), evidence });
  }
  if (input.age && !ageProblem(input.age)) {
    items.push({
      type: AGE_DECLARATION.type,
      version: AGE_DECLARATION.version,
      acceptedAt: consentMoment(input.acceptedAt, now),
      evidence: { minor: input.age.minor, guardianAck: input.age.minor ? input.age.guardianAck : false },
    });
  }
  return items;
}

export async function recordSignupConsent(
  service: SupabaseClient,
  input: {
    userId: string;
    acceptedAt: string;
    ip?: string | null;
    documents?: ConsentEvidence | null;
    age?: AgeDeclaration | null;
  },
): Promise<{ ok: boolean; inserted: number }> {
  const result = await recordConsents(service, {
    userId: input.userId,
    ip: input.ip,
    items: consentItemsFrom(input),
  });
  if (input.age?.minor) await hideMinorFromLeaderboard(service, input.userId);
  return result;
}

/**
 * 18 yaşından küçük öğrencinin adı sıralamada kapalı başlar (Kurul'un çocuk verisi rehberi: varsayılan en koruyucu
 * ayar). Öğrenci isterse yıldızlar penceresinden açar; bu fonksiyon yalnız ilk beyanda çağrılır.
 */
export async function hideMinorFromLeaderboard(service: SupabaseClient, userId: string): Promise<void> {
  const { error } = await service.from("profiles").update({ stars_hidden: true }).eq("id", userId);
  if (error) console.error("minor_leaderboard_hide_failed", { userId, error: error.message });
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
