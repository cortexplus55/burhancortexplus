// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { GUEST_TOUR_CONTENT } from "@/lib/demo/guest-tour-tracks";
import { GUEST_DEMO_TRACKS, GUEST_TRACK_IDS } from "@/lib/marketing/guest-demo-tracks";
import { TOUR_EXAM_DAYS, readTourProgress, writeTourProgress } from "@/lib/marketing/guest-tour-progress";
import {
  DEFAULT_EXAM_DAYS,
  JOURNEY_DATE,
  JOURNEY_EXAM_DAYS,
  journeyDayPlan,
  journeyGoals,
  journeyOutputs,
} from "@/lib/marketing/landing-journey";

/*
  Faz 9.1 (20 Kasım 2026, ürün sahibi Faz 9'un tek kartını geri çevirdi): ana sayfanın birinci adımı "Çekirdeğe bırak".
  Not ders çekirdeğine götürülür, "Sınavın ne zaman?" sorulur, gün seçilince çekirdekten ilk ders doğar: üç kart ve
  günlere yayılmış küçük yol. Sayılar uydurulmaz (stüdyonun gösterdiği örnek veriden), yol yalnız ücretsiz hesapta da
  açık adımlardan kurulur, seçilen gün stüdyonun hedef çipine ve tur kaydına (oradan kurulum sihirbazına) gider.
*/

afterEach(() => {
  window.sessionStorage.clear();
});

/** Yoldaki adım adları: ilk dersin döngüsü (ücretsiz hesapta da açık) ve sınav sabahı kartlarla tekrar. */
const FREE_STEPS = new Set(["Ders", "Konu testi", "Kartlar", "Doğru/Yanlış", "Kartlarla tekrar"]);

/** "Bugün" 1. gün, "Yarın" 2. gün, "N. gün" N; sınav sabahı en sonda. */
function dayNumber(when: string): number {
  if (when === "Bugün") return 1;
  if (when === "Yarın") return 2;
  const match = when.match(/^(\d+)\. gün$/);
  if (match) return Number(match[1]);
  if (when === "Sınav sabahı") return Number.POSITIVE_INFINITY;
  throw new Error(`bilinmeyen gün: ${when}`);
}

describe("küçük yol: seçilen güne göre", () => {
  it("dört seçenek; tur kaydı (uygulama da okur) aynı listeyi tutar; seçilmezse 7 gün", () => {
    expect([...JOURNEY_EXAM_DAYS]).toEqual([3, 7, 14, 30]);
    expect([...TOUR_EXAM_DAYS]).toEqual([...JOURNEY_EXAM_DAYS]);
    expect(DEFAULT_EXAM_DAYS).toBe(7);
    expect(JOURNEY_EXAM_DAYS.map((days) => JOURNEY_DATE.chip(days))).toEqual(["3 gün", "7 gün", "14 gün", "30 gün"]);
  });

  it("3 gün sıkışır: ilk iki gün ikişer adım, sınav sabahı kartlarla tekrar", () => {
    expect(journeyDayPlan(3)).toEqual([
      { when: "Bugün", steps: ["Ders", "Konu testi"] },
      { when: "Yarın", steps: ["Kartlar", "Doğru/Yanlış"] },
      { when: "Sınav sabahı", steps: ["Kartlarla tekrar"] },
    ]);
  });

  it("7, 14 ve 30 gün: her adım ayrı gün, kartlar ve doğru/yanlış süreye yayılır", () => {
    expect(journeyDayPlan(7).map((row) => row.when)).toEqual(["Bugün", "Yarın", "3. gün", "5. gün", "Sınav sabahı"]);
    expect(journeyDayPlan(14).map((row) => row.when)).toEqual(["Bugün", "Yarın", "6. gün", "10. gün", "Sınav sabahı"]);
    expect(journeyDayPlan(30).map((row) => row.when)).toEqual(["Bugün", "Yarın", "12. gün", "21. gün", "Sınav sabahı"]);
    for (const days of [7, 14, 30] as const) {
      expect(journeyDayPlan(days).map((row) => row.steps)).toEqual([["Ders"], ["Konu testi"], ["Kartlar"], ["Doğru/Yanlış"], ["Kartlarla tekrar"]]);
    }
  });

  it("her seçenekte: günler artarak gider, hiçbir adım sınav gününü geçmez, yalnız ücretsiz de açık adımlar var", () => {
    for (const days of JOURNEY_EXAM_DAYS) {
      const plan = journeyDayPlan(days);
      const numbers = plan.map((row) => dayNumber(row.when));
      for (let at = 1; at < numbers.length; at += 1) expect(numbers[at]!, `${days} gün`).toBeGreaterThan(numbers[at - 1]!);
      for (const number of numbers.filter(Number.isFinite)) expect(number, `${days} gün`).toBeLessThanOrEqual(days);
      for (const step of plan.flatMap((row) => row.steps)) expect(FREE_STEPS.has(step), `${days} gün: ${step}`).toBe(true);
      // Plus'taki sınav sabahı kâğıdı ve hazırlık geneli "Kartlarla son tekrar" söz verilmez.
      expect(JSON.stringify(plan)).not.toMatch(/kâğıt|kağıt|son tekrar|Plus/i);
      expect(plan.at(-1)!.when).toBe("Sınav sabahı");
    }
  });

  it("yolun başlığı ve stüdyonun hedef çipi seçilen günü söyler", () => {
    expect(JOURNEY_DATE.planTitle(14)).toBe("14 günlük yolun");
    expect(journeyGoals("Vizene", 14)[0]).toBe("Vizene 14 gün var");
    expect(journeyGoals("Yazılına")[0]).toBe("Yazılına 7 gün var");
  });
});

