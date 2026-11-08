import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  Bütün e-postalar Resend'den (8 Kasım 2026, ürün sahibi: "doğrulama maili gelmedi; hepsini Resend'e taşı").
  Supabase'in kendi e-postası saatte 30'la sınırlı ve Gmail SMTP'den gidiyordu; gelmiyordu. Burada üç şey sınanır:
  Resend alan adı durumunun yorumu (gönderim düşünce neden belli olsun), giriş ipucu ucu ve Supabase'in e-posta
  gönderen çağrılarının kodda kalmadığı.
*/
vi.mock("server-only", () => ({}));

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });

describe("Resend alan adı durumu", () => {
  it("gönderen alan adı EMAIL_FROM'dan okunur", async () => {
    const { fromDomainOf } = await import("@/lib/email/resend-status");
    expect(fromDomainOf("Cortex Plus <cortexplus@cortexplus.app>")).toBe("cortexplus.app");
    expect(fromDomainOf("cortexplus@Cortexplus.APP")).toBe("cortexplus.app");
    expect(fromDomainOf("adres-yok")).toBeNull();
    expect(fromDomainOf(undefined)).toBeNull();
  });

  it("doğrulanmış → hazır; eklenmemiş, doğrulanmamış, anahtar reddi ve yalnız-gönderim anahtarı ayrı durumlar", async () => {
    const { interpretDomains, describeResendStatus } = await import("@/lib/email/resend-status");
    const ok = interpretDomains({ fromDomain: "cortexplus.app", httpStatus: 200, body: { data: [{ name: "cortexplus.app", status: "verified" }] } });
    expect(ok).toEqual({ state: "ready", fromDomain: "cortexplus.app" });
    expect(describeResendStatus(ok).tone).toBe("ok");

    const sub = interpretDomains({ fromDomain: "posta.cortexplus.app", httpStatus: 200, body: { data: [{ name: "cortexplus.app", status: "verified" }] } });
    expect(sub.state).toBe("ready");

    const missing = interpretDomains({ fromDomain: "cortexplus.app", httpStatus: 200, body: { data: [{ name: "baska.com", status: "verified" }] } });
    expect(missing).toMatchObject({ state: "domain_missing", known: ["baska.com"] });
    expect(describeResendStatus(missing)).toMatchObject({ tone: "bad" });

    const pending = interpretDomains({ fromDomain: "cortexplus.app", httpStatus: 200, body: { data: [{ name: "cortexplus.app", status: "pending" }] } });
    expect(pending).toEqual({ state: "domain_not_verified", fromDomain: "cortexplus.app", status: "pending" });
    expect(describeResendStatus(pending).action).toContain("yedek yola düşer");

    expect(interpretDomains({ fromDomain: "cortexplus.app", httpStatus: 401, body: { name: "restricted_api_key" } }).state).toBe("domains_unreadable");
    expect(interpretDomains({ fromDomain: "cortexplus.app", httpStatus: 401, body: { name: "validation_error", message: "API key is invalid" } })).toMatchObject({ state: "key_rejected" });
    expect(interpretDomains({ fromDomain: "cortexplus.app", httpStatus: 500, body: null }).state).toBe("unreachable");
  });

  it("anahtar ya da gönderen adres tanımsızsa hangisinin eksik olduğunu söyler; ağ çağrısı yapmaz", async () => {
    const { readResendStatus } = await import("@/lib/email/resend-status");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await readResendStatus({ EMAIL_FROM: "a@b.co" })).toEqual({ state: "not_configured", missing: ["RESEND_API_KEY"] });
    expect(await readResendStatus({})).toEqual({ state: "not_configured", missing: ["RESEND_API_KEY", "EMAIL_FROM"] });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("giriş ipucu", () => {
  const state = { providers: ["google"] as string[] | null };
  beforeEach(() => {
    vi.resetModules();
    state.providers = ["google"];
  });

  async function post(email: unknown) {
    vi.doMock("@/lib/api/guards", () => ({ guestLimit: async () => null }));
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: () => ({
        auth: {
          admin: {
            listUsers: async () => ({
              data: {
                users: state.providers
                  ? [{ email: "ogrenci@ornek.com", app_metadata: { providers: state.providers } }]
                  : [],
              },
              error: null,
            }),
          },
        },
      }),
    }));
    const { POST } = await import("@/app/api/auth/giris-ipucu/route");
    const response = await POST(new Request("http://x/api/auth/giris-ipucu", { method: "POST", body: JSON.stringify({ email }) }));
    return (await response.json()) as { hint: string | null };
  }

  it("yalnız Google ile açılmış hesapta ipucu verir", async () => {
    expect((await post("Ogrenci@Ornek.com")).hint).toContain("Google ile açılmış");
  });

  it("şifresi olan hesapta, kayıtsız adreste ve bozuk girdide cevap aynı: ipucu yok", async () => {
    state.providers = ["email"];
    expect((await post("ogrenci@ornek.com")).hint).toBeNull();
    state.providers = ["email", "google"];
    expect((await post("ogrenci@ornek.com")).hint).toBeNull();
    state.providers = null;
    expect((await post("ogrenci@ornek.com")).hint).toBeNull();
    expect((await post("adres-degil")).hint).toBeNull();
  });
});

describe("Supabase'in kendi e-postası kodda kalmadı", () => {
  const BANNED: [RegExp, string][] = [
    [/auth\.signUp\(/, "auth.signUp( (Supabase kendi doğrulama e-postasını gönderir)"],
    [/auth\.resend\(/, "auth.resend( (Supabase kendi e-postasını gönderir)"],
    [/resetPasswordForEmail\(/, "resetPasswordForEmail( (Supabase kendi e-postasını gönderir)"],
    [/signInWithOtp\(/, "signInWithOtp( (Supabase kendi e-postasını gönderir)"],
    [/inviteUserByEmail\(/, "inviteUserByEmail( (Supabase kendi e-postasını gönderir)"],
  ];

  it("src altında e-posta gönderen Supabase çağrısı yok; bağlantılar generateLink ile üretilip Resend'den gider", () => {
    const hits: string[] = [];
    for (const file of files("src")) {
      const text = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      for (const [pattern, label] of BANNED) if (pattern.test(text)) hits.push(`${file}: ${label}`);
    }
    expect(hits).toEqual([]);
    const reset = read("src/lib/auth/password-reset.ts");
    expect(reset).toContain("auth.admin.generateLink");
    expect(reset).toContain("sendPasswordResetEmail");
  });

  it("şifremi unuttum ve kayıt sayfaları yalnız kendi uçlarımızı çağırır", () => {
    expect(read("src/app/sifremi-unuttum/page.tsx")).toContain('"/api/auth/sifre-sifirla"');
    expect(read("src/app/kayit/signup-wizard.tsx")).toContain('"/api/auth/signup"');
    expect(read("src/app/email-dogrula/page.tsx")).toContain('"/api/auth/eposta-dogrula/gonder"');
  });
});
