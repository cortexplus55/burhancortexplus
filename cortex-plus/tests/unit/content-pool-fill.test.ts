import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fillOrder, MAX_FAILED_ATTEMPTS, runFill, type FillDeps, type FillOutcome, type FillProgram } from "@/lib/content-pool/fill";

const registry = JSON.parse(readFileSync(path.join(process.cwd(), "src/lib/curriculum/registry.json"), "utf8")) as { programs: FillProgram[] };
const u = (grade: number | null) => ({ title: "x", outcomes: [{ grade }] });

describe("fillOrder", () => {
  it("TYT (9–10) → LGS → AYT (11–12 / sınıfsız), tekrar yok", () => {
    const programs: FillProgram[] = [
      { id: "yks-2026-fizik", kind: "yks", units: [u(9), u(11), u(10)] },
      { id: "yks-2026-matematik", kind: "yks", units: [u(12), u(9)] },
      { id: "lgs-2027-fen", kind: "lgs", units: [u(8)] },
      { id: "yks-2026-mantik", kind: "yks", units: [u(null)] },
      { id: "yks-2026-tarih", kind: "yks", units: [u(9), u(11)] },
      { id: "okul-x", kind: "okul", units: [u(9)] },
      { id: "yks-2026-kimya", kind: "yks", units: [{ title: "boş", outcomes: [] }] },
    ];
    expect(fillOrder(programs).map((t) => `${t.group}:${t.unitId}`)).toEqual([
      "TYT:yks-2026-matematik#2",
      "TYT:yks-2026-fizik#1",
      "TYT:yks-2026-fizik#3",
      "LGS:lgs-2027-fen#1",
      "AYT:yks-2026-matematik#1",
      "AYT:yks-2026-fizik#2",
      "AYT:yks-2026-tarih#2",
      "AYT:yks-2026-mantik#1",
      "MEB:okul-x#1",
    ]);
  });

  it("gerçek kayıtta TYT matematikle başlar, her ünite bir kez", () => {
    const order = fillOrder(registry.programs);
    expect(order[0]).toMatchObject({ group: "TYT", programId: "yks-2026-matematik" });
    expect(new Set(order.map((t) => t.unitId)).size).toBe(order.length);
    const firstLgs = order.findIndex((t) => t.group === "LGS");
    const firstAyt = order.findIndex((t) => t.group === "AYT");
    expect(firstLgs).toBeGreaterThan(0);
    expect(firstAyt).toBeGreaterThan(firstLgs);
    const groups = [...new Set(order.slice(firstAyt).map((t) => t.group))];
    expect(groups).toEqual(["AYT", "KPSS", "TUS", "DUS", "ALES", "DGS", "YDS", "MEB"]);
  });

  it("sınav grupları dönüşümlü: TUS/DUS/ALES/DGS/YDS KPSS'yi beklemez, grupta her dersin 1. ünitesi önce", () => {
    const order = fillOrder(registry.programs);
    const exams = order.filter((t) => ["KPSS", "TUS", "DUS", "ALES", "DGS", "YDS"].includes(t.group));
    const present = [...new Set(exams.map((t) => t.group))];
    expect(new Set(exams.slice(0, present.length).map((t) => t.group)).size).toBe(present.length);
    const lastExam = order.map((t) => t.group).lastIndexOf(exams.at(-1)!.group);
    expect(order.findIndex((t) => t.group === "MEB")).toBeGreaterThan(lastExam);
    const kpss = exams.filter((t) => t.group === "KPSS");
    const kpssPrograms = new Set(kpss.map((t) => t.programId)).size;
    expect(kpss.slice(0, kpssPrograms).every((t) => t.unitId.endsWith("#1"))).toBe(true);
  });
});

function deps(over: Partial<FillDeps> & { outcomes?: Record<string, FillOutcome[]>; costPerUnit?: number; startSpent?: number } = {}) {
  let spent = over.startSpent ?? 0;
  const runs: string[] = [];
  const d: FillDeps = {
    states: async () => new Map(),
    spent: async () => spent,
    enabled: async () => true,
    now: () => 0,
    run: async (id) => {
      runs.push(id);
      spent += over.costPerUnit ?? 0.01;
      return over.outcomes?.[id]?.shift() ?? "generated";
    },
    ...over,
  };
  return { d, runs, spent: () => spent };
}
const order = (n: number) => Array.from({ length: n }, (_, i) => ({ unitId: `p#${i + 1}`, programId: "p", group: "TYT" as const }));
const opts = { capUsd: 1, unitEstimateUsd: 0.01, concurrency: 1, deadline: 10 };

