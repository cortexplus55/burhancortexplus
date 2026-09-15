import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/*
  Kredi paketleri bir özellik değil, üç veri satırı: mekanizma zaten vardı.
  Ama içinde sessizce bedava premium dağıtan bir tuzak var ve bu testler onun
  bekçisi.

  `settle_paytr_callback` bir ödemenin abonelik mi kredi yüklemesi mi olduğuna
  şuna bakıyor:

      v_is_subscription := COALESCE(v_plan.is_premium, false)
        OR lower(COALESCE(v_plan.name, '')) LIKE ANY
           (ARRAY['%plus%', '%sigma%', '%premium%']);

  Yani paketin ADINDA "plus" geçse — ki pazarlama dili bunu çok ister,
  "Plus Kredi Paketi" gayet doğal görünür — 129 TL'lik bir ödeme abonelik
  sayılır ve öğrenci premium olur.
*/

const MIGRATION = "supabase/migrations/20260915090000_credit_packs.sql";
const CALLBACK = "supabase/migrations/20260906140000_atomic_paytr_callback.sql";

const sql = readFileSync(MIGRATION, "utf8");

/** Migration'daki VALUES satırlarından paketleri çıkar. */
function packRows() {
  const start = sql.indexOf("VALUES");
  const end = sql.indexOf("ON CONFLICT");
  const body = sql.slice(start, end);
  return [...body.matchAll(/\(\s*'([^']+)',\s*'([^']+)',\s*'[^']*',\s*(\d+),\s*(\d+),\s*(true|false)/g)].map(
    (m) => ({
      slug: m[1],
      name: m[2],
      kurus: Number(m[3]),
      credits: Number(m[4]),
      isPremium: m[5] === "true",
    }),
  );
}

describe("kredi paketleri", () => {
  const packs = packRows();

  it("üç paket tanımlı", () => {
    expect(packs).toHaveLength(3);
  });

  /* Tuzağın kendisi. */
  it("hiçbir paket adı abonelik gibi okunmuyor", () => {
    for (const pack of packs) {
      const name = pack.name.toLocaleLowerCase("tr");
      expect(name).not.toContain("plus");
      expect(name).not.toContain("sigma");
      expect(name).not.toContain("premium");
    }
  });

  it("hiçbir paket premium açmıyor", () => {
    for (const pack of packs) {
      expect(pack.isPremium).toBe(false);
    }
  });

  it("geri çağrının kararı hâlâ bu üç kelimeye bakıyor", () => {
    // Kural değişirse yukarıdaki testler anlamını yitirir; o zaman bu test
    // kızarsın ve buradaki gerekçe yeniden okunsun.
    const callback = readFileSync(CALLBACK, "utf8");
    expect(callback).toContain("'%plus%', '%sigma%', '%premium%'");
  });

  it("her paket tek seferlik", () => {
    const values = sql.slice(sql.indexOf("VALUES"), sql.indexOf("ON CONFLICT"));
    expect((values.match(/'one_time'/g) ?? [])).toHaveLength(3);
  });

  it("her paket kredi veriyor", () => {
    for (const pack of packs) expect(pack.credits).toBeGreaterThan(0);
  });
});

describe("paket fiyatlandırması", () => {
  const packs = packRows();
  /* Bugünkü satış: Plus 400 kredi / 599 TL. */
  const SUBSCRIPTION_PER_CREDIT = 59900 / 400;

  /*
    Paket kredisi abonelikten PAHALI olmak zorunda. Ucuz olsaydı kimse abone
    olmaz, herkes paket alırdı; paketin işi aboneliği ikame etmek değil.
  */
  it("her paket abonelik biriminden pahalı", () => {
    for (const pack of packs) {
      expect(pack.kurus / pack.credits).toBeGreaterThan(SUBSCRIPTION_PER_CREDIT);
    }
  });

  it("paket büyüdükçe kredi ucuzluyor", () => {
    const byCredits = [...packs].sort((a, b) => a.credits - b.credits);
    const unit = byCredits.map((p) => p.kurus / p.credits);
    for (let i = 1; i < unit.length; i += 1) {
      expect(unit[i]).toBeLessThan(unit[i - 1]);
    }
  });

  /*
    400 krediye bakan ücretsiz kullanıcının doğru cevabı paket değil abonelik.
    En büyük paket bilerek bir aylık Plus'tan pahalı.
  */
  it("en büyük paket bir aylık abonelikten pahalı", () => {
    const biggest = packs.reduce((a, b) => (a.credits > b.credits ? a : b));
    expect(biggest.kurus).toBeGreaterThan(59900);
  });
});
