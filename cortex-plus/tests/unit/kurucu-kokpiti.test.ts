import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cockpitWindows,
  conversionStats,
  countByWindow,
  distinctByWindow,
  istanbulDayStartIso,
  marginPct,
  quarantineRow,
  readUsdTry,
  reportRow,
  spendKurus,
  type PaymentRow,
} from "@/lib/admin/cockpit-math";
import { ADMIN_NAV } from "@/lib/admin/nav";

/*
  Kurucu kokpiti (5 Kasım 2026): saf hesapların bekçisi. Pencereler Türkiye günüyle; dönüşüm = başarılı ödeme;
  "ilk kez ödeyen" daha önce ödemişse sayılmaz; velime ödeme linki ödeyen ≠ yararlanan ile tanınır; marj kur yoksa yok.
*/

describe("zaman pencereleri (Türkiye günü, UTC+3)", () => {
  it("gece yarısından önce ve sonra aynı Türkiye gününe düşer", () => {
    // 5 Kasım 23:30 Türkiye = 20:30Z → gün başı 4 Kasım 21:00Z
    expect(istanbulDayStartIso(new Date("2026-11-05T20:30:00Z"))).toBe("2026-11-04T21:00:00.000Z");
    // 6 Kasım 01:30 Türkiye = 5 Kasım 22:30Z → gün başı 5 Kasım 21:00Z
    expect(istanbulDayStartIso(new Date("2026-11-05T22:30:00Z"))).toBe("2026-11-05T21:00:00.000Z");
  });
  it("hafta 7, ay 30 Türkiye günüdür", () => {
    const windows = cockpitWindows(new Date("2026-11-05T10:00:00Z"));
    expect(windows.today).toBe("2026-11-04T21:00:00.000Z");
    expect(windows.week).toBe("2026-10-29T21:00:00.000Z");
    expect(windows.month).toBe("2026-10-06T21:00:00.000Z");
  });
});

describe("sayımlar", () => {
  const windows = cockpitWindows(new Date("2026-11-05T10:00:00Z"));
  it("pencere başına sayar; bozuk damga sayılmaz", () => {
    const stamps = ["2026-11-05T05:00:00Z", "2026-11-01T05:00:00Z", "2026-10-10T05:00:00Z", "2026-09-01T05:00:00Z", null, "x"];
    expect(countByWindow(stamps, windows)).toEqual({ today: 1, week: 2, month: 3 });
  });
  it("farklı kimlik sayar", () => {
    const rows = [
      { id: "a", at: "2026-11-05T05:00:00Z" },
      { id: "a", at: "2026-11-05T06:00:00Z" },
      { id: "b", at: "2026-11-02T05:00:00Z" },
    ];
    expect(distinctByWindow(rows, windows)).toEqual({ today: 1, week: 2, month: 2 });
  });
});

describe("dönüşüm", () => {
  const windows = cockpitWindows(new Date("2026-11-05T10:00:00Z"));
  const plans = [
    { id: "p1", slug: "plus-aylik", name: "Plus Aylık" },
    { id: "p2", slug: "plus-haftalik", name: "Plus Haftalık" },
  ];
  const payment = (over: Partial<PaymentRow>): PaymentRow => ({
    user_id: "u1",
    beneficiary_user_id: null,
    plan_id: "p1",
    amount_try: 29900,
    status: "paid",
    created_at: "2026-11-05T06:00:00Z",
    ...over,
  });
  it("başarılı ödeme, gelir, plan dağılımı, ilk kez ödeyen ve veli linki ayrı sayılır", () => {
    const stats = conversionStats(
      [
        payment({}),
        payment({ user_id: "u2", plan_id: "p2", amount_try: 9900, created_at: "2026-11-03T06:00:00Z" }),
        payment({ user_id: "veli", beneficiary_user_id: "u3", created_at: "2026-10-20T06:00:00Z" }),
        payment({ user_id: "u4", status: "failed" }),
        payment({ user_id: "eski", created_at: "2026-11-04T06:00:00Z" }),
      ],
      plans,
      new Set(["eski"]),
      windows,
    );
    expect(stats.paid).toEqual({ today: 1, week: 3, month: 4 });
    expect(stats.revenueKurus).toEqual({ today: 29900, week: 29900 + 9900 + 29900, month: 29900 * 3 + 9900 });
    expect(stats.firstTime).toEqual({ today: 1, week: 2, month: 3 });
    expect(stats.parentLink).toEqual({ today: 0, week: 0, month: 1 });
    expect(stats.byPlan.map((row) => [row.label, row.counts.month])).toEqual([
      ["Plus (aylık)", 3],
      ["Sınav Haftası (haftalık Plus)", 1],
    ]);
  });
  it("aynı öğrencinin ikinci ödemesi ilk kez sayılmaz", () => {
    const stats = conversionStats([payment({ created_at: "2026-10-20T06:00:00Z" }), payment({})], plans, new Set(), windows);
    expect(stats.firstTime).toEqual({ today: 0, week: 0, month: 1 });
  });
});