describe("runFill", () => {
  it("doğrulanmışı atlar, tümünü üretir", async () => {
    const { d, runs } = deps({ states: async () => new Map([["p#2", { verified: true, failedAttempts: 0 }]]) });
    const r = await runFill(order(3), d, opts);
    expect(runs).toEqual(["p#1", "p#3"]);
    expect(r.stop).toBe("complete");
  });

  it("bir sonraki ünite tavanı aşacaksa durur (her ünite öncesi DB harcaması)", async () => {
    const { d, runs, spent } = deps({ startSpent: 0.95, costPerUnit: 0.01 });
    const r = await runFill(order(20), d, { ...opts, concurrency: 3 });
    expect(r.stop).toBe("budget");
    expect(spent()).toBeLessThanOrEqual(1 + 1e-9);
    expect(runs.length).toBeLessThanOrEqual(5);
    expect(r.remaining).toBe(20 - runs.length);
  });

  it("başarısız ünite bir kez yeniden denenir, sonra atlanır", async () => {
    const { d, runs } = deps({ outcomes: { "p#1": ["failed", "failed"], "p#2": ["failed", "generated"] } });
    const r = await runFill(order(2), d, opts);
    expect(runs.filter((x) => x === "p#1")).toHaveLength(MAX_FAILED_ATTEMPTS);
    expect(r.failed).toEqual(["p#1"]);
    expect(r.done).toContain("p#2");
  });

  it("daha önce iki kez reddedilen ünite hiç denenmez; bir kez reddedilen bir şans daha alır", async () => {
    const { d, runs } = deps({
      states: async () => new Map([["p#1", { verified: false, failedAttempts: 2 }], ["p#2", { verified: false, failedAttempts: 1 }]]),
      outcomes: { "p#2": ["failed"] },
    });
    const r = await runFill(order(2), d, opts);
    expect(runs).toEqual(["p#2"]);
    expect(r.skippedFailed).toEqual(["p#1", "p#2"]);
  });

  it("kill switch kapanınca ve süre bitince yeni ünite başlatmaz", async () => {
    let on = true;
    const a = deps({ enabled: async () => on, run: async () => ((on = false), "generated") });
    expect((await runFill(order(5), a.d, opts)).stop).toBe("disabled");
    let t = 0;
    const b = deps({ now: () => (t += 6) });
    const rb = await runFill(order(5), b.d, opts);
    expect(rb.stop).toBe("deadline");
    expect(b.runs.length).toBe(1);
  });

  it("başkasının ürettiği ünite (pending) çift üretilmez", async () => {
    const { d, runs } = deps({ outcomes: { "p#1": ["pending"] } });
    const r = await runFill(order(1), d, opts);
    expect(runs).toEqual(["p#1"]);
    expect(r.pending).toEqual(["p#1"]);
  });
});

import { excludedTerms, garbledReason, GATE_VERSION, isUnitOfMeasure, maskMathNotation } from "@/lib/content-pool/gate";

/*
 * Regresyon (1 Kasım 2026): yks-2026-matematik#3 iki kez "kırık cümle yapısı" ve "kazanım sınırı dışında (km/sa.)"
 * ile reddedildi. Reddedilen taslağın metni saklanmıyor (qa yalnız gerekçe tutuyor); sınırlama metni ve
 * ret gerekçeleri veritabanından/kayıttan alındı, soru metinleri o kazanımların (9.3.3.1 aralık, 9.3.3.3 mutlak değer)
 * gösterimiyle kuruldu.
 */
describe("kapı: matematik/fen gösterimi yanlış ret üretmez", () => {
  const ok = [
    "Açık, kapalı ve yarı açık aralıklar: [2, 5) aralığında 2 vardır, 5 yoktur.",
    "x ∈ (−∞, 3] ise x ≤ 3 olur; [a, b) gösteriminde a dahildir.",
    "−2 < x ≤ 4 eşitsizliğinin çözüm kümesi (−2, 4] aralığıdır.",
    "|x − 3| ≤ 5 ⇔ −5 ≤ x − 3 ≤ 5 olduğundan çözüm kümesi [−2, 8] olur.",
    "|x| ≥ a ⇔ (x ≥ a ∨ x ≤ −a) özelliği kullanılır.",
    "Çözüm kümesi (1, 4] ∪ [6, ∞) biçiminde yazılır.",
    "Fransız gösteriminde ]a, b[ açık aralıktır.",
    "Hız 72 km/sa. ise 20 m/sn. olur; kesir olarak 3/4 saat sürer.",
    "İfade $\\frac{x+1}{2} \\ge [3, 4)$ olarak verilir.",
    "Satır içi \\( x \\in [0, 1) \\) ifadesi kullanılır.",
    "Basınç 2 atm, sıcaklık 25 °C ve derişim 0,1 mol/L dir.",
  ];
  for (const text of ok) it(text, () => expect(garbledReason(text)).toBeNull());

  it("gerçek bozukluklar yine yakalanır", () => {
    expect(garbledReason("Bu soruda (cevap verilmeden bırakılmış bir cümle var.")).toBe("kırık cümle yapısı");
    expect(garbledReason("Denklemi çöz) ve sonucu yaz.")).toBe("kırık cümle yapısı");
    expect(garbledReason("Bu cümledeKelimeler yapışık yazılmış.")).toBe("yapışık kelime");
    expect(garbledReason("BozukÃ¼ metin")).toBe("bozuk karakter kodlaması");
  });

  it("maskeleme yalnız aralıkları ve satır içi ifadeyi örter", () => {
    expect(maskMathNotation("[2, 5) ve (a, b]")).not.toMatch(/[[\])(]/);
    expect(maskMathNotation("(açıklama")).toContain("(");
  });

  it("ölçü birimleri dışlanan terim sayılmaz; yalnız olumsuz cümleciğin parantezi dışlanır", () => {
    const line =
      "b) Farklı problem çözme stratejilerinin uygulanmasını gerektiren oran, orantı kavramlarının kullanıldığı problemlere (örneğin elektrik, su vb. fatura ve ödemeler; sayı, kesir, yaş, işçi, alım-satım, kâr-zarar, yüzde ve karışım problemleri; hız ve hareket (hız kavramı, sabit hız, ortalama hız, birimler arası dönüşüm (km/sa., m/sn.)) yer verilir; faiz, havuz, saat problemlerine girilmez.";
    expect(excludedTerms([line])).toEqual([]);
    expect(excludedTerms(["Ayrıntıya girilmez (km/sa., Uzun Terim, kg)"])).toEqual(["uzun terim"]);
    for (const u of ["km/sa.", "m/sn.", "kg", "cm³", "°C", "mol/L"]) expect(isUnitOfMeasure(u)).toBe(true);
    expect(isUnitOfMeasure("modüler aritmetik")).toBe(false);
  });

  it("kapı sürümü yükseltildi (eski yanlış retler deneme hakkına sayılmaz)", () => {
    expect(GATE_VERSION).toBeGreaterThanOrEqual(2);
  });
});

