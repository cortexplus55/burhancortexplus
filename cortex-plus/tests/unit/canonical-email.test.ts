/**
 * Faz 2 madde 4: kanonik e-posta, kayıt ucunun onay alanları ve IP başına saatlik ücretsiz kayıt sınırı.
 * Örnekler genel biçimlerdir (gerçek hesap ya da test verisi değil).
 */
import { readFileSync } from "fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CANONICAL_EMAIL_TAKEN_MESSAGE, normalizeCanonicalEmail } from "@/lib/auth/canonical-email";
import { normalizeEmail } from "@/lib/auth/email-policy";
import { providerFailurePath } from "@/lib/auth/link-failure";

describe("normalizeCanonicalEmail", () => {
  it("boşluk atılır, küçük harfe iner", () => {
    expect(normalizeCanonicalEmail("  Ad.Soyad@Okul.Edu.TR ")).toBe("ad.soyad@okul.edu.tr");
  });
  it("+ sonrası atılır (her alanda)", () => {
    expect(normalizeCanonicalEmail("ad+not@okul.edu.tr")).toBe("ad@okul.edu.tr");
    expect(normalizeCanonicalEmail("ad+a+b@gmail.com")).toBe("ad@gmail.com");
  });
  it("gmail.com ve googlemail.com'da noktalar atılır, alan gmail.com olur", () => {
    expect(normalizeCanonicalEmail("a.d.s.o.y.a.d@gmail.com")).toBe("adsoyad@gmail.com");
    expect(normalizeCanonicalEmail("Ad.Soyad+1@GoogleMail.com")).toBe("adsoyad@gmail.com");
  });
  it("başka alanlarda noktalar korunur", () => {
    expect(normalizeCanonicalEmail("ad.soyad@outlook.com")).toBe("ad.soyad@outlook.com");
  });
  it("biçimsiz girdi yalnız temizlenir", () => {
    expect(normalizeCanonicalEmail(" METIN ")).toBe("metin");
    expect(normalizeCanonicalEmail(null)).toBe("");
  });
  it("eski normalizeEmail aynı kurala bağlı", () => {
    for (const email of ["Ad.Soyad+1@GoogleMail.com", "ad+not@okul.edu.tr", "x@y"]) {
      expect(normalizeEmail(email)).toBe(normalizeCanonicalEmail(email));
    }
  });
  it("cümle birebir", () => {
    expect(CANONICAL_EMAIL_TAKEN_MESSAGE).toBe("Bu e-posta adresiyle ilişkili bir hesabın zaten bulunuyor, lütfen giriş yap.");
  });
});

describe("Google ile ilk giriş: aynı kutunun hesabı varsa kilit yok, giriş yolu", () => {
  it("veritabanı kalkanının hatası 'hesap var' ekranına gider", () => {
    const params = new URLSearchParams({ error: "server_error", error_code: "unexpected_failure", error_description: "Database error saving new user" });
    expect(providerFailurePath(params)).toBe("/auth/auth-code-error?neden=hesap-var");
    expect(providerFailurePath(new URLSearchParams({ error: "access_denied" }))).toBe("/auth/auth-code-error?neden=saglayici");
  });
  it("hata ekranı cümleyi ve giriş/şifre sıfırlama yolunu gösterir", () => {
    const page = readFileSync("src/app/auth/auth-code-error/page.tsx", "utf8");
    expect(page).toContain('neden === "hesap-var"');
    expect(page).toContain("CANONICAL_EMAIL_TAKEN_MESSAGE");
    expect(page).toContain('primaryHref="/giris"');
  });
});

