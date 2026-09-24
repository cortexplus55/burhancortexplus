import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { zipSync, strToU8 } from "fflate";
import { extractOfficeText } from "@/lib/documents/extract-office-text";
import { analyzePages } from "@/lib/documents/page-analysis";
import { topicTitleIssues } from "@/lib/documents/topic-title";

/**
 * Office konusu haritası.
 *
 * Canlıda küçük bir .docx "1 sayfa · Belgen hazır · Harita başarısız ·
 * Konular çıkarılamadı" diyordu. Metin çıkmıştı; harita iki öğretim
 * sayfası şart koştuğu için Word'ün tek sayfasında hiç kurulmuyordu.
 * Kısa slaytlar da 40 karakterin altında "okunamadı" sayılıp aynı
 * kapıdan dönüyordu.
 */

const gate = vi.hoisted(() => ({
  topics: [] as {
    title: string;
    learningObjective: string | null;
    pageNumbers: number[];
  }[],
  prompt: "",
  calls: 0,
  explode: false,
}));

vi.mock("@/lib/ai/generate", () => ({
  isPremiumUser: async () => false,
  generateJson: async (params: {
    parse: (raw: unknown) => unknown;
    userPrompt: string;
  }) => {
    gate.calls += 1;
    gate.prompt = params.userPrompt;
    if (gate.explode) throw new Error("insufficient_credits");
    const data = params.parse({ topics: gate.topics });
    if (data) return { ok: true, data };
    return { ok: false, status: 422, error: "rejected" };
  },
}));

import { buildTopicMapLLM } from "@/lib/documents/topic-map-llm";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const service = {} as SupabaseClient;

