import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import manifest from "@/app/manifest";

/*
  Mağaza uygulaması bir TWA olacak: site kendi kabuğunda açılıyor, ayrı bir
  Android uygulaması yazılmıyor. Astra da aynı yöntemi kullanıyor
  (`co.astra_ai.app.twa`).

  Bu dosya iki sessiz kırılma noktasını tutuyor:

  1. Maskeli simge girdisi. Android simgeyi daire/kare/damla biçiminde
     kırpıyor; `any` işaretli bir simge kırpıldığında kenarları kesiliyor.
  2. `assetlinks.json` yolu. Doğrulama geçmezse uygulama yine çalışıyor ama
     ÜSTÜNDE adres çubuğuyla — yani mağazadan inen şey tarayıcı sekmesi gibi
     görünüyor ve "uygulama" hissi tümüyle kayboluyor.
*/

describe("PWA bildirimi", () => {
  const value = manifest();

  it("mağazanın beklediği alanlar dolu", () => {
    expect(value.id).toBe("/");
    expect(value.scope).toBe("/");
    expect(value.display).toBe("standalone");
    expect(value.start_url).toBe("/");
  });

  /* `any` ve `maskable` ayrı girdiler olmalı: tek girdide birleştirmek
     ("any maskable") maskesiz yerde fazla boşluklu, maskeli yerde kesik
     görünüyor. */
  it("ayrı bir maskeli simge girdisi var", () => {
    const icons = value.icons ?? [];
    const maskable = icons.filter((icon) => icon.purpose === "maskable");
    const any = icons.filter((icon) => icon.purpose === "any");

    expect(maskable).toHaveLength(1);
    expect(maskable[0].sizes).toBe("512x512");
    expect(any.length).toBeGreaterThan(0);
    expect(icons.some((icon) => icon.purpose === "any maskable")).toBe(false);
  });

  it("512 piksellik simge var — Play bunu istiyor", () => {
    expect(value.icons?.some((icon) => icon.sizes === "512x512")).toBe(true);
  });
});

describe("Digital Asset Links", () => {
  const load = async (env: Record<string, string | undefined>) => {
    vi.resetModules();
    const previous = { ...process.env };
    // `process.env.X = undefined` ortama "undefined" DİZESİNİ yazıyor ve
    // modül onu dolu sayardı; silmek gerekiyor.
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    const { GET } = await import("@/app/api/assetlinks/route");
    const response = GET();
    const body = await response.json();
    process.env = previous;
    return { response, body };
  };

  /* 404 "sunucu bozuk mu, yol mu yanlış" sorusunu açık bırakıyor ve kurulum
     sırasında saatler yedirebiliyor; boş dizi geçerli bir cevap. */
  it("yapılandırma yokken boş dizi dönüyor", async () => {
    const { response, body } = await load({
      ANDROID_PACKAGE_NAME: undefined,
      ANDROID_CERT_FINGERPRINTS: undefined,
    });
    expect(response.status).toBe(200);
    expect(body).toEqual([]);
  });

  /* Play App Signing açıkken İKİ parmak izi oluyor ve en sık yapılan hata
     birini unutmak: biri yerel testi, diğeri mağazadan ineni imzalıyor. */
  it("virgülle ayrılmış birden çok parmak izini taşıyor", async () => {
    const { body } = await load({
      ANDROID_PACKAGE_NAME: "app.cortexplus.twa",
      ANDROID_CERT_FINGERPRINTS: "aa:bb , cc:dd",
    });
    expect(body).toHaveLength(1);
    expect(body[0].target.package_name).toBe("app.cortexplus.twa");
    expect(body[0].target.sha256_cert_fingerprints).toEqual(["AA:BB", "CC:DD"]);
  });

  it("Android'in beklediği ilişkiyi bildiriyor", async () => {
    const { body } = await load({
      ANDROID_PACKAGE_NAME: "app.cortexplus.twa",
      ANDROID_CERT_FINGERPRINTS: "aa:bb",
    });
    expect(body[0].relation).toEqual([
      "delegate_permission/common.handle_all_urls",
    ]);
    expect(body[0].target.namespace).toBe("android_app");
  });

  /* Parmak izi değiştiğinde eski cevabın günlerce takılı kalmaması için. */
  it("uzun önbellek koymuyor", async () => {
    const { response } = await load({
      ANDROID_PACKAGE_NAME: "app.cortexplus.twa",
      ANDROID_CERT_FINGERPRINTS: "aa:bb",
    });
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
  });
});

describe("yol bağlantısı", () => {
  /* Nokta ile başlayan klasör App Router'da yol olmuyor; yönlendirme
     kaldırılırsa doğrulama SESSİZCE bozulur ve kimse fark etmez. */
  it("well-known yolu api ucuna bağlı", () => {
    const config = readFileSync("next.config.ts", "utf8");
    expect(config).toContain('source: "/.well-known/assetlinks.json"');
    expect(config).toContain('destination: "/api/assetlinks"');
  });

  it("kurulum belgesi duruyor", () => {
    const doc = readFileSync(
      "../docs/delivery/MAGAZA-UYGULAMASI.md",
      "utf8",
    );
    expect(doc).toContain("App signing key certificate");
    expect(doc).toContain("Upload key certificate");
    expect(doc).toContain("ANDROID_CERT_FINGERPRINTS");
  });
});
