import { describe, expect, it } from "vitest";
import { cspDirectives, cspHeaderName, cspHeaderValue } from "@/lib/security/csp";

/*
  Politikadaki her kaynağın kodda kanıtlanabilir bir kullanımı var; bu testler
  o eşleşmenin kopmadığını tutuyor. Bir kaynak listeden düşerse zorunlu kipe
  geçtiğimiz gün o sayfa bozulur ve sebebini aramak günler alır.
*/
describe("CSP politikası", () => {
  const d = cspDirectives({ reportUri: "/api/csp-report" });

  it("varsayılan olarak yalnızca kendi kaynağımız", () => {
    expect(d["default-src"]).toEqual(["'self'"]);
  });

  it("eklenti ve çerçeveye alma kapalı", () => {
    expect(d["object-src"]).toEqual(["'none'"]);
    expect(d["frame-ancestors"]).toEqual(["'none'"]);
    expect(d["base-uri"]).toEqual(["'self'"]);
  });

  it("ödeme iframe'i ve form hedefi PayTR'a açık", () => {
    expect(d["frame-src"]).toContain("https://www.paytr.com");
    expect(d["form-action"]).toContain("https://www.paytr.com");
  });

  it("yazı tipleri: stil googleapis'ten, dosyalar gstatic'ten", () => {
    expect(d["style-src"]).toContain("https://fonts.googleapis.com");
    expect(d["font-src"]).toContain("https://fonts.gstatic.com");
  });

  it("Supabase tarayıcıdan erişilebilir — giriş, veri, depo", () => {
    expect(d["connect-src"]).toContain("https://*.supabase.co");
    expect(d["connect-src"]).toContain("wss://*.supabase.co");
    expect(d["media-src"]).toContain("https://*.supabase.co");
    expect(d["img-src"]).toContain("https://*.supabase.co");
  });

  it("tanıtım videosu ve ölçüm kaynakları listede", () => {
    expect(d["media-src"]).toContain("https://videos.pexels.com");
    expect(d["script-src"]).toContain("https://eu.i.posthog.com");
    expect(d["connect-src"]).toContain("https://eu.i.posthog.com");
    expect(d["connect-src"]).toContain("https://*.ingest.sentry.io");
  });

  it("satır içi betik izni duruyor — App Router hidrasyonu bunu istiyor", () => {
    // Kalıcı çözüm nonce; düşerse sayfa hiç açılmaz.
    expect(d["script-src"]).toContain("'unsafe-inline'");
  });

  it("eval yalnızca üretim dışında", () => {
    expect(cspDirectives({ allowEval: true })["script-src"]).toContain("'unsafe-eval'");
    expect(cspDirectives({ allowEval: false })["script-src"]).not.toContain("'unsafe-eval'");
  });

  it("rapor ucu politikaya yazılıyor", () => {
    expect(d["report-uri"]).toEqual(["/api/csp-report"]);
    expect(cspDirectives({})["report-uri"]).toBeUndefined();
  });

  it("başlık dizesi geçerli biçimde", () => {
    const v = cspHeaderValue({ reportUri: "/api/csp-report" });
    expect(v).toMatch(/^default-src 'self';/);
    expect(v).toContain("; connect-src 'self' https://\*.supabase.co");
    expect(v.endsWith(";")).toBe(false);
  });

  it("rapor kipi ile zorunlu kip farklı başlık adı kullanıyor", () => {
    expect(cspHeaderName(true)).toBe("Content-Security-Policy-Report-Only");
    expect(cspHeaderName(false)).toBe("Content-Security-Policy");
  });
});