describe("çekirdekten doğan üç kart: sayılar örnek veriden", () => {
  it("her branşta ders bölümü, soru ve kart sayısı stüdyonun göstereceği örnek veriyle aynı", () => {
    for (const id of GUEST_TRACK_IDS) {
      const content = GUEST_TOUR_CONTENT[id];
      expect(journeyOutputs(id), id).toEqual([
        { id: "lesson", title: "Ders", meta: `${content.lesson.screens.length} bölüm` },
        { id: "question", title: "Konu testi", meta: `${content.quiz.length} soru` },
        { id: "cards", title: "Kartlar", meta: `${content.cards.length} kart` },
      ]);
      expect(GUEST_DEMO_TRACKS[id].tour.statements, id).toBe(content.trueFalse.length);
    }
  });
});

describe("seçilen gün tur kaydına ve kurulum sihirbazına gider", () => {
  it("gün yazılır, adım adım yazılırken korunur; bilinmeyen gün yok sayılır", () => {
    const now = Date.UTC(2026, 10, 20, 12);
    writeTourProgress({ step: "lesson", segment: "lise", days: 14 }, now);
    expect(readTourProgress(now)).toEqual({ steps: ["lesson"], segment: "lise", at: now, days: 14 });
    // Sonraki adım günü vermeden yazılır: gün korunur.
    writeTourProgress({ step: "question", segment: "lise" }, now + 1000);
    expect(readTourProgress(now + 1000)?.days).toBe(14);
    // Bilinmeyen gün yok sayılır; önceki gün kalır.
    writeTourProgress({ step: "cards", segment: "lise", days: 5 }, now + 2000);
    expect(readTourProgress(now + 2000)?.days).toBe(14);
    // Bozuk kayıttaki gün okunmaz.
    window.sessionStorage.setItem("cp:guest-tour", JSON.stringify({ steps: ["lesson"], segment: "lise", at: now, days: 99 }));
    expect(readTourProgress(now)).toEqual({ steps: ["lesson"], segment: "lise", at: now });
  });

  it("kurulum sihirbazı taslağı yoksa tarihi bugün + turda seçilen gün ile açar (sunucudaki taslak yine geçerli)", () => {
    const wizard = readFileSync("src/components/parity/exam-create-wizard.tsx", "utf8").replace(/\r\n/g, "\n");
    expect(wizard).toContain('import { readTourProgress } from "@/lib/marketing/guest-tour-progress";');
    expect(wizard).toMatch(/if \(local\) \{\s*applyDraft\(local\);\s*\} else \{[\s\S]*?const tourDays = readTourProgress\(\)\?\.days;\s*if \(tourDays\) setExamDate\(isoOf\(addDays\(tourDays\)\)\);\s*\}/);
    // Tur kaydı modülü pazarlama metni taşımaz (uygulama paketine girer).
    expect(readFileSync("src/lib/marketing/guest-tour-progress.ts", "utf8")).not.toMatch(/landing-journey/);
  });
});
