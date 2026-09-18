import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { isPaytrConfigured, paytrConfig, paytrMode } from "@/lib/payments/paytr";

/*
  Bu testler sessiz bir hatanın bekçisi.

  `isPaytrConfigured()` yalnızca üç anahtarın dolu olup olmadığına bakıyor.
  Anahtarlar girildiği an yönetim panelinde "PayTR: Tanımlı" yazıyor ve fiyat
  sayfasındaki buton "Yakında"dan "Satın al"a dönüyor. Ama PAYTR_TEST_MODE
  varsayılanı "1": ödeme akışı baştan sona çalışıyor, krediler bile
  yükleniyor, yalnızca PARA GELMİYOR.

  Yani kurulumu yapan kişi ödeme almaya başladığını sanıyor. Varsayılanın
  test olması doğru — canlıya geçmek açık bir karar olmalı, kaza olmamalı.
  Eksik olan şey o kararın GÖRÜNMESİYDİ.
*/

const KEYS = {
  PAYTR_MERCHANT_ID: "123456",
  PAYTR_MERCHANT_KEY: "key",
  PAYTR_MERCHANT_SALT: "salt",
};

function withEnv(vars: Record<string, string>) {
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("paytrMode", () => {
  it("anahtar yoksa kurulmamış", () => {
    withEnv({ PAYTR_MERCHANT_ID: "", PAYTR_MERCHANT_KEY: "", PAYTR_MERCHANT_SALT: "" });
    expect(paytrMode()).toBe("unconfigured");
    expect(isPaytrConfigured()).toBe(false);
  });

  it("eksik tek anahtar da kurulmamış sayılıyor", () => {
    withEnv({ ...KEYS, PAYTR_MERCHANT_SALT: "" });
    expect(paytrMode()).toBe("unconfigured");
  });

  /* Asıl mesele: anahtarlar tam ama kip test. */
  it("anahtarlar tam, TEST_MODE tanımsız → test kipi", () => {
    withEnv({ ...KEYS, PAYTR_TEST_MODE: "" });
    expect(isPaytrConfigured()).toBe(true);
    expect(paytrMode()).toBe("test");
  });

  it("TEST_MODE=1 → test kipi", () => {
    withEnv({ ...KEYS, PAYTR_TEST_MODE: "1" });
    expect(paytrMode()).toBe("test");
  });

  it("canlıya geçmek için AÇIKÇA sıfır gerekiyor", () => {
    withEnv({ ...KEYS, PAYTR_TEST_MODE: "0" });
    expect(paytrMode()).toBe("live");
  });

  /*
    "true", "false", "canlı" gibi değerler canlıya geçirmemeli: PayTR'nin
    beklediği değer "0" ve başka her şey test olarak gidiyor. Kip kararı
    PayTR'ye gönderilen değerle aynı olmalı, yoksa panel canlı der, PayTR
    test çalıştırır.
  */
  it("beklenmeyen değerler canlıya geçirmiyor", () => {
    for (const v of ["true", "false", "live", "canlı", "00", "0.0"]) {
      withEnv({ ...KEYS, PAYTR_TEST_MODE: v });
      expect(paytrMode()).toBe("test");
      expect(paytrConfig().testMode).not.toBe("0");
    }
  });

  /*
    Baştaki/sondaki boşluk bağışlanıyor. Vercel'e " 0" yazan kişi canlıya
    geçmek istemiştir; bir boşluk yüzünden onu sessizce test kipinde tutmak,
    tam olarak bu dosyanın önlemeye çalıştığı hatanın kendisi olurdu.
  */
  it("boşluklu 0 da canlı sayılıyor", () => {
    for (const v of [" 0", "0 ", " 0 "]) {
      withEnv({ ...KEYS, PAYTR_TEST_MODE: v });
      expect(paytrMode()).toBe("live");
    }
  });
});

describe("debug varsayılanı", () => {
  it("üretimde kapalı", () => {
    withEnv({ ...KEYS, NODE_ENV: "production", PAYTR_DEBUG_ON: "" });
    expect(paytrConfig().debugOn).toBe("0");
  });

  it("açıkça set edilirse o kazanıyor", () => {
    withEnv({ ...KEYS, NODE_ENV: "production", PAYTR_DEBUG_ON: "1" });
    expect(paytrConfig().debugOn).toBe("1");
  });
});

describe("yönetim paneli kipi gösteriyor", () => {
  const page = readFileSync("src/app/admin/sistem/page.tsx", "utf8");

  it("test kipi uyarısı var ve paranın çekilmediğini söylüyor", () => {
    expect(page).toContain('mode === "test"');
    expect(page).toContain("gerçek para çekilmiyor");
  });

  it("canlıya geçme yolunu yazıyor", () => {
    expect(page).toContain("PAYTR_TEST_MODE=0");
  });

  it("canlı kip de ayrıca belirtiliyor", () => {
    expect(page).toContain('mode === "live"');
  });
});

/*
  PayTR'nin geri çağrısı KİMLİKSİZ geliyor. Middleware onu /giris'e
  yönlendirirse ödemeler hiç işlenmez ve para çekilmiş ama kredi yüklenmemiş
  kullanıcılar oluşur.
*/
describe("geri çağrı erişilebilir kalıyor", () => {
  it("middleware callback ucunu muaf tutuyor", () => {
    const mw = readFileSync("src/middleware.ts", "utf8");
    expect(mw).toContain("api/payments/paytr/callback");
  });

  it("geri çağrı hash doğrulaması yapıyor", () => {
    const route = readFileSync(
      "src/app/api/payments/paytr/callback/route.ts",
      "utf8",
    );
    expect(route).toContain("verifyPaytrCallbackHash");
    // Doğrulama başarısızsa istek reddedilmeli.
    expect(route).toContain("return INVALID()");
  });
});
