import { describe, expect, it } from "vitest";
import { periodLabel, quotaView, type WalletPeriod } from "@/lib/credits/period";

const NOW = new Date("2026-09-03T10:00:00.000Z");

function wallet(over: Partial<WalletPeriod> = {}): WalletPeriod {
  return {
    free_allowance_remaining: 4,
    period_allowance: 6,
    period_ends_at: "2026-09-04T00:00:00.000Z",
    period_kind: "daily",
    ...over,
  };
}

describe("quotaView", () => {
  it("dönem içindeyken kullanılan yüzdeyi hesaplar", () => {
    const view = quotaView(wallet(), false, NOW);
    expect(view.remaining).toBe(4);
    expect(view.allowance).toBe(6);
    expect(view.usedPercent).toBe(33); // 2/6
    expect(view.pendingRefill).toBe(false);
  });

  it("bütçe bittiğinde %100 gösterir", () => {
    const view = quotaView(wallet({ free_allowance_remaining: 0 }), false, NOW);
    expect(view.usedPercent).toBe(100);
    expect(view.remaining).toBe(0);
  });

  // Yenileme credit_reserve içinde tembel çalışıyor: dün kotasını bitiren
  // kullanıcı bugün sayfayı açtığında veritabanında hâlâ 0 yazıyor. Arayüz
  // bunu göstermemeli, yoksa "kotam yenilenmemiş" sanır.
  it("dönem dolmuşsa yenilenmiş hâli gösterir", () => {
    const view = quotaView(
      wallet({
        free_allowance_remaining: 0,
        period_ends_at: "2026-09-03T00:00:00.000Z",
      }),
      false,
      NOW,
    );
    expect(view.pendingRefill).toBe(true);
    expect(view.remaining).toBe(6);
    expect(view.usedPercent).toBe(0);
    expect(view.resetsAt.toISOString()).toBe("2026-09-04T00:00:00.000Z");
  });

  it("abone için aylık bütçe kullanır", () => {
    const view = quotaView(
      wallet({
        period_allowance: 400,
        free_allowance_remaining: 300,
        period_kind: "monthly",
      }),
      true,
      NOW,
    );
    expect(view.allowance).toBe(400);
    expect(view.usedPercent).toBe(25);
    expect(view.kind).toBe("monthly");
  });

  it("cüzdan yoksa katmana göre varsayılan verir", () => {
    expect(quotaView(null, false, NOW).allowance).toBe(6);
    expect(quotaView(null, true, NOW).allowance).toBe(400);
  });

  it("sıfırlama anı UTC gün başına denk gelir", () => {
    const view = quotaView(null, false, NOW);
    expect(view.resetsAt.toISOString()).toBe("2026-09-04T00:00:00.000Z");
  });

  it("bozuk tarihte çökmez, yenilemeye düşer", () => {
    const view = quotaView(wallet({ period_ends_at: "gecersiz" }), false, NOW);
    expect(view.pendingRefill).toBe(true);
    expect(view.remaining).toBe(6);
  });

  it("kalan bütçeyi tavanla sınırlar", () => {
    // Eski satırlarda free_allowance_remaining 50, period_allowance 6 olabilir.
    const view = quotaView(wallet({ free_allowance_remaining: 50 }), false, NOW);
    expect(view.remaining).toBe(6);
    expect(view.usedPercent).toBe(0);
  });

  it("etiketleri döndürür", () => {
    expect(periodLabel("daily")).toBe("Günlük limit");
    expect(periodLabel("monthly")).toBe("Aylık limit");
  });
});