describe("birim ekonomisi", () => {
  it("marj kurla hesaplanır; kur ya da gelir yoksa null", () => {
    expect(marginPct(100_000, 10, 40)).toBe(60); // 1000 TL gelir, 400 TL gider
    expect(marginPct(100_000, 10, null)).toBeNull();
    expect(marginPct(0, 10, 40)).toBeNull();
    expect(marginPct(100_000, null, 40)).toBeNull();
    expect(spendKurus(10, 40)).toBe(40_000);
    expect(spendKurus(10, null)).toBeNull();
  });
  it("kur bayrağı aralık dışıysa okunmaz", () => {
    expect(readUsdTry({ rate: 41.5 })).toBe(41.5);
    expect(readUsdTry({ rate: "42" })).toBe(42);
    expect(readUsdTry({ rate: 0 })).toBeNull();
    expect(readUsdTry(null)).toBeNull();
  });
});

describe("kuyruk satırları", () => {
  it("karantina satırı gerekçesini okunur yazar; bozuk satır düşer", () => {
    const row = quarantineRow({
      id: "i1",
      program_id: "prog",
      unit_id: "prog#3",
      outcome_id: "prog#12",
      difficulty: "medium",
      stem: "Kök",
      choices: ["a", "b", "c", "d", "e"],
      answer: 2,
      explanation: "Açıklama",
      qa: { outcome_code: "k.1", quarantine: { rule: "low_correct_rate", responses: 12, correct_rate: 0.1, reports: 0, at: "2026-11-04T10:00:00Z" } },
      created_at: "2026-11-01T00:00:00Z",
    });
    expect(row?.ruleLabel).toBe("doğru oranı %20'nin altında");
    expect(row?.outcomeCode).toBe("k.1");
    expect(row?.correctRate).toBe(0.1);
    expect(quarantineRow({ id: "x" })).toBeNull();
  });
  it("bildirim satırı kararı etiketler ve soru anlık görüntüsünü taşır", () => {
    const row = reportRow({
      id: "r1",
      source: "node",
      target_id: "t",
      question_ref: "2",
      reason: "Cevap anahtarı yanlış",
      verdict: "valid",
      question_snapshot: { text: "Soru?", options: ["x", "y"], correct: ["y"] },
      rewarded: true,
      created_at: "2026-11-05T00:00:00Z",
    });
    expect(row?.verdictLabel).toBe("Hatalı bulundu");
    expect(row?.question?.correct).toEqual(["y"]);
    expect(reportRow({ id: "r2", source: "başka" })).toBeNull();
  });
});

describe("yönetim sayfası", () => {
  it("menüde kokpit; sayfa istemci modülünden fonksiyon çağırmaz ve eylem süresi 60 sn", () => {
    expect(ADMIN_NAV[0]?.items[0]).toMatchObject({ href: "/admin", label: "Kokpit" });
    const page = readFileSync("src/app/admin/page.tsx", "utf8");
    expect(page).toContain("export const maxDuration = 60");
    expect(page).toContain("loadCockpit(service)");
    const actions = readFileSync("src/app/admin/cockpit-actions.ts", "utf8");
    expect(actions.startsWith('"use server"')).toBe(true);
    for (const name of ["saveUsdTryRate", "restoreQuarantinedItem", "rejectQuarantinedItem", "regenerateQuarantinedItem"]) {
      expect(actions).toContain(`export async function ${name}(`);
    }
    expect(actions.match(/requireAdminActor\(\)/g)?.length).toBe(4);
  });
  it("yönetici kimlik denetimi tek kaynaktan", () => {
    for (const file of ["src/app/admin/actions.ts", "src/app/admin/adaptive/actions.ts", "src/app/admin/cockpit-actions.ts"]) {
      const text = readFileSync(file, "utf8");
      expect(text).toContain('from "@/lib/auth/admin-actor"');
      expect(text).not.toMatch(/async function requireAdminActor/);
    }
  });
});