describe("doldurucu: only önekleri", () => {
  it("yalnız eşleşen üniteler, sıra korunur", async () => {
    const { restrictOrder } = await import("@/lib/content-pool/fill");
    const order = [
      { unitId: "kpss-2026-deep-tarih#1", programId: "kpss-2026-deep-tarih", group: "KPSS" as const },
      { unitId: "kpss-2026-tree-tarih#1", programId: "kpss-2026-tree-tarih", group: "KPSS" as const },
      { unitId: "tus-2026-deep-dahiliye#12", programId: "tus-2026-deep-dahiliye", group: "TUS" as const },
      { unitId: "tus-2026-deep-dahiliye#2", programId: "tus-2026-deep-dahiliye", group: "TUS" as const },
    ];
    expect(restrictOrder(order, [])).toEqual(order);
    expect(restrictOrder(order, ["tus-2026-deep-dahiliye#2", "kpss-2026-deep-"]).map((t) => t.unitId)).toEqual(["kpss-2026-deep-tarih#1", "tus-2026-deep-dahiliye#2"]);
  });
});

describe("kapı: matematik gösterimi kırık cümle sayılmaz, gerçek hata yakalanır", async () => {
  const { garbledReason, garbledExcerpt, gateItem } = await import("@/lib/content-pool/gate");
  const ok = [
    "Çözüm kümesi [a − 1, b + 2) aralığıdır ve uç noktalar dahil edilir.",
    "A = {x | x ∈ ℤ, −2 ≤ x < 3} kümesinin eleman sayısı 5'tir.",
    "f(g(x)) = 2^(n+1) ifadesinde (a+b)/(c−d) kesri sadeleşir.",
    "p ⇒ (q ∧ r) önermesi ancak p doğru ve (q ∧ r) yanlışken yanlıştır.",
    "x ∈ (−∞, 3] ∪ ]5, 7[ için eşitsizlik sağlanır.",
    "Seçenekler: ç) 12 ve d) 15 olarak verilmiştir.",
    "ALES sayısal: (2/3)·(9/4) = 3/2 ve 3^(−2) = 1/9 olur.",
    "The two samples were ______ different in composition, despite the distance.",
  ];
  it.each(ok)("geçer: %s", (t) => expect(garbledReason(t)).toBeNull());
  it("gerçek karakter tekrarı yine yakalanır", () => expect(garbledReason("Bu sonuç aaaaaaaa olarak bulunur.")).toBe("tekrarlanan karakter"));
  it("gerçek kırık parantez yakalanır ve alıntısı verilir", () => {
    const bad = "Bu durumda sonuç (yani toplam değer olarak bulunur ve devam edilir.";
    expect(garbledReason(bad)).toBe("kırık cümle yapısı");
    expect(garbledExcerpt(bad)).toContain("(yani");
  });
  it("soru kapısı ret alıntısını döndürür", () => {
    const r = gateItem({ outcome_code: "X.1", difficulty: "easy", stem: "Aşağıdakilerden hangisi (doğru cevap olarak verilir?", choices: ["1", "2", "3", "4", "5"], answer: 0, explanation: "Açıklama metni yeterince uzun bir metindir." } as never, { unitId: "u", outcomes: [{ code: "X.1", outcomeId: "o", limitations: [] }], choices: 5 });
    expect(r).toMatchObject({ reason: "kırık cümle yapısı" });
    expect((r as { excerpt?: string }).excerpt).toContain("(doğru");
  });
});
