import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  foldHeadingKey,
  headingsInRange,
  nonChapterHeadings,
  outlineOversizedTopics,
  type OversizePage,
} from "@/lib/documents/outline-oversize";
import { isNumberedChapter } from "@/lib/documents/topic-title";
import { buildDocumentSkeleton, skeletonPromptBlock } from "@/lib/documents/outline-skeleton";

vi.mock("@/lib/ai/generate", () => ({
  generateJson: vi.fn(),
  isPremiumUser: vi.fn(async () => false),
}));
vi.mock("@/lib/env", () => ({
  env: {
    OPENAI_STANDARD_MODEL: "gpt-4o-mini",
    OPENAI_OUTLINE_STANDARD_MODEL: "gpt-4o-mini",
    OPENAI_OUTLINE_LARGE_MODEL: "gpt-6-luna",
    OPENAI_OUTLINE_FALLBACK_MODEL: "gpt-4.1-mini",
  },
}));

import { generateJson } from "@/lib/ai/generate";
import {
  outlineSplitNeeds,
  prepareOutlineMaterial,
  runOutlineStep,
  type OneShotOutlineDraft,
} from "@/lib/documents/outline-oneshot";

const mockedGenerate = vi.mocked(generateJson);
const read = (relative: string) => readFileSync(join(process.cwd(), relative), "utf8");

/*
  Harita hızı (31 Ekim 2026, canlı ölçüm): 65 sayfalık notun haritası ~110 sn (43 sn taslak + 66 sn tam onarım),
  30 fotoğrafınki ~60 sn (taslak + yama) sürdü. Sebepler: geniş konu kapısı her sayfadaki üst bilgiyi ve kutu
  etiketlerini "bölüm" saydı; "her alt bölüm ayrı konu" kuralı 40 konu sınırını aşan belgede de onarım açtı; kapsam
  haritadan sonra ölçülüp ikinci çağrı açıyordu; taslak varsayılan düşünmeyle yazılıyordu. Örnekler bilerek farklı
  derslerden (tarih, iktisat, elektrik).
*/

const HEADER = "KPSS Tarih · Osmanlı Devleti";
const BOX = "DİKKAT NOTU";
const body = (title: string) => `${title} konusunda tanımlar, kurallar ve örnekler sırayla anlatılır. `.repeat(20);

/** 12 sayfalık tarih notu: üst bilgi her sayfada, kutu etiketi dağınık, 2. bölümde numarası yeniden başlayan adımlar. */
function historyNote(): OversizePage[] {
  const pages: OversizePage[] = [];
  for (let n = 1; n <= 12; n += 1) {
    const headings = [HEADER];
    if (n === 1) headings.push("1. Kuruluş Dönemi");
    if (n === 6) headings.push("2. Yükselme Dönemi");
    if (n === 7) headings.push("1. Fetih Politikası", "2. Devşirme Sistemi");
    if (n === 10) headings.push("3. Duraklama Dönemi");
    if ([2, 5, 8, 11].includes(n)) headings.push(BOX);
    pages.push({ pageNumber: n, text: body(headings[headings.length - 1]!), headings });
  }
  return pages;
}

describe("geniş konu kapısı: üst bilgi, kutu etiketi ve liste adımı bölüm değildir", () => {
  it("dosya boyunca tekrarlanan satır ve numarası geri giden satır bölüm sayılmaz", () => {
    const file = { pages: historyNote() };
    const labels = nonChapterHeadings(file);
    expect(labels.has(foldHeadingKey(HEADER))).toBe(true);
    expect(labels.has(foldHeadingKey(BOX))).toBe(true);
    expect(labels.has(foldHeadingKey("1. Fetih Politikası"))).toBe(true);
    expect(labels.has(foldHeadingKey("2. Devşirme Sistemi"))).toBe(true);
    expect(labels.has(foldHeadingKey("2. Yükselme Dönemi"))).toBe(false);

    const { chapters } = headingsInRange(file, [6, 7, 8, 9]);
    expect(chapters).toEqual(["2. Yükselme Dönemi"]);
  });

  it("doğru konular 'böl' diye geri çevrilmez", () => {
    const file = { pages: historyNote() };
    const units = [
      {
        title: "Osmanlı Devleti",
        topics: [
          { title: "Kuruluş Dönemi", fileIndex: 0, pageNumbers: [1, 2, 3, 4, 5] },
          { title: "Yükselme Dönemi", fileIndex: 0, pageNumbers: [6, 7, 8, 9] },
          { title: "Duraklama Dönemi", fileIndex: 0, pageNumbers: [10, 11, 12] },
        ],
      },
    ];
    expect(outlineOversizedTopics(units, [file]).filter((topic) => topic.reason === "chapters")).toEqual([]);
  });

  it("art arda slaytlarda süren başlık (tek parça) bölüm kalır", () => {
    const pages: OversizePage[] = Array.from({ length: 10 }, (_, i) => ({
      pageNumber: i + 1,
      text: "Akım, gerilim ve direnç ilişkisi örneklerle anlatılır.",
      headings: [i >= 2 && i <= 4 ? "Kirchhoff Yasaları" : `Slayt Konusu ${i + 1}`],
    }));
    expect(nonChapterHeadings({ pages }).has(foldHeadingKey("Kirchhoff Yasaları"))).toBe(false);
  });

  it("numaralı liste cümlesi bölüm değildir; noktalı kısa başlık bölümdür", () => {
    expect(isNumberedChapter("3. Fiyatlar genel düzeyi sürekli olarak artar.")).toBe(false);
    expect(isNumberedChapter("2. Kuyruk → yığın dönüşümü")).toBe(false);
    expect(isNumberedChapter("3. Dane Boyu")).toBe(true);
    expect(isNumberedChapter("1. Giriş.")).toBe(true);
  });
});

