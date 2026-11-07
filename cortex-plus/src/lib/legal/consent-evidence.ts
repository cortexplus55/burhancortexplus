import { z } from "zod";
import {
  AGE_DECLARATION,
  LEGAL_VERSIONS,
  consentKey,
  type ConsentType,
} from "@/lib/legal/versions";

/*
  Onay kanıtı (7 Kasım 2026, uyum paketi). Ürün sahibinin isteği: KVKK metni açılmadan kutu işaretlenemesin;
  öğrenci metni açıp sonuna kadar okusun, sonra onaylasın; onay saklansın; aynı sürümü onaylamış öğrenciye bir daha
  sorulmasın. Kanıt yalnız "kutu işaretlendi" değil: metnin hangi sürümünün ne zaman açıldığı, ne zaman onaylandığı ve
  sonuna kadar kaydırıldığı. Sunucu kanıtı doğrular, `consent_records.evidence`e yazar.

  Bu dosya hem tarayıcıda (kayıt sihirbazı, onay kapısı) hem sunucuda çalışır; sunucuya özgü bir şey içermez.
*/

export const readEvidenceSchema = z.object({
  version: z.string().max(20),
  openedAt: z.string().max(40),
  confirmedAt: z.string().max(40),
  scrolledToEnd: z.boolean(),
});
export type ReadEvidence = z.infer<typeof readEvidenceSchema>;

export const ageDeclarationSchema = z.object({
  minor: z.boolean(),
  guardianAck: z.boolean(),
});
export type AgeDeclaration = z.infer<typeof ageDeclarationSchema>;

export const consentEvidenceSchema = z
  .object({
    kvkk_aydinlatma: readEvidenceSchema.optional(),
    kullanim_kosullari: readEvidenceSchema.optional(),
  })
  .partial();
export type ConsentEvidence = z.infer<typeof consentEvidenceSchema>;

/** Saat farkı payı: tarayıcı saati sunucudan biraz ileride olabilir. */
const CLOCK_SKEW_MS = 2 * 60_000;
/** Kanıt bu kadar eski olamaz (kayıt yarım kalıp bir hafta sonra tamamlanırsa metin yeniden okunur). */
const EVIDENCE_MAX_AGE_MS = 7 * 86_400_000;

/**
 * Okuma kanıtı geçerli mi: bugünkü sürüm, metin sonuna kadar kaydırılmış, açılış ≤ onay ≤ şimdi ve son bir hafta
 * içinde. Geçersiz kanıt reddedilmez, yalnız kaydedilmez: öğrenci bir sonraki girişte metni yeniden görür.
 */
export function validReadEvidence(
  evidence: ReadEvidence | null | undefined,
  version: string,
  now: Date = new Date(),
): evidence is ReadEvidence {
  if (!evidence || evidence.version !== version || !evidence.scrolledToEnd) return false;
  const opened = Date.parse(evidence.openedAt);
  const confirmed = Date.parse(evidence.confirmedAt);
  if (Number.isNaN(opened) || Number.isNaN(confirmed)) return false;
  if (opened > confirmed) return false;
  const nowMs = now.getTime();
  if (confirmed > nowMs + CLOCK_SKEW_MS) return false;
  return nowMs - confirmed <= EVIDENCE_MAX_AGE_MS;
}

/** Yaş beyanında eksik ne: arayüz ve sunucu aynı cümleyi kullanır. */
export function ageProblem(age: Partial<AgeDeclaration> | null | undefined): string | null {
  if (!age || typeof age.minor !== "boolean") return "Yaşını seç.";
  if (age.minor && !age.guardianAck) return "18 yaşından küçüksen velinin iznini onayla.";
  return null;
}

export type ConsentRow = { consent_type: string; version: string };

export type MissingConsent = { type: ConsentType; version: string; previous: string | null };

export type ConsentStatus = {
  /** Bugünkü sürümü onaylanmamış metinler. `previous` daha önce onaylanan sürüm (yoksa ilk kez soruluyor). */
  missing: MissingConsent[];
  /** Yaş beyanı hiç alınmamış. */
  ageNeeded: boolean;
  /** Kayıtlı bütün `tür@sürüm` anahtarları (ödeme sözleşmesinin okunup okunmadığı da buradan). */
  read: string[];
};

/** Kayıtlı onay satırlarından bugün neyin eksik olduğu. Saf fonksiyon: sunucu da test de aynı kuralı kullanır. */
export function consentStatusFrom(rows: ConsentRow[]): ConsentStatus {
  const read = [...new Set(rows.map((row) => consentKey(row.consent_type, row.version)))];
  const have = new Set(read);
  const missing: MissingConsent[] = [];
  for (const [type, version] of Object.entries(LEGAL_VERSIONS) as [ConsentType, string][]) {
    if (have.has(consentKey(type, version))) continue;
    const older = rows
      .filter((row) => row.consent_type === type && row.version !== version)
      .map((row) => row.version)
      .sort()
      .at(-1);
    missing.push({ type, version, previous: older ?? null });
  }
  const ageNeeded = !rows.some((row) => row.consent_type === AGE_DECLARATION.type);
  return { missing, ageNeeded, read };
}
