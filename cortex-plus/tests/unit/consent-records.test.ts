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

describe("kayıt onayı kaydı", () => {
  it("writes one row per legal text with its version, time and a hashed IP", async () => {
    const { service, insert } = fakeService();
    const result = await recordSignupConsent(service, {
      userId: "u1",
      acceptedAt: "2026-09-29T10:00:00.000Z",
      ip: "203.0.113.7, 10.0.0.1",
    });
    expect(result).toEqual({ ok: true, inserted: 2 });
    const rows = (insert.mock.calls[0] as unknown as [Record<string, unknown>[]])[0];
    expect(rows.map((r) => [r.consent_type, r.version])).toEqual([
      ["kvkk_aydinlatma", LEGAL_VERSIONS.kvkk_aydinlatma],
      ["kullanim_kosullari", LEGAL_VERSIONS.kullanim_kosullari],
    ]);
    expect(rows[0].accepted_at).toBe("2026-09-29T10:00:00.000Z");
    // Ham IP saklanmıyor; ilk adres kullanıcıya bağlı özetleniyor.
    expect(rows[0].ip_hash).toBe(hashConsentIp("203.0.113.7", "u1"));
    expect(String(rows[0].ip_hash)).not.toContain("203.0.113.7");
  });

  it("does not duplicate a consent already recorded for the same version", async () => {
    const { service, insert } = fakeService([
      { consent_type: "kvkk_aydinlatma", version: LEGAL_VERSIONS.kvkk_aydinlatma },
      { consent_type: "kullanim_kosullari", version: LEGAL_VERSIONS.kullanim_kosullari },
    ]);
    const result = await recordSignupConsent(service, { userId: "u1", acceptedAt: "2026-09-29T10:00:00.000Z" });
    expect(result).toEqual({ ok: true, inserted: 0 });
    expect(insert).not.toHaveBeenCalled();
  });

  it("reports a failed insert instead of pretending", async () => {
    const { service } = fakeService([], { message: "rls" });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await recordSignupConsent(service, { userId: "u1", acceptedAt: "2026-09-29T10:00:00.000Z" })).toEqual({
      ok: false,
      inserted: 0,
    });
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
    expect(wizard).toContain("legal_consent_at: payload.consentAcceptedAt");
  });
});
