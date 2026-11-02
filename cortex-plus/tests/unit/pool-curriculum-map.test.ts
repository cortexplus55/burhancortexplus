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
