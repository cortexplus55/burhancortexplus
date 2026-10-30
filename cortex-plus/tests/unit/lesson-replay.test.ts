import { readFileSync } from "node:fs";
import { readSource } from "./helpers/node-sources";
import { describe, expect, it } from "vitest";
import { replayLessonPayload } from "@/lib/learning/lesson-replay";
import { screenCheck, type LessonV3 } from "@/lib/learning/lesson-v3";

/*
  "Dersi tekrarla" (18 Ekim 2026, ürün sahibinin kararı): aynı ders yeniden açılır — anında ve
  kredisiz. Canlıda düğme dersi sıfırdan yazıyordu (bekleme + maliyet). Yeni anlatım isteyen
  öğrenci için "Farklı anlat".
*/
const read = (path: string) => readSource(path).replace(/\r\n/g, "\n");

const options = ["Yokluk", "Mutlak butlan", "Nispi butlan", "Bağlamazlık"];
const lesson: LessonV3 = {
  format: 3,
  title: "Hükümsüzlük",
  overview: "Kanca.",
  screens: [
    {
      heading: "Yokluk",
      concept: "Yokluk",
      blocks: [
        { type: "text", text: "Kurucu unsur yoksa yokluk." },
        {
          type: "check",
          check: {
            type: "mcq",
            prompt: "Nikâhsız evlilik hangi türdür?",
            options,
            answerIndex: 0,
            explanation: "Kurucu unsur yok.",
            optionWhy: ["Kurucu unsur yok.", "Emredici kurala aykırı.", "İrade sakatlığı.", "Onay eksik."],
          },
        },
      ],
    },
  ],
} as LessonV3;

describe("dersi tekrarla", () => {
  it("aynı ders, şıklar başka sırayla; doğru cevap ve gerekçesi yine aynı şıkta", () => {
    const orders = new Set<string>();
    for (const salt of ["a", "b", "c", "d", "e", "f"]) {
      const replayed = replayLessonPayload({ type: "lesson", lesson, title: "Hükümsüzlük" }, salt)!;
      const check = screenCheck((replayed.lesson as LessonV3).screens[0]!)!;
      expect(replayed.replayed).toBe(true);
      expect(check.options![check.answerIndex!]).toBe("Yokluk");
      expect(check.optionWhy![check.answerIndex!]).toBe("Kurucu unsur yok.");
      expect([...check.options!].sort()).toEqual([...options].sort());
      orders.add(check.options!.join("|"));
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it("yazımı süren ders tekrarlanmaz; yazım ve devralma işaretleri yeni kayda taşınmaz", () => {
    expect(replayLessonPayload({ type: "lesson", lesson, building: true }, "x")).toBeNull();
    expect(replayLessonPayload({ type: "quiz", questions: [] }, "x")).toBeNull();
    const replayed = replayLessonPayload({ type: "lesson", lesson, builtAt: "t", upcoming: ["A"], adoptedPrefetch: true, truncated: true }, "x")!;
    expect(replayed).not.toHaveProperty("builtAt");
    expect(replayed).not.toHaveProperty("upcoming");
    expect(replayed).not.toHaveProperty("adoptedPrefetch");
  });

  it("sonuç sayfası ve ders sonu ekranı aynı dersi açar; 'Farklı anlat' yeniden yazdırır", () => {
    const result = read("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/sonuc/page.tsx");
    expect(result).toContain('node.kind === "lesson" ? examPrepLessonReplayHref(prepId, nodeId)');
    expect(result).toContain("Farklı anlat");
    const session = read("src/components/parity/exam-node-session.tsx");
    expect(session).toContain('if (kind === "lesson") void start({ replay: true });');
    expect(session).toContain('...(kind === "lesson" && overrides?.replay ? { replay: true } : {}),');
    const route = read("src/app/api/learning/exam-prep/node/route.ts");
    expect(route).toContain("parsed.data.replay === true");
    // Kredi ayrılmaz: tekrar bölümünde reserveCredits yok.
    const block = route.slice(route.indexOf("parsed.data.replay === true"), route.indexOf('console.info("lesson_replayed"'));
    expect(block).not.toContain("reserveCredits");
  });
});