/** `count` numaralı alt bölümlü tek dosya; her alt bölüm kendi sayfasında, öğretim işaretiyle. */
function subsectionNote(count: number) {
  const pages = Array.from({ length: count }, (_, i) => {
    const title = `${(i % 9) + 1}.${Math.floor(i / 9) + 1} Talep Esnekliği Türü ${i + 1}`;
    return {
      pageNumber: i + 1,
      text: `${title}\nTanım: ${"Talep esnekliği fiyat değişimine tepkiyi ölçer; örnek ve formül verilir. ".repeat(18)}`,
    };
  });
  return [{ fileName: "iktisat.pdf", pages }];
}

describe("belgenin başlıkları ilk istemde", () => {
  it("sınıra sığarsa her başlık ayrı konu; sığmazsa kısa ve doğal birleştirme", () => {
    const skeleton = buildDocumentSkeleton(subsectionNote(6));
    const fits = skeletonPromptBlock(skeleton, { maxTopics: 40 });
    expect(fits).toContain("BELGENİN KENDİ BAŞLIKLARI");
    expect(fits).toContain("Her biri ayrı bir konu");
    const crowded = skeletonPromptBlock(skeleton, { maxTopics: 3 });
    expect(crowded).toContain("en çok 8 kelime");
    expect(crowded).toContain("noktalı virgül yok");
  });
});

function draftFor(topics: [string, number, number][]): OneShotOutlineDraft {
  return {
    units: [
      {
        title: "İktisat",
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

describe("harita çağrısı", () => {
  beforeEach(() => {
    mockedGenerate.mockReset();
  });

  it("öğrenci beklerken düşük düşünme; ilk istemde başlık listesi; arkada varsayılan", async () => {
    const material = prepareOutlineMaterial(subsectionNote(6));
    const draft = draftFor(Array.from({ length: 6 }, (_, i) => [`Talep Esnekliği Türü ${i + 1}`, i + 1, i + 1]));
    mockedGenerate.mockImplementation(async (params) => ({ ok: true, data: params.parse(draft), reservationId: "r" }) as never);
    for (const urgent of [true, false]) {
      await runOutlineStep({
        service: {} as never,
        userId: "u1",
        material,
        progress: { stage: "first" },
        keyFor: (stage) => `k:${stage}`,
        deadlineAt: Date.now() + 300_000,
        urgent,
      });
    }
    const [urgentCall, backgroundCall] = mockedGenerate.mock.calls.map((call) => call[0]);
    expect(urgentCall!.reasoningEffort).toBe("low");
    expect(backgroundCall!.reasoningEffort).toBeUndefined();
    expect(String(urgentCall!.userPrompt)).toContain("BELGENİN KENDİ BAŞLIKLARI");
  });

  it("'her alt bölüm ayrı konu' kuralı başlıklar sınırı aşınca onarım açmaz", () => {
    const material = prepareOutlineMaterial(subsectionNote(45));
    const merged = Array.from({ length: 15 }, (_, i) => ({
      title: `Talep Esnekliği Türü ${i * 3 + 1} ve ${i * 3 + 2}`,
      fileIndex: 0,
      pageNumbers: [i * 3 + 1, i * 3 + 2, i * 3 + 3],
    }));
    const candidate = { units: [{ title: "İktisat", topics: merged }], kept: 15, proposed: 15, dropped: 0, model: "m", reservationIds: [] };
    expect(outlineSplitNeeds(candidate as never, material).some((topic) => topic.reason === "subsection")).toBe(false);
  });

  it("generateJson düşünme düzeyini yalnız akıl yürüten modele gönderir", () => {
    const source = read("src/lib/ai/generate.ts");
    expect(source).toContain('params.reasoningEffort && isReasoningModel(model) ? { reasoning_effort: params.reasoningEffort } : {}');
    expect(source.match(/\.\.\.effort,/g)).toHaveLength(2);
    const route = read("src/app/api/documents/process/route.ts");
    expect(route).toContain("urgent: Boolean(course) && !parsed.data.prepId");
  });
});
