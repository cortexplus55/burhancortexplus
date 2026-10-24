import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { probeSchema } from "@/lib/admin/schema-probe";

/*
  18 Eylül 2026'da bu dal yayına çıktı ve "göç dosyaları uygulandı mı" sorusu
  DIŞARIDAN cevaplanamadı: sayfa açılıyor, sitemap 200, `/api/health` "ok"
  diyordu — ama `credit_reserve` eski imzada kalmışsa her kredi ayırma isteği
  düşüyor. En pahalı arıza, en sessiz görünen arızaydı.

  Bu projede göç dosyaları elle uygulanıyor, yani bir dosyanın atlanması
  gerçek bir olasılık. Yoklama onu sesli yapıyor.
*/

type Rows = Record<string, unknown>;

function service(options: { rpcError?: { message: string }; rows?: Rows; dailyAllowance?: unknown } = {}) {
  const rows = options.rows ?? {};
  // unverified_allowance(): 20261024123000'den sonra 0, v2'de 6. Varsayılan: göç uygulanmış.
  const daily = "dailyAllowance" in options ? options.dailyAllowance : 0;
  return {
    rpc: vi.fn(async (name: string) =>
      name === "unverified_allowance" ? { data: daily, error: null } : { error: options.rpcError ?? null },
    ),
    from: (table: string) => ({
      select: () => ({
        // credit_rules eylem koduna göre de verilebilir: { credit_rules: { AI_CHAT_STANDARD: {...} } }
        eq: (_column: string, value: string) => ({
          maybeSingle: () => {
            const row = rows[table] as Rows | undefined;
            const byCode = row && value in row ? (row[value] as Rows) : undefined;
            return Promise.resolve({ data: byCode ?? row ?? null });
          },
        }),
        limit: () =>
          Promise.resolve(
            table in rows ? { error: null } : { error: { message: "missing" } },
          ),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// Kredi sistemi v2 (8 Ekim 2026): fiyatlar price-table'dan. Kredi v3 (24 Ekim 2026): ders 30.
const v2Rules = {
  AUDIO_SYNTHESIZE: { credit_cost: 2 },
  PRACTICE_EXAM_GENERATE: { credit_cost: 15 },
  AI_CHAT_STANDARD: { credit_cost: 3 },
  PODCAST_GENERATE: { credit_cost: 12 },
  STUDY_PLAN_GENERATE: { credit_cost: 30 },
};

const healthyRows: Rows = {
  credit_rules: v2Rules,
  model_upgrade_grants: {},
  document_page_grants: {},
  referral_tiers: { multiplier: 10 },
  document_teacher_analyses: {},
  lesson_generation_failures: {},
  admin_free_preview: {},
  exam_prep_prefetch: {},
  exam_prep_podcasts: {},
  exam_prep_review_items: {},
  exam_prep_misconceptions: {},
  free_usage: {},
};

const healthy = () => service({ rows: healthyRows });

const find = (checks: Awaited<ReturnType<typeof probeSchema>>, part: string) =>
  checks.find((check) => check.name.includes(part))!;

describe("credit_reserve yoklaması", () => {
  /* Gerçek bir eylem kodu akışı cüzdan güncellemesine kadar götürürdü ve
     yazmamasını yalnızca `credit_reservations.user_id` üzerindeki yabancı
     anahtara borçlu olurduk. Bir yoklama tesadüfe dayanmamalı. */
  it("var olmayan bir eylem koduyla soruyor", async () => {
    const sb = healthy();
    await probeSchema(sb);
    expect(sb.rpc).toHaveBeenCalledWith("credit_reserve", {
      p_user_id: "00000000-0000-0000-0000-000000000000",
      p_action_code: "__schema_probe__",
      p_idempotency_key: "__schema_probe__",
      p_quantity: 1,
    });
  });

  it("PGRST202 eksik imza demek ve kritik", async () => {
    const checks = await probeSchema(
      service({
        rpcError: { message: "Could not find the function public.credit_reserve" },
        rows: { credit_rules: { credit_cost: 5 } },
      }),
    );
    const reserve = find(checks, "credit_reserve");
    expect(reserve.ok).toBe(false);
    expect(reserve.critical).toBe(true);
    expect(reserve.detail).toMatch(/HER kredi ayırma isteği düşüyor/);
  });

  /* `invalid_action` fonksiyonun ÇALIŞTIĞININ kanıtı — imza yerinde. */
  it("iş hatası imzanın varlığını kanıtlıyor", async () => {
    const checks = await probeSchema(
      service({
        rpcError: { message: "invalid_action" },
        rows: { credit_rules: { credit_cost: 5 } },
      }),
    );
    expect(find(checks, "credit_reserve").ok).toBe(true);
    expect(find(checks, "Ücretsiz sayaçlı ayırma").ok).toBe(true);
  });
});

/* İnceleme, 24 Ekim 2026: v3 satırı yalnız fiyata ve free_usage tablosuna bakıyordu. 20261024121000 yarım
   kalırsa (tablo ve yeni credit_reserve var, sayaç fonksiyonu yok) her satır yeşil görünürken ücretsiz
   hesabın her ayırması sessizce sayaçsız credit_reserve'e düşüyordu. */
describe("credit_reserve_metered yoklaması", () => {
  it("fonksiyonun kendisini, var olmayan eylem koduyla ve sayaçsız soruyor", async () => {
    const sb = healthy();
    await probeSchema(sb);
    expect(sb.rpc).toHaveBeenCalledWith("credit_reserve_metered", {
      p_user_id: "00000000-0000-0000-0000-000000000000",
      p_action_code: "__schema_probe__",
      p_idempotency_key: "schema-probe",
      p_quantity: 1,
      p_meter: null,
    });
  });

  it("fonksiyon yoksa kritik kırmızı; öteki satırlar yeşil kalsa da", async () => {
    const sb = healthy();
    sb.rpc = vi.fn(async (name: string) =>
      name === "credit_reserve_metered"
        ? { error: { code: "PGRST202", message: "Could not find the function public.credit_reserve_metered(p_action_code, p_idempotency_key, p_meter, p_quantity, p_user_id) in the schema cache" } }
        : name === "unverified_allowance"
          ? { data: 0, error: null }
          : { error: { message: "invalid_action" } },
    );
    const checks = await probeSchema(sb);
    const metered = find(checks, "Ücretsiz sayaçlı ayırma");
    expect(metered).toMatchObject({ ok: false, critical: true });
    expect(metered.detail).toContain("20261024121000");
    expect(metered.detail).toContain("sayaçsız credit_reserve");
    expect(find(checks, "credit_reserve miktar").ok).toBe(true);
    expect(find(checks, "Kredi v3").ok).toBe(true);
    expect(checks.filter((check) => !check.ok).map((check) => check.name)).toEqual(["Ücretsiz sayaçlı ayırma"]);
  });

  /* Sıfır kimlikte iş hatası (invalid_action, wallet_not_found…) fonksiyonun çalıştığını kanıtlar. */
  it("iş hatası fonksiyonun varlığını kanıtlıyor", async () => {
    for (const message of ["invalid_action", "wallet_not_found"]) {
      const sb = healthy();
      sb.rpc = vi.fn(async () => ({ error: { message } }));
      expect(find(await probeSchema(sb), "Ücretsiz sayaçlı ayırma").ok, message).toBe(true);
    }
  });
});

describe("diğer göç dosyaları", () => {
  it("hepsi yerindeyse hiçbir satır kırmızı değil", async () => {
    const checks = await probeSchema(healthy());
    expect(checks.every((check) => check.ok)).toBe(true);
    expect(checks).toHaveLength(17);
    // 24 Ekim 2026: ücretsiz sayaç fonksiyonu da soruluyor.
    expect(find(checks, "Ücretsiz sayaçlı ayırma")).toMatchObject({ ok: true, critical: true });
    // 20 Ekim 2026: sonuca göre yol fonksiyonu da soruluyor.
    expect(find(checks, "Sonuca göre yol").ok).toBe(true);
    // 20 Ekim 2026: podcast önbelleğinin dinleme kontrolü sütunu; eksikse kritik değil.
    expect(find(checks, "Dinleme kontrolü önbelleği").ok).toBe(true);
    expect(find(checks, "Aralıklı tekrar").ok).toBe(true);
    expect(find(checks, "Yanılgı çözümü").ok).toBe(true);
    expect(find(checks, "Öğretmen analizi").ok).toBe(true);
    expect(find(checks, "Kredi sistemi v2").detail).toBe("Mesaj 3, ders 30, podcast 12 kredi");
    expect(find(checks, "Kredi v3").detail).toContain("ücretsiz haftada 3 ders, günde 3 mesaj, 1 fotoğraf");
    expect(find(checks, "Kredi v3").detail).toContain("günlük kredi 0");
  });

  /* Yeniden inceleme #4: satır yalnız fiyata ve free_usage'a bakıyordu. 20261024120000 ile 20261024123000
     aynı çalıştırmada uygulanır; ikincisi düşerse v2 credit_reserve canlıda kalır (ücretsiz günde 6,
     davetliye 18, abonede çarpan, yeni cüzdan 50) ve satır yine yeşil görünürdü. */
  it("20261024123000 eksikse (günlük kredi 6) kritik kırmızı; fiyat ve free_usage yerinde olsa da", async () => {
    const sb = healthy();
    const healthyRpc = sb.rpc;
    sb.rpc = vi.fn(async (name: string, args?: unknown) =>
      name === "unverified_allowance" ? { data: 6, error: null } : healthyRpc(name, args),
    );
    const checks = await probeSchema(sb);
    const v3 = find(checks, "Kredi v3");
    expect(v3).toMatchObject({ ok: false, critical: true });
    expect(v3.detail).toContain("Ders 30 kredi");
    expect(v3.detail).not.toContain("free_usage yok");
    expect(v3.detail).toContain("günlük ücretsiz kredi 6 (0 olmalı: 20261024123000)");
    expect(checks.filter((check) => !check.ok).map((check) => check.name)).toEqual(["Kredi v3 ve ücretsiz sayaçlar"]);
  });

  it("günlük krediyi argümansız, salt okunur unverified_allowance() ile soruyor", async () => {
    const sb = healthy();
    await probeSchema(sb);
    expect(sb.rpc).toHaveBeenCalledWith("unverified_allowance");
  });

  /* Bilinmeyen durum yeşil sayılmaz: hata ya da boş cevap (Number(null) === 0 tuzağı). */
  it("günlük kredi okunamazsa ya da boş gelirse yeşil değil", async () => {
    for (const reply of [{ data: null, error: { message: "permission denied" } }, { data: null, error: null }, { data: "", error: null }]) {
      const sb = healthy();
      const healthyRpc = sb.rpc;
      sb.rpc = vi.fn(async (name: string, args?: unknown) => (name === "unverified_allowance" ? reply : healthyRpc(name, args)));
      const v3 = find(await probeSchema(sb), "Kredi v3");
      expect(v3.ok, JSON.stringify(reply)).toBe(false);
      expect(v3.detail).toContain("günlük ücretsiz kredi okunamadı");
    }
    // Sayı metin olarak gelirse de okunur.
    expect(find(await probeSchema(service({ rows: healthyRows, dailyAllowance: "0" })), "Kredi v3").ok).toBe(true);
  });

  /* 24 Ekim 2026: fiyat göçü ile sayaç göçü birlikte uygulanır. Yalnız biri uygulanırsa ücretsiz hesap
     hiçbir işi açamaz (günlük kredi 0 ama sayaç tablosu yok) ya da ders eski fiyatta kalır — kritik. */
  it("kredi v3 göçleri eksikse kritik; hangisinin eksik olduğu yazıyor", async () => {
    const oldPrice = await probeSchema(
      service({ rows: { credit_rules: { ...v2Rules, STUDY_PLAN_GENERATE: { credit_cost: 6 } }, free_usage: {} } }),
    );
    expect(find(oldPrice, "Kredi v3")).toMatchObject({ ok: false, critical: true });
    expect(find(oldPrice, "Kredi v3").detail).toContain("Ders 6 kredi");
    const noMeters = await probeSchema(service({ rows: { credit_rules: v2Rules } }));
    expect(find(noMeters, "Kredi v3")).toMatchObject({ ok: false, critical: true });
    expect(find(noMeters, "Kredi v3").detail).toContain("free_usage yok");
    expect(find(noMeters, "Kredi v3").detail).toContain("20261024121000");
    // Uygulama sırası satırda yazıyor: sayaç göçü koddan önce, fiyat ve sonraki göç koddan sonra.
    expect(find(noMeters, "Kredi v3").detail).toContain(
      "Sıra: 20261024121000 koddan önce; 20261024120000 ve 20261024123000 koddan sonra, tek çalıştırmada.",
    );
  });

  /* 8 Ekim 2026 denetimi: 102 göçten ikisi canlıda hiç uygulanmamıştı ve
     sistem sayfası ikisini de sormuyordu. */
  it("kredi sistemi v2 eksikse kritik; ders hatası tablosu ve iade fonksiyonu soruluyor", async () => {
    const checks = await probeSchema(
      service({
        rpcError: { message: "Could not find the function public.apply_payment_refund" },
        rows: { credit_rules: { AI_CHAT_STANDARD: { credit_cost: 1 } } },
      }),
    );
    expect(find(checks, "Kredi sistemi v2")).toMatchObject({ ok: false, critical: true });
    expect(find(checks, "Ders hatası kaydı").ok).toBe(false);
    expect(find(checks, "İade fonksiyonu").ok).toBe(false);
  });

  /* 20 Ekim 2026: resolved_at yoksa kod hepsini açık sayar (yanlışlıkla "Hazırsın" yok);
     eksik göç sistem sayfasında görünür ama kritik değil. */
  it("yanılgı çözümü sütunu yoksa kritik olmayan uyarı", async () => {
    const checks = await probeSchema(service({ rows: { credit_rules: v2Rules } }));
    const resolution = find(checks, "Yanılgı çözümü");
    expect(resolution).toMatchObject({ ok: false, critical: false });
    expect(resolution.detail).toContain("20261020170000");
    expect(resolution.detail).toContain("hepsi açık");
  });

  it("eksik tabloyu ve eski çarpanı yakalıyor", async () => {
    const checks = await probeSchema(
      service({ rows: { credit_rules: { credit_cost: 4 }, referral_tiers: { multiplier: 400 } } }),
    );
    expect(find(checks, "Fotoğraf sayfası sayacı").ok).toBe(false);
    expect(find(checks, "Zor soru tavanı").ok).toBe(false);
    // Günü gelen tekrar tablosu yoksa kırmızı ama kritik değil (göç koddan önce uygulanır).
    expect(find(checks, "Aralıklı tekrar")).toMatchObject({ ok: false, critical: false });
    expect(find(checks, "Deneme üretimi").ok).toBe(false);
    expect(find(checks, "Davet çarpanı").ok).toBe(false);
  });

  /* 20 Ekim 2026: dinleme kontrolü sütunu yoksa yalnız o satır kırmızı ve kritik değil — kod göçsüz
     çalışıyor, önbellekteki podcast kontrolsüz açılıyor. */
  it("dinleme kontrolü sütunu yoksa kritik olmayan kırmızı satır", async () => {
    const sb = healthy();
    const from = sb.from;
    sb.from = (table: string) =>
      table === "exam_prep_podcasts"
        ? { select: () => ({ limit: () => Promise.resolve({ error: { code: "42703", message: "column does not exist" } }) }) }
        : from(table);
    const check = find(await probeSchema(sb), "Dinleme kontrolü önbelleği");
    expect(check).toMatchObject({ ok: false, critical: false });
    expect(check.detail).toContain("20261020150000");
  });

  /* Ses kuralı yoksa seslendirme ücretsiz üretiliyor — ürün çalışıyor
     görünür ama para yolu açık kalır, o yüzden kritik. */
  it("ses kuralının eksikliği kritik sayılıyor", async () => {
    const checks = await probeSchema(service({ rows: {} }));
    expect(find(checks, "Seslendirme").critical).toBe(true);
    expect(find(checks, "Seslendirme").ok).toBe(false);
  });
});

describe("sağlık ucu", () => {
  const route = readFileSync("src/app/api/health/route.ts", "utf8");

  it("şema durumunu bildiriyor", () => {
    expect(route).toContain("schemaMatchesCode()");
    expect(route).toContain("schemaOk,");
  });

  /* Kritik bir eksik varsa uç "ok" dememeli — dün tam olarak bu yüzden
     yanlış güven verdi. */
  it("kritik eksikte ok demiyor", () => {
    expect(route).toContain("ok: !issue && schemaOk !== false");
  });

  /* Herkese açık bir uçta hangi tablonun eksik olduğunu söylemek gereksiz
     bilgi; "uyuşuyor / uyuşmuyor" sorunun tamamını cevaplıyor. */
  it("ayrıntı sızdırmıyor", () => {
    expect(route).not.toContain("probeSchema");
    expect(route).not.toContain("detail");
  });

  /* Herkese açık uçta her istekte altı sorgu atmak, ölçmek istediğimiz şeyi
     kendimiz bozmak olurdu. */
  it("sonucu kısa süre tutuyor", () => {
    const probe = readFileSync("src/lib/admin/schema-probe.ts", "utf8");
    expect(probe).toContain("CACHE_MS");
    expect(probe).toMatch(/Date\.now\(\) - cached\.at < CACHE_MS/);
  });

  /* Bir durum ekranının en kötü hâli yanlış bilgi vermesidir: service
     anahtarı yoksa "bozuk" değil "bilmiyorum" diyoruz. */
  it("ulaşamadığında yanlış alarm vermiyor", () => {
    const probe = readFileSync("src/lib/admin/schema-probe.ts", "utf8");
    expect(probe).toMatch(/return null;/);
  });
});

describe("yönetim paneli", () => {
  const page = readFileSync("src/app/admin/sistem/page.tsx", "utf8");

  it("şema tablosunu gösteriyor", () => {
    expect(page).toContain("probeSchema(service)");
    expect(page).toContain("Canlı şema");
  });

  it("kritik eksikte uyarı çıkarıyor", () => {
    expect(page).toContain("schemaCritical");
    expect(page).toMatch(/Şema koddan geride/);
  });
});

describe("kapı betiği aynı yoklamayı kullanıyor", () => {
  /* İki yerde iki farklı yoklama olsaydı biri er geç diğerinden ayrışır ve
     hangisine güvenileceği belirsizleşirdi. */
  it("betik de var olmayan eylem kodunu soruyor", () => {
    const script = readFileSync("scripts/acilis-kapisi.mjs", "utf8");
    expect(script).toContain('p_action_code: "__schema_probe__"');
  });
});
