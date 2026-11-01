import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { poolUnit, poolUnitsForProgram } from "@/lib/content-pool/keys";
import { generateUnitContent, type LlmCall } from "@/lib/content-pool/generate";
import { getUnitContent, type PoolStore, type StoredContent } from "@/lib/content-pool/pool";
import { applyReview, checkShape, missingCoverage, type PoolItem } from "@/lib/content-pool/schema";
import type { PoolUnit } from "@/lib/content-pool/keys";

const UNIT = "yks-2026-tarih#2"; // kanonik curriculum_units.id (1 tabanlı)

function fakeLlm(unit: PoolUnit, opts: { wrongAnswerFor?: string } = {}): LlmCall & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async ({ model, system, user }) => {
    calls.push(system.slice(0, 20));
    if (system.includes("ders anlatımı")) {
      return {
        model,
        tokensIn: 100,
        tokensOut: 200,
        text: JSON.stringify({
          title: unit.unit.title,
          overview: "Bu ünitede resmî kazanımlar sırasıyla ele alınır ve örneklerle açıklanır.",
          sections: unit.outcomes.map((o) => ({
            outcome_code: o.code,
            heading: `Kazanım ${o.code}`,
            explanation: `${o.text} Bu bölüm kazanımı özgün örneklerle, adım adım açıklar.`,
            key_points: ["Ana fikir"],
          })),
          summary: "Ünitenin özeti: kazanımların ortak noktaları ve temel kavramlar.",
          cards: [{ front: "Soru", back: "Cevap" }],
        }),
      };
    }
    if (system.includes("soru yazan")) {
      const pairs = /çiftlerinin her biri için tam 1 soru yaz: (.*)\.\n/.exec(user)![1]!.split(", ");
      return {
        model,
        tokensIn: 50,
        tokensOut: 80,
        text: JSON.stringify({
          items: pairs.map((p) => {
            const [code, difficulty] = p.split("|");
            return { outcome_code: code, difficulty, stem: `Özgün soru ${p} nedir?`, choices: ["A1", "B1", "C1", "D1", "E1"], answer: 2, explanation: "Çünkü C doğrudur." };
          }),
        }),
      };
    }
    const blind = JSON.parse(/SORULAR \(cevapsız\):\n([\s\S]*?)\n\n/.exec(user)![1]!) as { index: number; outcome_code: string; stem: string }[];
    return {
      model,
      tokensIn: 70,
      tokensOut: 30,
      text: JSON.stringify({
        lesson_ok: true,
        lesson_issues: [],
        items: blind.map((b) => ({
          index: b.index,
          solved_answer: opts.wrongAnswerFor && b.stem.includes(opts.wrongAnswerFor) && calls.filter((c) => c.startsWith("Sen bağımsız")).length === 1 ? 0 : 2,
          within_scope: true,
          ok: true,
          issue: null,
        })),
      }),
    };
  }) as LlmCall & { calls: string[] };
  fn.calls = calls;
  return fn;
}

function memoryStore(): PoolStore & { rows: Map<string, { status: string; content?: StoredContent; createdAt: number; unitId: string }>; usage: number } {
  const rows = new Map<string, { status: string; content?: StoredContent; createdAt: number; unitId: string }>();
  let seq = 0;
  const store = {
    rows,
    usage: 0,
    async readVerified(unitId: string) {
      for (const r of rows.values()) if (r.unitId === unitId && r.status === "verified") return r.content!;
      return null;
    },
    async claim(unit: PoolUnit, _version?: number) {
      for (const [id, r] of rows) if (r.unitId === unit.unitId && (r.status === "draft" || r.status === "verified")) return { claimed: false as const, ageMs: Date.now() - r.createdAt, id };
      const id = `c${++seq}`;
      rows.set(id, { status: "draft", createdAt: Date.now(), unitId: unit.unitId });
      return { claimed: true as const, id };
    },
    async retire(id: string, status: "stale" | "rejected") {
      const r = rows.get(id);
      if (r) r.status = status;
    },
    async writeVerified(id: string, unit: PoolUnit, _v: number, content: { lesson: StoredContent["body"]; items: PoolItem[] }) {
      const byCode = new Map(unit.outcomes.map((o) => [o.code, o.outcomeId]));
      const stored: StoredContent = {
        id,
        unitSha256: unit.sha256,
        body: content.lesson,
        items: content.items.map((i, n) => ({ ...i, id: `i${n}`, outcome_id: byCode.get(i.outcome_code)! })),
      };
      rows.set(id, { ...rows.get(id)!, status: "verified", content: stored });
      return stored;
    },
    async recordUsage(_u: string, usage: unknown[]) {
      store.usage += usage.length;
    },
  };
  return store;
}

