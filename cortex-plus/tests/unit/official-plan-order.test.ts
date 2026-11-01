import { describe, expect, it } from "vitest";
import { buildSetupTree } from "@/lib/curriculum/official-setup";
import { orderOfficialUnits } from "@/lib/curriculum/official-plan-order";
import { displayUnitTitles, plannedTopics, type UnitRating } from "@/lib/curriculum/official-setup-select";
import { subjectKeysForAlan } from "@/lib/curriculum/yks-alan";
import { buildTopicOnlySchedule } from "@/lib/learning/topic-only-schedule";

function sayPlan(ratings: Record<string, UnitRating>) {
  const tree = buildSetupTree("yks");
  const topics = plannedTopics(tree, { subjectKeys: subjectKeysForAlan("say"), removedOutcomes: [], removedUnits: [] });
  return topics.map((t) => ({ ...t, rating: ratings[t.unitId] ?? null }));
}

describe("öz değerlendirme yol sırasını belirler", () => {
  it("Zayıf ünite (AYT Mat · Çember ve Daire) ilk 24 yol düğümünde, ders içi sıra korunur", () => {
    const base = sayPlan({});
    const circle = base.find((t) => t.topic.includes("AYT Matematik") && t.topic.includes("Çember ve Daire"))!;
    expect(base.indexOf(circle)).toBeGreaterThan(50);
    const plan = sayPlan({ [circle.unitId]: "zayif" });
    const ordered = orderOfficialUnits(plan);
    const { drafts } = buildTopicOnlySchedule({
      daysToExam: 231,
      titles: ordered.map((u) => u.topic),
      dailyMinutes: 90,
      hardTopics: [circle.topic],
    });
    // Yol düğümleri = taslak sırası; Zayıf ünite ilk 24 düğümde: önünde yalnız AYT Matematiğin 4 ön ünitesi var (önceden ~80. konudaydı).
    const at = drafts.findIndex((d) => d.meta?.topicTitle === circle.topic);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(at).toBeLessThan(24);
    // AYT Matematik içinde ön üniteler Çember'den önce, kendi sıralarıyla
    const math = (list: typeof plan) => list.filter((u) => u.programId === circle.programId && u.part === circle.part).map((u) => u.unitId);
    expect(math(ordered)).toEqual(math(plan));
    expect(ordered).toHaveLength(plan.length);
  });

  it("birden çok derste Zayıf varsa zincirler dönüşümlü öne gelir; Biliyorum sona", () => {
    const u = (programId: string, n: number, rating: UnitRating | null = null) => ({
      topic: `${programId}-${n}`,
      programId,
      part: "TYT",
      rating,
    });
    const units = [u("a", 1), u("a", 2, "zayif"), u("a", 3), u("b", 1, "iyi"), u("b", 2, "zayif"), u("c", 1)];
    expect(orderOfficialUnits(units).map((x) => x.topic)).toEqual(["a-1", "b-2", "a-2", "a-3", "c-1", "b-1"]);
    const none = units.map((x) => ({ ...x, rating: null }));
    expect(orderOfficialUnits(none)).toEqual(none);
  });

  it("Biliyorum ünitesi takvimde daha kısa sürer", () => {
    const run = (known: string[]) =>
      buildTopicOnlySchedule({ daysToExam: 120, titles: ["A", "B"], dailyMinutes: 60, knownTopics: known }).schedule.sessions
        .filter((s) => s.topicId === "topic:1")
        .reduce((n, s) => n + s.durationMinutes, 0);
    expect(run(["B"])).toBeLessThan(run([]));
  });
});

describe("ünite başlığında kaynak numarası gösterilmez", () => {
  it("numaralı program: '2. Hikâye' → 'Hikâye', sınıf bölümü kalır", () => {
    expect(displayUnitTitles(["9. Sınıf · 2. Hikâye", "9. Sınıf · 3. Şiir"])).toEqual(["9. Sınıf · Hikâye", "9. Sınıf · Şiir"]);
    expect(displayUnitTitles(["1. Ünite: Bir Kahraman Doğuyor", "2. Ünite: Millî Uyanış"])).toEqual([
      "Bir Kahraman Doğuyor",
      "Millî Uyanış",
    ]);
  });
  it("numarasız programda '15. Yüzyıl' gibi başlıklar korunur", () => {
    const t = ["11. Sınıf · MÖ 6. Yüzyıl Felsefesi", "11. Sınıf · 15. Yüzyıl-17. Yüzyıl Felsefesi", "11. Sınıf · 20. Yüzyıl Felsefesi", "11. Sınıf · Mantık"];
    expect(displayUnitTitles(t).slice(0, 2)).toEqual(t.slice(0, 2));
  });
  it("kurulum ağacında numaralı ünite kalmaz", () => {
    const tree = buildSetupTree("yks");
    const turkce = tree.subjects.find((s) => s.key === "tyt-turkce")!;
    expect(turkce.units[0]!.title).not.toMatch(/·\s*\d+\.\s/);
  });
});

