import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  flattenLines,
  formatClock,
  lineAt,
  normalizeChapters,
  splitSentences,
  totalDurationMs,
} from "@/lib/learning/podcast-script";

describe("splitSentences", () => {
  it("cümleleri ayırır", () => {
    expect(splitSentences("Merhaba. Bugün türev var! Hazır mısın?")).toEqual([
      "Merhaba.",
      "Bugün türev var!",
      "Hazır mısın?",
    ]);
  });

  // Ondalıktan bölerse ses parçası sayının ortasından başlar.
  it("ondalık sayıda bölmez", () => {
    expect(splitSentences("Pi sayısı 3.14 kadardır.")).toEqual([
      "Pi sayısı 3.14 kadardır.",
    ]);
  });

  it("kısaltmalarda bölmez", () => {
    expect(splitSentences("Elma, armut vb. meyveler. Sonra devam.")).toEqual([
      "Elma, armut vb. meyveler.",
      "Sonra devam.",
    ]);
  });

  it("sıra sayısında bölmez", () => {
    expect(splitSentences("Bu konu 9. sınıfta işlenir.")).toEqual([
      "Bu konu 9. sınıfta işlenir.",
    ]);
  });

  it("noktasız son parçayı da alır", () => {
    expect(splitSentences("Bitti. Son cümle noktasız")).toEqual([
      "Bitti.",
      "Son cümle noktasız",
    ]);
  });

  it("boş metinde boş dizi", () => {
    expect(splitSentences("   ")).toEqual([]);
  });
});

describe("normalizeChapters", () => {
  it("konuşmacılı satırları alır ve çok cümleliyi böler", () => {
    const chapters = normalizeChapters([
      {
        title: "Giriş",
        lines: [
          { speaker: "ada", text: "Merhaba. Bugün türev." },
          { speaker: "kerem", text: "Başlayalım." },
        ],
      },
    ]);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].lines).toEqual([
      { speaker: "ada", text: "Merhaba." },
      { speaker: "ada", text: "Bugün türev." },
      { speaker: "kerem", text: "Başlayalım." },
    ]);
  });

  // Monoloğu iki sese bölmek konuşma uydurmak olurdu.
  it("eski script biçimini tek anlatıcıya çevirir", () => {
    const chapters = normalizeChapters([
      { title: "Eski", script: "Birinci cümle. İkinci cümle." },
    ]);
    expect(chapters[0].lines.every((l) => l.speaker === "ada")).toBe(true);
    expect(chapters[0].lines).toHaveLength(2);
  });

  it("tanınmayan konuşmacıda önceki sesi sürdürür", () => {
    const chapters = normalizeChapters([
      {
        title: "T",
        lines: [
          { speaker: "kerem", text: "Bir." },
          { speaker: "zzz", text: "İki." },
        ],
      },
    ]);
    expect(chapters[0].lines.map((l) => l.speaker)).toEqual(["kerem", "kerem"]);
  });

  it("boş bölümü atar ve bozuk girdide çökmez", () => {
    expect(normalizeChapters([{ title: "Boş", lines: [] }])).toEqual([]);
    expect(normalizeChapters(null)).toEqual([]);
    expect(normalizeChapters([null, 5, "x"])).toEqual([]);
  });

  it("başlıksız bölüme ad verir", () => {
    const chapters = normalizeChapters([{ lines: [{ speaker: "ada", text: "Bir." }] }]);
    expect(chapters[0].title).toBe("Bölüm");
  });
});

describe("zaman çizelgesi", () => {
  const chapters = normalizeChapters([
    { title: "A", lines: [{ speaker: "ada", text: "Bir. İki." }] },
    { title: "B", lines: [{ speaker: "kerem", text: "Üç." }] },
  ]);

  it("düz liste bölüm ve sırayı korur", () => {
    expect(flattenLines(chapters).map((l) => [l.chapterIndex, l.index])).toEqual([
      [0, 0],
      [0, 1],
      [1, 2],
    ]);
  });

  it("süreleri kümülatif toplar", () => {
    const timeline = buildTimeline(chapters, [1000, 2000, 500]);
    expect(timeline.map((l) => [l.startMs, l.endMs])).toEqual([
      [0, 1000],
      [1000, 3000],
      [3000, 3500],
    ]);
    expect(totalDurationMs(timeline)).toBe(3500);
  });

  it("ölçülemeyen süreyi sıfır sayar, çizelgeyi kaydırmaz", () => {
    const timeline = buildTimeline(chapters, [1000]);
    expect(timeline[2].endMs).toBe(1000);
  });

  it("ana denk gelen satırı bulur", () => {
    const timeline = buildTimeline(chapters, [1000, 2000, 500]);
    expect(lineAt(timeline, 0)).toBe(0);
    expect(lineAt(timeline, 999)).toBe(0);
    expect(lineAt(timeline, 1000)).toBe(1);
    expect(lineAt(timeline, 3400)).toBe(2);
    expect(lineAt(timeline, 3500)).toBe(-1);
    expect(lineAt(timeline, -1)).toBe(-1);
  });
});

describe("formatClock", () => {
  it("dakika:saniye biçimi", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65_000)).toBe("1:05");
    expect(formatClock(600_000)).toBe("10:00");
    expect(formatClock(-5)).toBe("0:00");
  });
});
