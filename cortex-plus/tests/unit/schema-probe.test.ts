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

function service(options: { rpcError?: { message: string }; rows?: Rows } = {}) {
  const rows = options.rows ?? {};
  return {
    rpc: vi.fn().mockResolvedValue({ error: options.rpcError ?? null }),
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: rows[table] ?? null }),
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

const healthy = () =>
  service({
    rows: {
      credit_rules: { credit_cost: 5 },
      model_upgrade_grants: {},
      document_page_grants: {},
      referral_tiers: { multiplier: 10 },
    },
  });

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
  });
});

describe("diğer göç dosyaları", () => {
  it("hepsi yerindeyse hiçbir satır kırmızı değil", async () => {
    const checks = await probeSchema(healthy());
    expect(checks.every((check) => check.ok)).toBe(true);
    expect(checks).toHaveLength(6);
  });

  it("eksik tabloyu ve eski çarpanı yakalıyor", async () => {
    const checks = await probeSchema(
      service({ rows: { credit_rules: { credit_cost: 4 }, referral_tiers: { multiplier: 400 } } }),
    );
    expect(find(checks, "Fotoğraf sayfası sayacı").ok).toBe(false);
    expect(find(checks, "Zor soru tavanı").ok).toBe(false);
    expect(find(checks, "Deneme üretimi").ok).toBe(false);
    expect(find(checks, "Davet çarpanı").ok).toBe(false);
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