const docx = (paragraphs: string[]) =>
  Buffer.from(
    zipSync({
      "word/document.xml": strToU8(
        `<?xml version="1.0"?><w:document><w:body>${paragraphs
          .map((text) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`)
          .join("")}</w:body></w:document>`,
      ),
    }),
  );

const pptx = (slides: string[]) =>
  Buffer.from(
    zipSync(
      Object.fromEntries(
        slides.map((text, index) => [
          `ppt/slides/slide${index + 1}.xml`,
          strToU8(
            `<?xml version="1.0"?><p:sld><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:sld>`,
          ),
        ]),
      ),
    ),
  );

function topic(
  title: string,
  pageNumbers: number[],
  learningObjective = "Bu konunun ayırıcı fikrini kendi cümlesiyle anlatır",
) {
  return { title, learningObjective, pageNumbers };
}

async function mapFrom(fileName: string, pages: string[]) {
  return buildTopicMapLLM(
    service,
    "doc-office",
    "user-office",
    fileName,
    analyzePages(pages),
  );
}

beforeEach(() => {
  gate.topics = [];
  gate.prompt = "";
  gate.calls = 0;
  gate.explode = false;
});

const sampleDocx = readFileSync("tests/fixtures/office/ornek-ders.docx");
const samplePptx = readFileSync("tests/fixtures/office/ornek-slayt.pptx");

describe("Office belgesi konu haritası", () => {
  it("sayfa sonu olmayan Word notundan tek konu çıkarır", async () => {
    const tail = "Sondaki özgün cümle klorofil ışığı soğurur.";
    const paragraphs = [
      ...Array.from(
        { length: 24 },
        (_, i) =>
          `Paragraf ${i} mitozun vücut hücrelerinde kromozom sayısını koruduğunu anlatır.`,
      ),
      tail,
    ];
    const extracted = extractOfficeText(docx(paragraphs), DOCX);
    expect(extracted.ok).toBe(true);
    expect(extracted.pages).toHaveLength(1);

    gate.topics = [topic("Hücre Bölünmesi", [9])];
    const result = await mapFrom("ornek-ders.docx", extracted.pages);

    expect(result).not.toBeNull();
    expect(result!.topics.map((item) => item.title)).toEqual(["Hücre Bölünmesi"]);
    expect(result!.topics[0].pageNumbers).toEqual([1]);
    expect(gate.prompt).toContain(tail);
    expect(gate.prompt).toContain("mitozun");
  });

  it("kısa slaytlardan konu haritası kurar", async () => {
    const slides = ["Mitoz kromozomları ayırır", "Mayoz gamet üretir"];
    const extracted = extractOfficeText(pptx(slides), PPTX);
    expect(extracted.ok).toBe(true);
    expect(extracted.pages).toHaveLength(2);
    const analyses = analyzePages(extracted.pages);
    expect(analyses.every((page) => page.pageKind === "unreadable")).toBe(true);

    gate.topics = [topic("Mitoz ve Mayoz", [1, 2])];
    const result = await mapFrom("ornek-slayt.pptx", extracted.pages);

    expect(result).not.toBeNull();
    expect(result!.topics).toHaveLength(1);
    expect(result!.topics[0].title).toBe("Mitoz ve Mayoz");
    expect(result!.topics[0].pageNumbers).toEqual([1, 2]);
    expect(gate.prompt).toContain("Mitoz kromozomları ayırır");
    expect(gate.prompt).toContain("Mayoz gamet üretir");
  });

  it("birkaç slaytlık sunumda birden fazla konuyu da tutar", async () => {
    const slides = [
      "Hücre zarı seçici geçirgendir ve madde alışverişini protein kanallarıyla düzenler.",
      "Mitokondri hücresel solunumla ATP üretir ve çift zarla çevrilidir.",
    ];
    const extracted = extractOfficeText(pptx(slides), PPTX);
    expect(extracted.pages).toHaveLength(2);

    gate.topics = [
      topic("Hücre Zarının Yapısı", [1]),
      topic("Enerji Üreten Organeller", [2]),
    ];
    const result = await mapFrom("hucre.pptx", extracted.pages);

    expect(result).not.toBeNull();
    expect(result!.topics.map((item) => item.title)).toEqual([
      "Hücre Zarının Yapısı",
      "Enerji Üreten Organeller",
    ]);
  });
});

describe("PDF konu haritası gerilemez", () => {
  const page = (sentence: string) =>
    `${sentence} `.repeat(12);

  const pdfPages = [
    page("Hücre zarı seçici geçirgendir ve madde alışverişini düzenler."),
    page("Sitoplazma organelleri bir arada tutan sıvı ortamdır."),
    page("Çekirdek kalıtım bilgisini DNA olarak saklar."),
    page("Mitokondri hücresel solunumla ATP üretir."),
  ];

  it("uzun belgede tek konuyu kabul etmez", async () => {
    gate.topics = [topic("Hücre Zarının Yapısı", [1, 2, 3, 4])];
    const result = await mapFrom("biyoloji.pdf", pdfPages);
    expect(gate.calls).toBe(1);
    expect(result).toBeNull();
  });

  it("uzun belgede sayfalara yayılan konuları kurar", async () => {
    const marker = "YALNIZCA_SAYFA_SONUNDA";
    const pages = [
      `${"Hücre zarı seçici geçirgendir. ".repeat(40)}${marker}`,
      ...pdfPages.slice(1),
    ];
    gate.topics = [
      topic("Hücre Zarının Yapısı", [1, 2]),
      topic("Enerji Üreten Organeller", [3, 4]),
    ];
    const result = await mapFrom("biyoloji.pdf", pages);

    expect(result).not.toBeNull();
    expect(result!.topics.map((item) => item.title)).toEqual([
      "Hücre Zarının Yapısı",
      "Enerji Üreten Organeller",
    ]);
    expect(result!.topics[0].pageNumbers).toEqual([1, 2]);
    expect(result!.topics[1].pageNumbers).toEqual([3, 4]);
    // Çok sayfalı özet hâlâ sayfa başına kısa kalır.
    expect(gate.prompt).not.toContain(marker);
  });

  it("okunacak metni olmayan sayfada modele gitmez", async () => {
    const result = await mapFrom("bos.pdf", ["", "ab"]);
    expect(result).toBeNull();
    expect(gate.calls).toBe(0);
  });

  it("model susunca uzun PDF'e metinden konu yazmaz", async () => {
    gate.explode = true;
    const result = await mapFrom("biyoloji.pdf", pdfPages);
    expect(gate.calls).toBe(1);
    expect(result).toBeNull();
  });
});

describe("canlı Office örnekleri", () => {
  it("model boş dönse de sayfa sonu olmayan Word notundan konu çıkarır", async () => {
    const extracted = extractOfficeText(sampleDocx, DOCX);
    expect(extracted.ok).toBe(true);
    expect(extracted.pages).toHaveLength(1);
    expect(extracted.pages[0]).toContain("Termodinamik");
    expect(extracted.pages[0]).toContain("Birinci yasa");

    const result = await mapFrom("ornek-ders.docx", extracted.pages);

    expect(gate.calls).toBe(1);
    expect(result).not.toBeNull();
    expect(result!.topics).toHaveLength(1);
    expect(result!.topics[0].title).toContain("Termodinamik");
    expect(result!.topics[0].pageNumbers).toEqual([1]);
    expect(topicTitleIssues(result!.topics[0].title)).toEqual([]);
    expect(result!.topics[0].title.toLocaleLowerCase("tr")).not.toContain("sayfa");
  });

  it("model hata fırlatınca da aynı Word notunu konuya bağlar", async () => {
    gate.explode = true;
    const extracted = extractOfficeText(sampleDocx, DOCX);
    const result = await mapFrom("ornek-ders.docx", extracted.pages);

    expect(result).not.toBeNull();
    expect(result!.topics[0].title).toContain("Termodinamik");
    expect(result!.topics[0].learningObjective?.toLocaleLowerCase("tr")).toContain(
      "enerji",
    );
  });

  it("tek slaytlık sunumda model susunca slaytın kendi başlığını kullanır", async () => {
    const extracted = extractOfficeText(samplePptx, PPTX);
    expect(extracted.ok).toBe(true);
    expect(extracted.pages).toHaveLength(1);
    expect(extracted.pages[0]).toContain("Entropi");

    const result = await mapFrom("ornek-slayt.pptx", extracted.pages);

    expect(result).not.toBeNull();
    expect(result!.topics).toHaveLength(1);
    expect(result!.topics[0].title).toBe("Entropi nedir");
    expect(result!.topics[0].pageNumbers).toEqual([1]);
    expect(topicTitleIssues(result!.topics[0].title)).toEqual([]);
    expect(result!.topics[0].learningObjective).toContain("İkinci yasa");
  });

  it("soru işaretli model başlığını düşürmez, sayfa numarasız taslağı tek sayfaya bağlar", async () => {
    const extracted = extractOfficeText(samplePptx, PPTX);
    gate.topics = [
      {
        title: "Entropi nedir?",
        learningObjective: "ab",
        pageNumbers: [],
      },
    ];

    const result = await mapFrom("ornek-slayt.pptx", extracted.pages);

    expect(result).not.toBeNull();
    expect(result!.topics[0].title).toBe("Entropi nedir");
    expect(result!.topics[0].pageNumbers).toEqual([1]);
    // Model bir başlık verdi; dosya adıyla değiştirilmez.
    expect(result!.topics[0].title).not.toBe("Ornek Slayt");
    expect(result!.topics[0].learningObjective).toBeNull();
  });

  it("model 'Sayfa' başlığı verirse belgenin cümlesine döner", async () => {
    const extracted = extractOfficeText(sampleDocx, DOCX);
    gate.topics = [topic("Sayfa 1", [1])];

    const result = await mapFrom("ornek-ders.docx", extracted.pages);

    expect(result).not.toBeNull();
    expect(result!.topics[0].title).toContain("Termodinamik");
    expect(result!.topics[0].title.toLocaleLowerCase("tr")).not.toMatch(/^sayfa/);
  });
});
