import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  outlineOversizedTopics,
  oversizeRepairLines,
  spanTooWide,
} from "@/lib/documents/outline-oversize";

vi.mock("@/lib/ai/generate", () => ({
  generateJson: vi.fn(),
  isPremiumUser: vi.fn(async () => false),
}));
vi.mock("@/lib/env", () => ({
  env: {
    OPENAI_STANDARD_MODEL: "gpt-4o-mini",
    OPENAI_OUTLINE_STANDARD_MODEL: "gpt-4o-mini",
    OPENAI_OUTLINE_LARGE_MODEL: "gpt-4.1",
    OPENAI_OUTLINE_FALLBACK_MODEL: "gpt-4.1-mini",
  },
}));

import { generateJson } from "@/lib/ai/generate";
import {
  OUTLINE_GRANULARITY_RULE,
  pageTextMapFromFiles,
  prepareOutlineMaterial,
  runOutlineStep,
  validateOneShotOutline,
  type OneShotOutlineDraft,
  type OutlineProgress,
  type OutlineStepResult,
} from "@/lib/documents/outline-oneshot";

const mockedGenerate = vi.mocked(generateJson);

/*
  Geniş konu kapısı (25 Ekim 2026): belgenin dörtte birini tutan üniteler tek "… Temel Kavramları"
  konusuna sıkışıyordu. Kapı yalnız sayfa payı, belgenin kendi başlıkları ve kardeş konu yoğunluğuyla
  karar verir — aynı kurallar farklı derslerde aynı sonucu vermeli.
*/

/** Her bölüm `perChapter` sayfa; bölümün ilk sayfasında numaralı başlık, gövdede başlığın kelimeleri. */
function book(chapters: string[], perChapter = 5, charsPerPage = 1_400) {
  const pages: { pageNumber: number; text: string }[] = [];
  chapters.forEach((title, c) => {
    for (let k = 0; k < perChapter; k += 1) {
      const n = c * perChapter + k + 1;
      const head = k === 0 ? `${c + 1}. ${title}\n` : "";
      const body = `${title} konusunda tanımlar, örnekler ve kurallar anlatılır. `.repeat(40);
      pages.push({ pageNumber: n, text: `${head}${body}`.slice(0, charsPerPage) });
    }
  });
  return pages;
}

const SUBJECTS: Record<string, string[]> = {
  fizik: ["Kuvvet ve Hareket", "Enerji Korunumu", "Elektrik Akımı", "Dalgalar"],
  tarih: ["Osmanlı Kuruluş Dönemi", "Yükselme Dönemi Siyaseti", "Duraklama Dönemi Islahatları", "Dağılma Dönemi Antlaşmaları"],
  hukuk: ["Hukukun Kaynakları", "Kişiler Hukuku", "Borçlar Hukuku", "Eşya Hukuku"],
  biyoloji: ["Hücre Zarı Yapısı", "Mitoz Bölünme", "Mayoz Bölünme", "Kalıtım İlkeleri"],
};

function umbrella(pages: { pageNumber: number }[], title: string) {
  return [{ title: "Ünite", topics: [{ title, fileIndex: 0, pageNumbers: pages.map((p) => p.pageNumber) }] }];
}

