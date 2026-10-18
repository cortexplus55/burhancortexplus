import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FULL_PAGE_CHARS,
  minTopicsForMaterial,
  minTopicsForPages,
  outlineTooThin,
  prepareOutlineMaterial,
  runOutlineStep,
  type OneShotOutlineDraft,
  type OutlineProgress,
  type OutlineStepResult,
} from "@/lib/documents/outline-oneshot";

/*
  İnce konu haritası (18 Ekim 2026): 20 sayfalık trigonometri notu (her sayfada başlık,
  temiz metin, ~28 bin karakter) gpt-4o-mini'den 3 sn'de TEK konu olarak döndü; doğrulama
  hiçbir şey düşürmedi, 1/1 "yeterince iyi" sayıldı ve öğrenci bütün dosya için tek konulu
  yol aldı (Astra aynı PDF'ten 7 konu çıkardı). `goodEnough` yalnız tutulan/önerilen oranına
  bakar; önerinin kendisinin ince olduğunu bu kat görür — sayfa sayısı VE metin hacmiyle,
  ikisinin küçüğüyle — ve mini'nin haritası güçlü modele yükseltilir. Güçlü modelin ince
  haritası kabul edilir: tek konulu dosya olur, soracak daha iyi model yok.
*/
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

const mockedGenerate = vi.mocked(generateJson);

/** Full pages: a heading plus enough running text to count as a page of a real note. */
function trigPages(count: number, charsPerPage = 1_400) {
  const sentence = "Trigonometri açı derece radyan birim çember sinüs kosinüs tanjant oranları anlatılır. ";
  return Array.from({ length: count }, (_, i) => ({
    pageNumber: i + 1,
    text: `Sayfa ${i + 1} başlığı. ${sentence.repeat(Math.ceil(charsPerPage / sentence.length))}`.slice(0, charsPerPage),
  }));
}

function draft(topicCount: number): OneShotOutlineDraft {
  return {
    units: [
      {
        title: "Trigonometri",
        examWeight: "high",
        topics: Array.from({ length: topicCount }, (_, i) => ({
          id: `t${i + 1}`,
          title: i === 0 ? "Açı Derece Radyan" : `Sinüs Kosinüs Birim Çember ${i + 1}`,
          whyLearn: "Açı ölçülerini dönüştüreceksin.",
          description: "Açı",
          fileIndex: 0,
          pageStart: i + 1,
          pageEnd: i + 1,
          examWeight: "high",
          likelyAsked: ["Derece radyan dönüşümü"],
          prerequisiteIds: [],
        })),
      },
    ],
  } as OneShotOutlineDraft;
}

async function runToEnd(
  pages: { pageNumber: number; text: string }[],
): Promise<{ result: OutlineStepResult }> {
  const material = prepareOutlineMaterial([{ fileName: "trig.pdf", pages }]);
  let progress: OutlineProgress = { stage: "first" };
  for (let steps = 1; steps <= 6; steps += 1) {
    const result = await runOutlineStep({
      service: {} as never,
      userId: "u1",
      material,
      progress,
      keyFor: (stage, part) => `outline:trig:${steps}:${stage}${part ? `:part${part}` : ""}`,
      deadlineAt: Date.now() + 300_000,
    });
    if (result.kind !== "continue") return { result };
    progress = result.progress;
  }
  throw new Error("outline did not settle");
}