describe("ortak ünite numarası yardımcısı", () => {
  it("sınıf önekinden sonra ve başta gelen sıra numarası atılır", async () => {
    const { stripUnitOrdinal, displayUnitTitles: shown } = await import("@/lib/curriculum/unit-title");
    expect(stripUnitOrdinal("10. Sınıf · 7. Anı (Hatıra)")).toBe("10. Sınıf · Anı (Hatıra)");
    expect(stripUnitOrdinal("TYT Türkçe · 9. Sınıf · 2. Hikâye")).toBe("TYT Türkçe · 9. Sınıf · Hikâye");
    expect(stripUnitOrdinal("9. Sınıf · 1. Tarih ve Zaman")).toBe("9. Sınıf · Tarih ve Zaman");
    expect(stripUnitOrdinal("12. Sınıf · 1. 20. Yüzyıl Başlarında Osmanlı")).toBe("12. Sınıf · 20. Yüzyıl Başlarında Osmanlı");
    expect(stripUnitOrdinal("3) Şiir")).toBe("Şiir");
    expect(stripUnitOrdinal("4 - Roman")).toBe("Roman");
    expect(stripUnitOrdinal("1.ÜNİTE: MEVSİMLER VE İKLİM")).toBe("MEVSİMLER VE İKLİM");
    expect(stripUnitOrdinal("2. TEMA: ANLAM ARAYIŞI")).toBe("ANLAM ARAYIŞI");
    // korunanlar
    expect(stripUnitOrdinal("9. Sınıf")).toBe("9. Sınıf");
    expect(stripUnitOrdinal("1. Dünya Savaşı")).toBe("1. Dünya Savaşı");
    expect(stripUnitOrdinal("11. Sınıf · 15. Yüzyıl-17. Yüzyıl Felsefesi")).toBe("11. Sınıf · 15. Yüzyıl-17. Yüzyıl Felsefesi");
    expect(stripUnitOrdinal("2. Meşrutiyet Dönemi")).toBe("2. Meşrutiyet Dönemi");
    expect(stripUnitOrdinal("1923-1938 Atatürk Dönemi")).toBe("1923-1938 Atatürk Dönemi");
    expect(shown(["1. A", "B", "C"])).toEqual(["1. A", "B", "C"]);
  });

  it("YKS kurulum ağacında ve konu haritasında '· N. ' kalıbı yok (Türkçe, Tarih dahil)", async () => {
    const tree = buildSetupTree("yks");
    const bad = tree.subjects.flatMap((s) => s.units.map((u) => `${s.label} · ${u.title}`)).filter((t) => /· \d+\. (?!Sınıf|Yüzyıl)/u.test(t));
    expect(bad).toEqual([]);
    const titles = tree.subjects.find((s) => s.key === "tyt-turkce")!.units.map((u) => u.title);
    expect(titles).toContain("10. Sınıf · Anı (Hatıra)");
    const tarih = tree.subjects.find((s) => s.key === "tyt-tarih")!.units.map((u) => u.title);
    expect(tarih).toContain("10. Sınıf · Dünya Gücü Osmanlı (1453-1595)");
    expect(tree.subjects.find((s) => s.key === "ayt-felsefe")?.units.map((u) => u.title) ?? []).not.toContain(
      "11. Sınıf · Yüzyıl-17. Yüzyıl Felsefesi",
    );
    const { officialUnitTopic } = await import("@/lib/curriculum/official-setup");
    const tde = tree.subjects.find((s) => s.key === "tyt-turkce")!.units[0]!;
    expect(officialUnitTopic(tde.id, "TYT Türkçe · 9. Sınıf · 2. Hikâye")).toBe("TYT Türkçe · 9. Sınıf · Hikâye");
    const { getProgram } = await import("@/lib/curriculum/registry");
    const { buildTopicMap, topicIndexForLabel } = await import("@/lib/curriculum/topic-map");
    const map = buildTopicMap(getProgram("yks-2026-tarih")!, "serbest", null, { part: "TYT" });
    expect(map.topics.filter((t) => /· \d+\. (?!Sınıf|Yüzyıl)|^\d+\. (?!Sınıf)/u.test(t))).toEqual([]);
    expect(topicIndexForLabel(map, "9. Sınıf · 1. Tarih ve Zaman")).toBe(topicIndexForLabel(map, "9. Sınıf · Tarih ve Zaman"));
  });
});
