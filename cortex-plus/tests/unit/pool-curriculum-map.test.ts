import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { poolUnitForTopic } from "@/lib/content-pool/serve";
import { topicMapForRef } from "@/lib/curriculum/registry";

const prefs = { curriculum: { part: "TYT", examKey: "serbest", scenario: null, programId: "yks-2026-matematik" } };

describe("müfredattan seçilen hazırlıkta konu → havuz ünitesi", () => {
  it("canlı testteki konu (9. Sınıf · Mantık) üniteye eşlenir", () => {
    const unit = poolUnitForTopic(prefs, "9. Sınıf · Mantık");
    expect(unit?.unitId).toMatch(/^yks-2026-matematik#\d+$/);
    expect(unit?.unit.title).toContain("Mantık");
  });
  it("haritadaki her konu ya tek üniteye ya hiçbirine eşlenir; iki konu aynı üniteye düşmez", () => {
    const map = topicMapForRef(prefs.curriculum as never)!;
    const ids = map.topics.map((t) => poolUnitForTopic(prefs, t)?.unitId).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(0);
    console.log(`eşlenen ${ids.length}/${map.topics.length}`);
  });
  it("bilinmeyen konu ve başvurusuz tercih null döner", () => {
    expect(poolUnitForTopic(prefs, "Uydurma konu")).toBeNull();
    expect(poolUnitForTopic({}, "9. Sınıf · Mantık")).toBeNull();
  });
});

import { readFileSync } from "node:fs";
describe("müfredat paneli ücretsiz hazır içerik notu", () => {
  it("kurulum akışıyla aynı metni gösterir", () => {
    const s = readFileSync("src/components/parity/official-curriculum-panel.tsx", "utf8");
    expect(s).toContain("Hazır içerikle çalış — ücretsiz");
    expect(s).toContain("Hazır içerik kredi harcamaz. Ücretsiz hesapta ilk konu açık, tüm konular Plus ile.");
  });
});

import { curriculumSlice, filterItemsByOutcome, sliceLesson, sliceOutcomeIds } from "@/lib/content-pool/serve";
import type { LessonBody } from "@/lib/content-pool/schema";

describe("alt başlık konusu: ünite dilimi (model çağrısı yok)", () => {
  const ref = { programId: "yks-2026-mantik", examKey: "serbest", scenario: null, part: "AYT" } as never;
  const map = topicMapForRef(ref)!;
  const subs = map.topics
    .map((t) => ({ t, s: curriculumSlice(ref, t) }))
    .filter((x) => x.s && x.s.units.length === 1 && !x.s.units[0]!.outcomes.every((o) => x.s!.codes!.has(o.code)));

  it("ünitenin alt başlıkları aynı birincil üniteye (aynı medya önbelleği) eşlenir", () => {
    expect(subs.length).toBeGreaterThan(1);
    const byUnit = new Map<string, number>();
    for (const x of subs) byUnit.set(x.s!.units[0]!.unitId, (byUnit.get(x.s!.units[0]!.unitId) ?? 0) + 1);
    expect([...byUnit.values()].some((n) => n > 1)).toBe(true);
  });

  it("ders yalnız konunun kazanım bölümlerini, quiz yalnız onun outcome_id'lerini alır", () => {
    const { s } = subs[0]!;
    const unit = s!.units[0]!;
    const body = {
      title: "Ü", overview: "o".repeat(30), summary: "s".repeat(30), cards: [{ front: "a", back: "b" }],
      sections: unit.outcomes.map((o) => ({ outcome_code: o.code, heading: o.code, explanation: "x".repeat(40), key_points: ["k"] })),
    } as LessonBody;
    const sliced = sliceLesson([{ unit, body }], s!.codes, "Konu");
    expect(sliced.sections.length).toBe(s!.codes!.size);
    expect(sliced.sections.every((x) => s!.codes!.has(x.outcome_code))).toBe(true);
    const ids = sliceOutcomeIds(s!)!;
    const rows = unit.outcomes.flatMap((o) => Array.from({ length: 6 }, () => ({ outcome_id: o.outcomeId })));
    expect(filterItemsByOutcome(rows, ids, 5).every((r) => ids.has(r.outcome_id))).toBe(true);
  });

  it("süzülmüş soru yetmezse aynı ünitenin sorularıyla tamamlanır", () => {
    const rows = [{ outcome_id: "a" }, { outcome_id: "b" }, { outcome_id: "b" }, { outcome_id: "b" }, { outcome_id: "b" }];
    expect(filterItemsByOutcome(rows, new Set(["a"]), 5)).toHaveLength(5);
  });
});
