import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { billingPeriodOf, planPeriodDays } from "@/lib/payments/subscription";
import { periodLabel, quotaView, type WalletPeriod } from "@/lib/credits/period";

const MIGRATION = path.resolve(
  __dirname,
  "../../supabase/migrations/20260914130000_weekly_plan.sql",
);
const sql = () => readFileSync(MIGRATION, "utf8");

/*
  Haftalık Plus paketi — 349 TL, 150 kredi, 7 gün (ürün sahibi kararı).

  Buradaki testler üç somut tuzağı tutuyor:

  1. Dönem kısıtı. `plans_billing_period_check` haftalığı kabul etmezse
     migration'ın kendisi patlar.
  2. Kota penceresi. Önceki `credit_reserve` her abonede pencereyi 30 güne
     sabitliyordu; haftalık abone ödediği haftadan sonra da hak sahibi
     görünürdü.
  3. Ekranda "Aylık limit" yazması. Haftalık abonenin hakkı 7 günde bir
     yenileniyor, aylık demek yanlış bilgi vermek olurdu.
*/
describe("haftalık plan migration'ı", () => {
  it("billing_period kısıtı haftalığı kabul ediyor", () => {
    expect(sql()).toMatch(/CHECK \(billing_period IN \([^)]*'weekly'/);
  });

  it("paket 349 TL ve 150 kredi, 7 gün", () => {
    const s = sql();
    expect(s).toMatch(/'plus-haftalik'/);
    expect(s).toMatch(/34900/); // kuruş
    expect(s).toMatch(/'weekly', 'plus', 7, 150/);
  });

  it("kota penceresi haftalıkta 7, ötekilerde 30 gün", () => {
    const s = sql();
    expect(s).toMatch(/v_window := CASE WHEN v_plan_period = 'weekly' THEN 7 ELSE 30 END/);
    expect(s).toMatch(/v_kind := CASE WHEN v_plan_period = 'weekly' THEN 'weekly' ELSE 'monthly' END/);
  });

  it("SECURITY DEFINER fonksiyonun arama yolu yeniden sabitleniyor", () => {
    // CREATE OR REPLACE bunu korumuyor; düşerse yetki yükseltme riski doğar.
    expect(sql()).toMatch(/ALTER FUNCTION public\.credit_reserve[^;]*SET search_path/);
  });
});

describe("haftalık dönem kodda", () => {
  const weeklyPlan = { billing_period: "weekly", period_days: 7, is_premium: true };

  it("dönem türü olarak tanınıyor", () => {
    expect(billingPeriodOf(weeklyPlan)).toBe("weekly");
  });

  it("bir ödeme 7 gün açıyor", () => {
    expect(planPeriodDays(weeklyPlan)).toBe(7);
    // period_days yazılmamış olsa da dönemden türetiliyor.
    expect(planPeriodDays({ billing_period: "weekly", is_premium: true })).toBe(7);
  });

  it("ekranda 'Haftalık limit' yazıyor, aylık değil", () => {
    expect(periodLabel("weekly")).toBe("Haftalık limit");
    expect(periodLabel("monthly")).toBe("Aylık limit");
    expect(periodLabel("daily")).toBe("Günlük limit");
  });

  it("cüzdanın haftalık dönemi ekrana haftalık olarak geçiyor", () => {
    const wallet: WalletPeriod = {
      free_allowance_remaining: 90,
      period_allowance: 150,
      period_ends_at: "2026-09-21T00:00:00.000Z",
      period_kind: "weekly",
    };
    const view = quotaView(wallet, true, new Date("2026-09-16T10:00:00.000Z"));
    expect(view.kind).toBe("weekly");
    expect(view.allowance).toBe(150);
    expect(view.remaining).toBe(90);
    expect(view.usedPercent).toBe(40);
  });
});