const h = vi.hoisted(() => ({
  profileTaken: false,
  aliasTaken: false,
  created: 0,
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: () => undefined };
});
vi.mock("@/lib/legal/record-consent", () => ({
  recordSignupConsent: async () => ({ ok: true, inserted: 0 }),
  stampSignupAcceptance: async () => true,
  consentMoment: (claimed: unknown) => (typeof claimed === "string" ? claimed : new Date().toISOString()),
}));
vi.mock("@/lib/email/preferences", () => ({ recordSignupMarketingConsent: async () => undefined }));
vi.mock("@/lib/auth/email-verification", () => ({ UNVERIFIED_FLAG: "email_unverified", sendVerification: async () => true }));
vi.mock("@/lib/supabase/server", () => {
  const service = {
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        limit: async () => ({
          data: table === "profiles" && h.profileTaken ? [{ id: "x" }] : [],
          error: null,
        }),
      };
      return builder;
    },
    rpc: async (name: string) => (name === "email_alias_taken" ? { data: h.aliasTaken, error: null } : { data: null, error: null }),
    auth: {
      admin: {
        createUser: async (attrs: { email: string }) => {
          h.created += 1;
          return { data: { user: { id: `00000000-0000-4000-8000-${String(h.created).padStart(12, "0")}`, email: attrs.email } }, error: null };
        },
      },
    },
  };
  return { createServiceClient: () => service, createClient: async () => service };
});

let ipCounter = 0;
function request(body: Record<string, unknown>, ip: string) {
  return new Request("https://cortexplus.app/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

const BODY = {
  email: "ogrenci@okul.edu.tr",
  password: "Guvenli2026x",
  fullName: "Öğrenci Ad",
  consentAcceptedAt: new Date().toISOString(),
  termsAccepted: true,
  kvkkAccepted: true,
  ageConfirmed: true,
};

describe("kayıt ucu (sunucu doğrulaması)", () => {
  beforeEach(() => {
    h.profileTaken = false;
    h.aliasTaken = false;
    ipCounter += 1;
  });

  it("onaylardan biri yoksa ya da true değilse 400", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");
    const ip = `198.51.100.${ipCounter}`;
    for (const field of ["termsAccepted", "kvkkAccepted", "ageConfirmed"] as const) {
      const missing = { ...BODY } as Record<string, unknown>;
      delete missing[field];
      const res = await POST(request(missing, ip));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ reason: "consent_required" });
      const falsy = await POST(request({ ...BODY, [field]: false }, ip));
      expect(falsy.status).toBe(400);
    }
    expect((await POST(request(BODY, ip))).status).toBe(200);
  });

  it("aynı kutunun hesabı varsa 409 ve birebir cümle (profil kanonik adresi ya da auth takma adı)", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");
    const ip = `198.51.100.${ipCounter}`;
    h.profileTaken = true;
    const res = await POST(request({ ...BODY, email: "Ogr.Enci+2@gmail.com" }, ip));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: CANONICAL_EMAIL_TAKEN_MESSAGE });
    h.profileTaken = false;
    h.aliasTaken = true;
    const alias = await POST(request({ ...BODY, email: "ogr.enci@gmail.com" }, ip));
    expect(alias.status).toBe(409);
    expect(await alias.json()).toMatchObject({ error: CANONICAL_EMAIL_TAKEN_MESSAGE });
  });

  it("aynı IP'den saatte en çok 5 hesap; başarısız denemeler sayılmaz", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");
    const { FREE_SIGNUP_PER_IP_HOUR } = await import("@/lib/auth/signup-limits");
    expect(FREE_SIGNUP_PER_IP_HOUR).toBe(5);
    const ip = `203.0.113.${ipCounter}`;
    // Başarısız denemeler (onay yok) kotayı yemez.
    for (let i = 0; i < 3; i += 1) expect((await POST(request({ ...BODY, termsAccepted: false }, ip))).status).toBe(400);
    for (let i = 0; i < 5; i += 1) expect((await POST(request({ ...BODY, email: `ogrenci${i}@okul.edu.tr` }, ip))).status).toBe(200);
    const sixth = await POST(request({ ...BODY, email: "ogrenci6@okul.edu.tr" }, ip));
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toMatchObject({ reason: "signup_ip_hourly_limit" });
    // Başka ağ etkilenmez.
    expect((await POST(request({ ...BODY, email: "ogrenci7@okul.edu.tr" }, `203.0.113.${ipCounter + 100}`))).status).toBe(200);
  });
});