describe("geniş konu kapısı — ders bağımsız", () => {
  for (const [subject, chapters] of Object.entries(SUBJECTS)) {
    it(`${subject}: 20 sayfanın tamamını tutan şemsiye konu bölünmeli`, () => {
      const pages = book(chapters);
      const flagged = outlineOversizedTopics(umbrella(pages, "Temel Kavramlar ve İlkeler"), [{ pages }]);
      expect(flagged).toHaveLength(1);
      expect(flagged[0]!.reason).toBe("chapters");
      expect(flagged[0]!.headings.length).toBeGreaterThanOrEqual(2);
    });

    it(`${subject}: her bölüm kendi konusu olunca kapı geçer`, () => {
      const pages = book(chapters);
      const units = [
        {
          title: "Ünite",
          topics: chapters.map((title, c) => ({
            title,
            fileIndex: 0,
            pageNumbers: [1, 2, 3, 4, 5].map((k) => c * 5 + k),
          })),
        },
      ];
      expect(outlineOversizedTopics(units, [{ pages }])).toEqual([]);
    });
  }

  it("kısa dosya (≤ 8 sayfa) tek konulu kalabilir", () => {
    const pages = book(["Kuvvet ve Hareket", "Enerji Korunumu"], 2);
    expect(outlineOversizedTopics(umbrella(pages, "Fizik"), [{ pages }])).toEqual([]);
  });

  it("başlıksız 20 sayfada da sayfa payı kuralı çalışır (%15 ve en az 8 sayfa)", () => {
    const pages = Array.from({ length: 20 }, (_, i) => ({ pageNumber: i + 1, text: "Düz metin. ".repeat(100) }));
    const units = [
      {
        title: "Ünite",
        topics: [
          { title: "A", fileIndex: 0, pageNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
          { title: "B", fileIndex: 0, pageNumbers: [11, 12] },
          { title: "C", fileIndex: 0, pageNumbers: [13, 14] },
        ],
      },
    ];
    const flagged = outlineOversizedTopics(units, [{ pages }]);
    expect(flagged.map((t) => [t.title, t.reason])).toEqual([["A", "share"]]);
    expect(spanTooWide(3, 20)).toBe(false);
    expect(spanTooWide(8, 20)).toBe(true);
    expect(spanTooWide(8, 8)).toBe(false);
  });

  it("kardeşlerin iki katından yoğun konu işaretlenir", () => {
    const pages = Array.from({ length: 60 }, (_, i) => ({ pageNumber: i + 1, text: "Metin. ".repeat(100) }));
    const units = [
      {
        title: "Ünite",
        topics: [
          { title: "Geniş", fileIndex: 0, pageNumbers: [1, 2, 3, 4, 5, 6, 7] },
          { title: "B", fileIndex: 0, pageNumbers: [8, 9] },
          { title: "C", fileIndex: 0, pageNumbers: [10, 11, 12] },
        ],
      },
    ];
    expect(outlineOversizedTopics(units, [{ pages }]).map((t) => t.reason)).toEqual(["density"]);
  });

  it("konunun kendi başlığı ve sonraki bölümün sınır sayfası bölme sebebi değildir", () => {
    const pages = book(["Kuvvet ve Hareket", "Enerji Korunumu", "Elektrik Akımı", "Dalgalar"]);
    const units = [{ title: "Fizik", topics: [{ title: "Kuvvet ve Hareket", fileIndex: 0, pageNumbers: [1, 2, 3, 4, 5, 6] }] }];
    expect(outlineOversizedTopics(units, [{ pages }])).toEqual([]);
  });

  it("onarım talimatı 2-4 ayrık konu ister ve aralıktaki başlıkları sayar", () => {
    const pages = book(SUBJECTS.tarih!);
    const text = oversizeRepairLines(outlineOversizedTopics(umbrella(pages, "Osmanlı Tarihi"), [{ pages }]));
    expect(text).toContain("2-4 ayrı konuya böl");
    expect(text).toContain("Yükselme Dönemi Siyaseti");
  });

  it("istem şemsiye başlığı ve %15 kuralını içerir", () => {
    expect(OUTLINE_GRANULARITY_RULE).toContain("%15");
    expect(OUTLINE_GRANULARITY_RULE).toContain("Şemsiye başlık YASAK");
  });
});

describe("birim kurtarma geniş aralığı tek konuya birleştirmez", () => {
  it("20 sayfalık dosyada 10 sayfayı tutan ünite kurtarılmaz, onarım istenir", () => {
    const pages = book(SUBJECTS.hukuk!);
    const pageTexts = pageTextMapFromFiles([{ fileName: "x.pdf", pages }]);
    const draft = {
      units: [
        {
          title: "Hukukun Kaynakları",
          topics: [
            { title: "Uzay Hukuku Antlaşmaları", whyLearn: "", pageStart: 1, pageEnd: 5, likelyAsked: [] },
            { title: "Deniz Ticaret Navlunu", whyLearn: "", pageStart: 6, pageEnd: 10, likelyAsked: [] },
          ],
        },
        {
          title: "Borçlar",
          topics: [{ title: "Borçlar Hukuku", whyLearn: "", pageStart: 11, pageEnd: 15, likelyAsked: [] }],
        },
      ],
    } as unknown as OneShotOutlineDraft;
    const result = validateOneShotOutline(draft, { filePageCounts: [20], pageTexts });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dropped.some((i) => i.code === "unit_rescued")).toBe(false);
    expect(result.dropped.some((i) => i.code === "unit_rescue_blocked")).toBe(true);
  });
});

describe("güçlü modelin şemsiye konusu onarıma gider", () => {
  beforeEach(() => {
    mockedGenerate.mockReset();
  });

  function draftOf(topics: [string, number, number][]): OneShotOutlineDraft {
    return {
      units: [
        {
          title: "Fizik",
          examWeight: "high",
          topics: topics.map(([title, pageStart, pageEnd], i) => ({
            id: `t${i + 1}`,
            title,
            whyLearn: "Öğreneceksin.",
            description: "",
            fileIndex: 0,
            pageStart,
            pageEnd,
            examWeight: "high",
            likelyAsked: [],
            prerequisiteIds: [],
          })),
        },
      ],
    } as OneShotOutlineDraft;
  }

  it("20 sayfada tek konu → onarım bölünmüş haritayı tutar", async () => {
    const chapters = SUBJECTS.fizik!;
    const material = prepareOutlineMaterial([{ fileName: "fizik.pdf", pages: book(chapters) }]);
    const prompts: string[] = [];
    mockedGenerate.mockImplementation(async (params) => {
      prompts.push(String(params.userPrompt));
      const d =
        prompts.length === 1
          ? draftOf([["Temel Tanımlar ve Kurallar", 1, 20]])
          : draftOf(chapters.map((title, c) => [title, c * 5 + 1, c * 5 + 5] as [string, number, number]));
      return { ok: true, data: params.parse(d), reservationId: `r-${prompts.length}` } as never;
    });
    let progress: OutlineProgress = { stage: "first" };
    let result: OutlineStepResult | null = null;
    for (let step = 1; step <= 6; step += 1) {
      result = await runOutlineStep({
        service: {} as never,
        userId: "u1",
        material,
        progress,
        keyFor: (stage) => `k:${step}:${stage}`,
        deadlineAt: Date.now() + 300_000,
      });
      if (result.kind !== "continue") break;
      progress = result.progress;
    }
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("GENİŞ KONULAR — BÖL");
    expect(result?.kind).toBe("done");
    if (result?.kind !== "done") return;
    expect(result.path).toBe("repair");
    expect(result.map.kept).toBe(4);
  });
});