describe("ortak içerik havuzu: kimlikler", () => {
  it("ünite ve kazanım kimlikleri tohum SQL'iyle (curriculum_units / curriculum_outcomes) birebir aynı", () => {
    const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/20261101160000_curriculum_seed_v5.sql"), "utf8");
    for (const unit of poolUnitsForProgram("yks-2026-tarih")) {
      expect(sql).toContain(`('${unit.unitId}', 'yks-2026-tarih', `);
      for (const o of unit.outcomes) expect(sql).toContain(`('${o.outcomeId}', 'yks-2026-tarih', '${unit.unitId}', '${o.code}', `);
    }
  });

  it("?unit=<program>#1 curriculum_units sort_order 1 ünitesine çözülür (API = DB = tohum)", () => {
    const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/20261101160000_curriculum_seed_v5.sql"), "utf8");
    for (const programId of ["yks-2026-tarih", "yks-2026-biyoloji"]) {
      const unit = poolUnit(`${programId}#1`)!;
      expect(unit.unitId).toBe(`${programId}#1`);
      const row = new RegExp(`\\('${programId}#1', '${programId}', '([^']*)', (\\d+),`).exec(sql)!;
      expect(Number(row[2])).toBe(1);
      expect(unit.unit.title).toBe(row[1]);
    }
    expect(poolUnit("yks-2026-tarih#1")!.unit.title).toContain("Tarih ve Zaman");
    expect(poolUnit("yks-2026-tarih#0")).toBeNull();
    expect(poolUnitsForProgram("yks-2026-tarih")[0]!.unitId).toBe("yks-2026-tarih#1");
  });

  it("kaynak bağlantıları yalnız kayıttaki resmî belgeler; kazanım uydurulmaz", () => {
    const unit = poolUnit(UNIT)!;
    expect(unit.sourceLinks.length).toBeGreaterThan(0);
    for (const link of unit.sourceLinks) expect(link.url).toMatch(/^https:\/\/[a-z.]*(meb|osym)\.gov\.tr\//);
    expect(poolUnit("yks-2026-tarih#999")).toBeNull();
    expect(poolUnit("../etc#1")).toBeNull();
  });
});

describe("ortak içerik havuzu: kural denetimi", () => {
  const item = (code: string, difficulty: "easy" | "medium" | "hard", extra: Partial<PoolItem> = {}): PoolItem => ({
    outcome_code: code,
    difficulty,
    stem: "Özgün bir soru kökü?",
    choices: ["a", "b", "c", "d", "e"],
    answer: 1,
    explanation: "Açıklama metni.",
    ...extra,
  });
  it("seçenek sayısı, cevap aralığı, yinelenen seçenek ve kayıtta olmayan kazanım reddedilir", () => {
    const lesson = { title: "t", overview: "o".repeat(20), sections: [{ outcome_code: "9.1.1", heading: "h", explanation: "e".repeat(40), key_points: ["k"] }], summary: "s".repeat(20), cards: [{ front: "f", back: "b" }] };
    const { validItems, itemIssues, lessonIssues } = checkShape(
      lesson,
      [item("9.1.1", "easy"), item("9.1.1", "medium", { choices: ["a", "b", "c", "d"] }), item("9.1.1", "hard", { answer: 4, choices: ["a", "a", "c", "d", "e"] }), item("x", "easy")],
      ["9.1.1", "9.1.2"],
      5,
    );
    expect(validItems).toHaveLength(1);
    expect(itemIssues.map((i) => i.detail)).toEqual(["seçenek sayısı 4 (beklenen 5)", "aynı seçenek iki kez", "kayıtta olmayan kazanım"]);
    expect(lessonIssues).toEqual([{ code: "9.1.2", detail: "anlatımda bölüm yok" }]);
    expect(missingCoverage(validItems, ["9.1.1"])).toEqual(["9.1.1|medium", "9.1.1|hard"]);
  });
  it("bağımsız çözüm farklı cevap bulursa soru havuza girmez", () => {
    const { kept, rejected } = applyReview([item("9.1.1", "easy"), item("9.1.1", "medium")], {
      lesson_ok: true,
      lesson_issues: [],
      items: [
        { index: 0, solved_answer: 1, within_scope: true, ok: true },
        { index: 1, solved_answer: 3, within_scope: true, ok: true },
      ],
    });
    expect(kept).toHaveLength(1);
    expect(rejected[0]!.reason).toBe("bağımsız çözüm farklı cevap buldu");
  });
});

describe("ortak içerik havuzu: read-through önbellek", () => {
  it("ıska → üret + doğrula + yaz; sonraki öğrenci 0 model çağrısıyla ve <100 ms alır", async () => {
    const unit = poolUnit(UNIT)!;
    const store = memoryStore();
    const llm = fakeLlm(unit);
    const first = await getUnitContent(UNIT, { store, llm, userId: "u1" });
    expect(first.status).toBe("generated");
    if (first.status !== "generated") return;
    expect(first.llmCalls).toBe(3);
    expect(store.usage).toBe(3);
    expect(first.content.items).toHaveLength(unit.outcomes.length * 3);
    expect(first.content.items[0]).not.toHaveProperty("answer");
    expect(first.content.origin).toBe("cortex_original");
    expect(first.content.title).not.toMatch(/· \d+\. /);
    expect(new Set(first.content.items.map((i) => i.outcome_id))).toEqual(new Set(unit.outcomes.map((o) => o.outcomeId)));

    const before = llm.calls.length;
    const second = await getUnitContent(UNIT, { store, llm, userId: "u2" });
    expect(second.status).toBe("hit");
    if (second.status !== "hit") return;
    expect(second.llmCalls).toBe(0);
    expect(llm.calls.length).toBe(before);
    expect(second.ms).toBeLessThan(100);
  });

  it("yanlış anahtarlı soru elenir, eksik çift ikinci turda tamamlanır", async () => {
    const unit = poolUnit(UNIT)!;
    const target = `${unit.outcomes[0]!.code}|hard`;
    const store = memoryStore();
    const result = await getUnitContent(UNIT, { store, llm: fakeLlm(unit, { wrongAnswerFor: target }), userId: "u1" });
    expect(result.status).toBe("generated");
    if (result.status === "generated") expect(result.llmCalls).toBe(5);
  });

  it("üretim sürerken gelen öğrenci 'pending' alır (çift üretim yok); kayıt özeti değişince içerik bayatlar", async () => {
    const unit = poolUnit(UNIT)!;
    const store = memoryStore();
    await store.claim(unit, 1);
    const pending = await getUnitContent(UNIT, { store, llm: fakeLlm(unit), userId: "u2" });
    expect(pending.status).toBe("pending");

    const fresh = memoryStore();
    await getUnitContent(UNIT, { store: fresh, llm: fakeLlm(unit), userId: "u1" });
    const row = [...fresh.rows.values()][0]!;
    row.content!.unitSha256 = "eski";
    const again = await getUnitContent(UNIT, { store: fresh, llm: fakeLlm(unit), userId: "u1" });
    expect(again.status).toBe("generated");
    expect([...fresh.rows.values()].map((r) => r.status)).toEqual(["stale", "verified"]);
  });

  it("doğrulanmayan içerik havuza yazılmaz", async () => {
    const unit = poolUnit(UNIT)!;
    const store = memoryStore();
    const bad: LlmCall = async ({ model }) => ({ model, tokensIn: 1, tokensOut: 1, text: "{}" });
    const result = await getUnitContent(UNIT, { store, llm: bad, userId: "u1" });
    expect(result.status).toBe("failed");
    expect([...store.rows.values()].every((r) => r.status === "rejected")).toBe(true);
  });

  it("generateUnitContent: doğrulama modeli üretim modelinden ayrı çağrılır", async () => {
    const unit = poolUnit(UNIT)!;
    const out = await generateUnitContent(unit, fakeLlm(unit), { generate: "gen-model", verify: "verify-model" });
    expect(out.usage.map((u) => [u.actionCode, u.model])).toEqual([
      ["SHARED_CONTENT_LESSON", "gen-model"],
      ["SHARED_CONTENT_ITEMS", "gen-model"],
      ["SHARED_CONTENT_VERIFY", "verify-model"],
    ]);
  });
});

describe("ortak içerik havuzu: maliyet", () => {
  it("kullanım kaydı istenen (fiyatlı) model adıyla yazılır, maliyet fiyat satırından hesaplanır", async () => {
    const { priceForModel, usageCostUsd } = await import("@/lib/billing/model-price");
    const unit = poolUnit(UNIT)!;
    const llm: LlmCall = async (args) => ({ ...(await fakeLlm(unit)(args)), model: `${args.model}-2025-04-14` });
    const out = await generateUnitContent(unit, llm, { generate: "gpt-6-luna", verify: "gpt-4.1" });
    expect(out.usage.map((u) => u.model)).toEqual(["gpt-6-luna", "gpt-6-luna", "gpt-4.1"]);
    const prices = new Map([["gpt-4.1", { input: 0.002, output: 0.008 }]]);
    expect(usageCostUsd(priceForModel("gpt-4.1", prices), 78095, 6042)).toBe(0.204526);
    expect(usageCostUsd(priceForModel("bilinmeyen", prices), 1, 1)).toBeNull();
  });
});
