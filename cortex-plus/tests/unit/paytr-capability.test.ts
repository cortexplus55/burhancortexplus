import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import {
  AUTO_RENEW_SUPPORTED,
  RECURRING_BLOCKERS,
  probePaytrRecurring,
  readProbeResponse,
} from "@/lib/payments/paytr-capability";

/*
  "Yetki alındı sanıyorum" ile "yetki var" arasındaki farkı kapatan yoklama.

  Otomatik yenileme için PayTR'de üç şey şart: Non3D işlem yetkisi, kart
  saklama (utoken/ctoken) ve Direkt API. Biz iFrame API kullanıyoruz ve PayTR
  dokümanı tekrarlayan ödemenin Direkt API'ye özgü olduğunu söylüyor.

  Yanlış okumanın bedeli somut: yetkinin olduğu sanılıp otomatik yenileme
  açılırsa abonelik sessizce biter ve sözleşmede vaat edilen tahsilat hiç
  olmaz. O yüzden belirsizlik "var" diye değil "belirlenemedi" diye okunuyor.
*/

afterEach(() => {
  vi.unstubAllEnvs();
});

const KEYS = {
  PAYTR_MERCHANT_ID: "123456",
  PAYTR_MERCHANT_KEY: "key",
  PAYTR_MERCHANT_SALT: "salt",
};

describe("readProbeResponse", () => {
  it("yetki hatasını kapalı okuyor", () => {
    for (const body of [
      '{"status":"failed","err_msg":"Bu islem icin yetkiniz bulunmamaktadir"}',
      '{"status":"failed","err_msg":"Not authorized for this service"}',
      '{"err_msg":"izin yok"}',
    ]) {
      const out = readProbeResponse(200, body);
      expect(out.recurring).toBe("unavailable");
      expect(out.detail).toContain("Non3D");
    }
  });

  it("geçerli yanıtı açık okuyor", () => {
    const out = readProbeResponse(200, '{"status":"success","cards":[]}');
    expect(out.recurring).toBe("available");
  });

  /*
    Kayıt bulunmadığında PayTR boş JSON dönüyor ve bu ARADIĞIMIZ sinyal:
    sorgu işlendi demek, yani servis bu mağazaya açık.
  */
  it("kayıt yok yanıtı açık okuyor", () => {
    expect(readProbeResponse(200, "{}").recurring).toBe("available");
    expect(readProbeResponse(200, "[]").recurring).toBe("available");
    expect(readProbeResponse(200, '[{"ctoken":"x","last_4":"1234"}]').recurring).toBe(
      "available",
    );
  });

  /*
    EN ÖNEMLİ TEST. PayTR hata cevabı da JSON ve içinde "status" geçiyor:
    `{"status":"error","err_msg":"..."}`. Kelimeye bakan bir okuma bunu
    BAŞARI sanıyordu — yani imza hatası "yetki var" diye okunuyordu ve
    tam olarak önlenmeye çalışılan hata üretiliyordu.

    Bu satır 17 Eylül 2026'da gerçek bir hatadan geliyor: yoklamanın ilk
    hâli hash formülünü yanlış kuruyordu (merchant_id ekliyordu) ve PayTR
    her seferinde imza hatası dönecekti. Sonuç: yetki yokken "açık".
  */
  it("hata cevabı açık sayılmıyor", () => {
    for (const body of [
      '{"status":"error","err_msg":"paytr_token degeri hatali"}',
      '{"status":"error","err_msg":"magaza bulunamadi"}',
      '{"status":"error"}',
    ]) {
      const out = readProbeResponse(200, body);
      expect(out.recurring).not.toBe("available");
      expect(out.detail).toContain("reddetti");
    }
  });

  /*
    Belirsizlik ASLA "açık" sayılmıyor. Bu testin tek işi o: tanınmayan bir
    yanıtı iyimser okumak, tam olarak önlenmeye çalışılan hatayı üretir.
  */
  it("tanınmayan yanıt açık sayılmıyor", () => {
    for (const [status, body] of [
      [500, "Internal Server Error"],
      [200, "<html>bakim</html>"],
      [403, ""],
      [200, ""],
    ] as [number, string][]) {
      expect(readProbeResponse(status, body).recurring).not.toBe("available");
    }
  });

  it("yorumlanamayan yanıtta elle doğrulama isteniyor", () => {
    expect(readProbeResponse(500, "bakim").detail).toContain("elle");
  });
});

