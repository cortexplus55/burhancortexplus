import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { consentMoment, hashConsentIp, recordSignupConsent } from "@/lib/legal/record-consent";
import { LEGAL_VERSIONS } from "@/lib/legal/versions";

function fakeService(existing: { consent_type: string; version: string }[] = [], insertError: unknown = null) {
  const insert = vi.fn(async () => ({ error: insertError }));
  const service = {
    from: vi.fn(() => ({
      select: () => ({ eq: async () => ({ data: existing, error: null }) }),
      insert,
    })),
  };
  return { service: service as never, insert };
}

/*
  7 Kasım 2026 (uyum paketi): satır yalnız okuma kanıtı olan metin için yazılır (sürüm, açılış ve onay anı, sonuna
  kadar kaydırıldı). Kanıtsız eski onay bugünkü sürüm adına yazılmaz; öğrenci onay kapısında metni yeniden görür.
*/
function evidenceFor(version: string) {
  const confirmed = new Date(Date.now() - 60_000).toISOString();
  return { version, openedAt: new Date(Date.now() - 120_000).toISOString(), confirmedAt: confirmed, scrolledToEnd: true };
}

const DOCUMENTS = {
  kvkk_aydinlatma: evidenceFor(LEGAL_VERSIONS.kvkk_aydinlatma),
  kullanim_kosullari: evidenceFor(LEGAL_VERSIONS.kullanim_kosullari),
};

describe("kayıt onayı kaydı", () => {
  it("writes one row per legal text with its version, time, evidence and a hashed IP", async () => {
    const { service, insert } = fakeService();
    const result = await recordSignupConsent(service, {
      userId: "u1",
      acceptedAt: new Date().toISOString(),
      ip: "203.0.113.7, 10.0.0.1",
      documents: DOCUMENTS,
    });
    expect(result).toEqual({ ok: true, inserted: 2 });
    const rows = (insert.mock.calls[0] as unknown as [Record<string, unknown>[]])[0];
    expect(rows.map((r) => [r.consent_type, r.version])).toEqual([
      ["kvkk_aydinlatma", LEGAL_VERSIONS.kvkk_aydinlatma],
      ["kullanim_kosullari", LEGAL_VERSIONS.kullanim_kosullari],
    ]);
    expect(rows[0].accepted_at).toBe(DOCUMENTS.kvkk_aydinlatma.confirmedAt);
    expect(rows[0].evidence).toEqual(DOCUMENTS.kvkk_aydinlatma);
    // Ham IP saklanmıyor; ilk adres kullanıcıya bağlı özetleniyor.
    expect(rows[0].ip_hash).toBe(hashConsentIp("203.0.113.7", "u1"));
    expect(String(rows[0].ip_hash)).not.toContain("203.0.113.7");
  });

  it("writes nothing for a consent without reading evidence", async () => {
    const { service, insert } = fakeService();
    const result = await recordSignupConsent(service, { userId: "u1", acceptedAt: new Date().toISOString() });
    expect(result).toEqual({ ok: true, inserted: 0 });
    expect(insert).not.toHaveBeenCalled();
  });

  it("does not duplicate a consent already recorded for the same version", async () => {
    const { service, insert } = fakeService([
      { consent_type: "kvkk_aydinlatma", version: LEGAL_VERSIONS.kvkk_aydinlatma },
      { consent_type: "kullanim_kosullari", version: LEGAL_VERSIONS.kullanim_kosullari },
    ]);
    const result = await recordSignupConsent(service, { userId: "u1", acceptedAt: new Date().toISOString(), documents: DOCUMENTS });
    expect(result).toEqual({ ok: true, inserted: 0 });
    expect(insert).not.toHaveBeenCalled();
  });

  it("reports a failed insert instead of pretending", async () => {
    const { service } = fakeService([], { message: "rls" });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(
      await recordSignupConsent(service, { userId: "u1", acceptedAt: new Date().toISOString(), documents: DOCUMENTS }),
    ).toEqual({ ok: false, inserted: 0 });
    expect(errors).toHaveBeenCalledWith("consent_record_failed", expect.objectContaining({ step: "insert" }));
    errors.mockRestore();
  });

  it("trusts a recent past consent time, but not a future or stale one", () => {
    const now = new Date("2026-09-29T12:00:00Z");
    expect(consentMoment("2026-09-29T11:59:00Z", now)).toBe("2026-09-29T11:59:00.000Z");
    expect(consentMoment("2026-09-30T00:00:00Z", now)).toBe(now.toISOString());
    expect(consentMoment("2026-08-01T00:00:00Z", now)).toBe(now.toISOString());
    expect(consentMoment(undefined, now)).toBe(now.toISOString());
  });

  it("the wizard sends the consent time on both email and Google signup", () => {
    const wizard = readFileSync("src/app/kayit/signup-wizard.tsx", "utf8");
    expect(wizard.match(/consentAcceptedAt: new Date\(\)\.toISOString\(\)/g)).toHaveLength(2);
    // 8 Kasım 2026: e-posta kaydı sunucu ucundan; onay anı ve kanıtı uca gider, uç hesabın üst verisine yazar.
    expect(wizard).toContain("consentAcceptedAt: payload.consentAcceptedAt");
    expect(wizard).toContain("consentEvidence: payload.consentEvidence");
    const route = readFileSync("src/app/api/auth/signup/route.ts", "utf8");
    expect(route).toContain("legal_consent_at: input.consentAcceptedAt");
    expect(route).toContain("legal_consent_evidence: input.consentEvidence ?? null");
  });
});