describe("ince konu haritası: taban", () => {
  it("sayfa tabanı: 3'e kadar 1, 8'e kadar 2, sonra sayfa/5 (en çok 8)", () => {
    expect(minTopicsForPages(1)).toBe(1);
    expect(minTopicsForPages(3)).toBe(1);
    expect(minTopicsForPages(4)).toBe(2);
    expect(minTopicsForPages(8)).toBe(2);
    expect(minTopicsForPages(10)).toBe(2);
    expect(minTopicsForPages(20)).toBe(4);
    expect(minTopicsForPages(30)).toBe(6);
    expect(minTopicsForPages(200)).toBe(8);
  });

  it("metin hacmi sayfa sayısını aşağı çeker: iki satırlık 28 sayfa ince sayılmaz", () => {
    // Canlı trigonometri notu: 20 sayfa, 28.059 karakter → 4 konu tabanı.
    expect(minTopicsForMaterial({ pageCount: 20, corpusChars: 28_059 })).toBe(4);
    // Test fikstürü: 28 sayfa × ~70 karakter → metin iki sayfa bile değil → taban 1.
    expect(minTopicsForMaterial({ pageCount: 28, corpusChars: 2_000 })).toBe(1);
    // Az sayfa, çok metin: sayfa sayısı sınırlar.
    expect(minTopicsForMaterial({ pageCount: 2, corpusChars: 40 * FULL_PAGE_CHARS })).toBe(1);
  });

  it("outlineTooThin tutulan sayıyı tabanla kıyaslar", () => {
    const material = { pageCount: 20, corpusChars: 28_059 };
    const candidate = { units: [], kept: 1, proposed: 1, dropped: 0, model: "m", reservationIds: [] };
    expect(outlineTooThin(candidate, material)).toBe(true);
    expect(outlineTooThin({ ...candidate, kept: 4 }, material)).toBe(false);
    expect(outlineTooThin(null, material)).toBe(false);
  });
});

describe("ince konu haritası: mini yükseltilir, güçlü model kabul edilir", () => {
  beforeEach(() => {
    mockedGenerate.mockReset();
  });

  it("20 dolu sayfada mini 1 konu verince güçlü modele geçer; güçlü 7 konu verince o kalır", async () => {
    const models: string[] = [];
    mockedGenerate.mockImplementation(async (params) => {
      models.push(String(params.modelOverride));
      const count = params.modelOverride === "gpt-4o-mini" ? 1 : 7;
      return { ok: true, data: params.parse(draft(count)), reservationId: `r-${models.length}` } as never;
    });
    const { result } = await runToEnd(trigPages(20));
    expect(models).toEqual(["gpt-4o-mini", "gpt-4.1"]);
    expect(result.kind).toBe("done");
    if (result.kind !== "done") return;
    expect(result.path).toBe("escalate");
    expect(result.map.kept).toBe(7);
    expect(result.map.model).toBe("gpt-4.1");
    // Mini's thin draft is released once the strong map is kept.
    expect(result.release).toEqual(["r-1"]);
  });

  it("güçlü model de 1 konu verirse kabul edilir (tek konulu dosya olabilir)", async () => {
    const models: string[] = [];
    mockedGenerate.mockImplementation(async (params) => {
      models.push(String(params.modelOverride));
      return { ok: true, data: params.parse(draft(1)), reservationId: `r-${models.length}` } as never;
    });
    const { result } = await runToEnd(trigPages(20));
    expect(models).toEqual(["gpt-4o-mini", "gpt-4.1"]);
    expect(result.kind).toBe("done");
    if (result.kind === "done") {
      expect(result.map.kept).toBe(1);
      expect(result.map.model).toBe("gpt-4.1");
    }
  });

  it("mini yeterli konu verince yükseltme yok", async () => {
    const models: string[] = [];
    mockedGenerate.mockImplementation(async (params) => {
      models.push(String(params.modelOverride));
      return { ok: true, data: params.parse(draft(5)), reservationId: "r-mini" } as never;
    });
    const { result } = await runToEnd(trigPages(20));
    expect(models).toEqual(["gpt-4o-mini"]);
    expect(result.kind).toBe("done");
    if (result.kind === "done") expect(result.map.kept).toBe(5);
  });

  it("kısa belgede (2 dolu sayfa) ya da az metinli 20 sayfada mini'nin tek konusu yeterlidir", async () => {
    const models: string[] = [];
    mockedGenerate.mockImplementation(async (params) => {
      models.push(String(params.modelOverride));
      return { ok: true, data: params.parse(draft(1)), reservationId: "r-mini" } as never;
    });
    expect((await runToEnd(trigPages(2))).result.kind).toBe("done");
    expect((await runToEnd(trigPages(20, 90))).result.kind).toBe("done");
    expect(models).toEqual(["gpt-4o-mini", "gpt-4o-mini"]);
  });
});