describe("probePaytrRecurring", () => {
  it("anahtar yoksa sormuyor", async () => {
    vi.stubEnv("PAYTR_MERCHANT_ID", "");
    vi.stubEnv("PAYTR_MERCHANT_KEY", "");
    vi.stubEnv("PAYTR_MERCHANT_SALT", "");
    const called = vi.fn();
    const out = await probePaytrRecurring(called as unknown as typeof fetch);
    expect(out.configured).toBe(false);
    expect(out.recurring).toBe("unknown");
    expect(called).not.toHaveBeenCalled();
  });

  it("ağ hatası açık sayılmıyor", async () => {
    for (const [k, v] of Object.entries(KEYS)) vi.stubEnv(k, v);
    const failing = (() => Promise.reject(new Error("ECONNRESET"))) as unknown as typeof fetch;
    const out = await probePaytrRecurring(failing);
    expect(out.recurring).toBe("unknown");
    expect(out.detail).toContain("ulaşılamadı");
  });

  /* Yoklama okuma amaçlı; para hareketi yapmamalı. */
  it("yalnızca kart listesi soruyor, ödeme başlatmıyor", async () => {
    for (const [k, v] of Object.entries(KEYS)) vi.stubEnv(k, v);
    let seenUrl = "";
    const spy = ((url: string, init?: RequestInit) => {
      seenUrl = String(url);
      expect(init?.method).toBe("POST");
      return Promise.resolve(new Response('{"status":"success"}', { status: 200 }));
    }) as unknown as typeof fetch;
    await probePaytrRecurring(spy);
    expect(seenUrl).toContain("/capi/list");
    expect(seenUrl).not.toContain("odeme/guvenli");
  });

  it("merchant anahtarı istekte düz metin gitmiyor", async () => {
    for (const [k, v] of Object.entries(KEYS)) vi.stubEnv(k, v);
    let body = "";
    const spy = ((_url: string, init?: RequestInit) => {
      body = String(init?.body ?? "");
      return Promise.resolve(new Response('{"status":"success"}', { status: 200 }));
    }) as unknown as typeof fetch;
    await probePaytrRecurring(spy);
    // Gönderilen şey imza; anahtarın kendisi değil.
    expect(body).not.toContain(KEYS.PAYTR_MERCHANT_KEY);
    expect(body).not.toContain(KEYS.PAYTR_MERCHANT_SALT);
    expect(body).toContain("paytr_token=");
  });

  /*
    İmza formülü PayTR dokümanından: hash_str = utoken + merchant_salt.
    merchant_id EKLENMEZ.

    Bu test yoklamanın doğru soruyu sorduğunu tutuyor. Formül yanlışsa PayTR
    her istekte imza hatası döner ve yoklama hiçbir zaman gerçek cevabı
    öğrenmez — üstelik hata cevabı iyimser okunursa "yetki var" der.
  */
  it("imza formülü PayTR dokümanıyla aynı", async () => {
    for (const [k, v] of Object.entries(KEYS)) vi.stubEnv(k, v);
    let body = "";
    const spy = ((_url: string, init?: RequestInit) => {
      body = String(init?.body ?? "");
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as unknown as typeof fetch;
    await probePaytrRecurring(spy);

    const params = new URLSearchParams(body);
    const utoken = params.get("utoken") ?? "";
    const expected = crypto
      .createHmac("sha256", KEYS.PAYTR_MERCHANT_KEY)
      .update(`${utoken}${KEYS.PAYTR_MERCHANT_SALT}`)
      .digest("base64");
    expect(params.get("paytr_token")).toBe(expected);

    const wrong = crypto
      .createHmac("sha256", KEYS.PAYTR_MERCHANT_KEY)
      .update(`${KEYS.PAYTR_MERCHANT_ID}${utoken}${KEYS.PAYTR_MERCHANT_SALT}`)
      .digest("base64");
    expect(params.get("paytr_token")).not.toBe(wrong);
  });
});

/*
  Yetki tek başına yetmiyor: entegrasyonun kendisi de taşımalı.

  PayTR dokümanı (17 Eylül 2026) kart saklamayı yalnızca Direkt API altında
  tanımlıyor; iFrame API'nin store_card parametresi yok. Yani "yetki alındı"
  ile "otomatik yenileme çalışır" aynı şey değil ve bu ayrımın kodda yazılı
  durması gerekiyor — yoksa yetki geldiğinde açılabileceği sanılır.
*/
describe("otomatik yenileme engelleri", () => {
  it("engel listesi boş değil ve her maddesi gerekçeli", () => {
    expect(RECURRING_BLOCKERS.length).toBeGreaterThan(2);
    for (const blocker of RECURRING_BLOCKERS) {
      expect(blocker.title.trim().length).toBeGreaterThan(5);
      expect(blocker.detail.trim().length).toBeGreaterThan(30);
    }
  });

  it("engeller dururken otomatik yenileme desteklenmiyor sayılıyor", () => {
    expect(AUTO_RENEW_SUPPORTED).toBe(RECURRING_BLOCKERS.length === 0);
  });

  /*
    Sözleşme metniyle bağ. Otomatik yenileme desteklenmiyorsa metin bunu
    söylemeye devam etmeli: sözleşmede söz verilip üründe yapılmayan şey,
    hiç söz vermemekten kötü.
  */
  it("desteklenmiyorken sözleşme otomatik yenileme sözü vermiyor", () => {
    const texts = readFileSync("src/lib/legal/texts.ts", "utf8");
    if (!AUTO_RENEW_SUPPORTED) {
      expect(texts).toContain("otomatik olarak yenilenmez");
    }
  });

  it("engeller yönetim panelinde görünüyor", () => {
    const page = readFileSync("src/app/admin/sistem/page.tsx", "utf8");
    expect(page).toContain("RECURRING_BLOCKERS");
  });

  /*
    Öğrenciye gösterilen yazı da aynı gerçeği söylemeli. Otomatik yenileme
    yokken "Yenilemeyi durdur" butonu, hemen üstündeki "Yenileme otomatik
    değil" satırıyla çelişiyordu: öğrenci gelmeyecek bir tahsilatı durdurmaya
    çalışıyordu.
  */
  it("abonelik kartı otomatik yenileme varmış gibi konuşmuyor", () => {
    const card = readFileSync("src/components/billing/subscription-card.tsx", "utf8");
    // Yazı duruma bağlı: koşulsuz bir "Yenilemeyi durdur" kalmamalı.
    expect(card).toContain("sub.autoRenew");
    expect(card).toContain("Yenilemeyeceğim");
  });

  /*
    Direkt API'ye geçilmediği kodla doğrulanıyor: kart numarası/CVV kendi
    sunucumuzdan geçmiyor. Bu bir güvenlik sınırı, yorum değil.
  */
  it("kart verisi hiçbir yerde bizim sunucumuzdan geçmiyor", () => {
    const paytr = readFileSync("src/lib/payments/paytr.ts", "utf8");
    for (const field of ["cc_owner", "card_number", "expiry_month", "cvv"]) {
      expect(paytr).not.toContain(field);
    }
  });
});

describe("yönetim paneli yetkiyi gösteriyor", () => {
  const page = readFileSync("src/app/admin/sistem/page.tsx", "utf8");

  it("yoklama panelde çağrılıyor", () => {
    expect(page).toContain("probePaytrRecurring");
  });

  it("üç durumun hepsi ayrı gösteriliyor", () => {
    expect(page).toContain('"available"');
    expect(page).toContain('"unavailable"');
    expect(page).toContain("belirlenemedi");
  });
});
