import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { unitSubtopicsToShow } from "@/lib/learning/exam-wizard-copy";
import {
  consolidateFragmentedTopics,
  effectivePageCount,
  mainSessionSource,
  MAX_MAIN_UNITS,
  partParentKey,
  sameUnitTheme,
  unitCountBand,
  unitLessonGroups,
  unitRelatedness,
  UNIT_LESSON_MAX_PAGES,
  type ConsolidationDocument,
  type ConsolidationInput,
  type ConsolidationTopic,
  type ConsolidationUnit,
} from "@/lib/learning/topic-consolidation";
import {
  classifyPageKind,
  noisePageKind,
  pageUsableForLesson,
  storedPageKind,
} from "@/lib/documents/page-analysis";
import { planAddedMaterial, type IncomingPrepTopic } from "@/lib/learning/prep-add-material";
import { unitNodeRefreshes } from "@/lib/learning/prep-attach";
import { mergeStudyPathTemplate } from "@/lib/learning/exam-prep-plan";
import {
  buildExamScheduleV2,
  scheduleSessionsToNodeDrafts,
  topicLessonChunks,
  type ScheduleTopicInput,
} from "@/lib/learning/exam-schedule-v2";
import { parseSessionMeta } from "@/lib/learning/teaching-standards";
import { isUnitTopicRow, nodesUseUnits, parseSubtopics } from "@/lib/learning/unit-topic-row";
import { applyStudentTopicList } from "@/lib/learning/apply-prep-topics";
import { loadIntakeMainUnits } from "@/lib/learning/intake-outline";
import { loadPrepScheduleTopics } from "@/lib/learning/prep-schedule-topics";
import { packCourseRelation, packStageRelation, packTopicPerspective } from "@/lib/documents/outline-topic-meta";
import { asStage, oneShotJsonSchema, oneShotOutlineSchema } from "@/lib/documents/outline-oneshot";

/*
  Faz 10 (20 Kasım 2026): ana ünite modeli. Bütün örnekler yapay (topic-alpha, subtopic-1, doc-a.pdf, slide-b.pptx,
  photo-01.jpg); gerçek ders adı yok (bekçi `src-senaryo-sabitleri.test.ts`).
*/

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const chars = (pages: number[], each = 1_400) => Object.fromEntries(pages.map((page) => [page, each]));

function doc(documentId: string, kind: ConsolidationDocument["kind"], usable: number[], each = 1_400): ConsolidationDocument {
  return { documentId, kind, usablePages: usable, pageChars: chars(usable, each) };
}

function topic(title: string, documentId: string, fileName: string, pages: number[], nodeId: string): ConsolidationTopic {
  return { title, documentId, fileName, pages, nodeId };
}

/** Girdi konularının hepsi (gürültü olanlar hariç) tam bir kez bir üniteye girdi; hiçbir (belge, sayfa) kaybolmadı. */
function expectLossless(input: ConsolidationInput, result: ReturnType<typeof consolidateFragmentedTopics>) {
  const placed = result.units.flatMap((unit) => unit.topicIndexes).sort((a, b) => a - b);
  const expected = input.topics.map((_, index) => index).filter((index) => !result.droppedNoise.includes(index));
  expect(placed).toEqual(expected);
  const pagesIn = new Set(
    result.units.flatMap((unit) => unit.sourceRefs.flatMap((ref) => ref.pages.map((page) => `${ref.documentId}:${ref.nodeId}:${page}`))),
  );
  for (const index of expected) {
    const item = input.topics[index]!;
    for (const page of item.pages) expect(pagesIn.has(`${item.documentId}:${item.nodeId}:${page}`)).toBe(true);
  }
  const subtopics = result.units.flatMap((unit) => unit.subtopics.map((title) => title.toLocaleLowerCase("tr")));
  for (const index of expected) {
    expect(subtopics).toContain(input.topics[index]!.title.toLocaleLowerCase("tr"));
  }
}

describe("gürültü sayfaları (Faz 10)", () => {
  it("kaynakça, başlıksız cevap ızgarası ve yalnız başlık sayfası öğretilmez", () => {
    const bibliography = ["References", "Author A. (2019). Book one. Publisher-x.", "Author B. (2020). Book two. Press.",
      "Author C. (2021). Book three. doi:10.1/x", "Author D. (2018). Book four, pp. 12-30.", "Author E. (2017). https://example.org"].join("\n");
    expect(classifyPageKind(bibliography, 12)).toBe("bibliography");
    expect(noisePageKind(["Author A. (2019). Book one.", "Author B. (2020). Book two.", "Author C. (2021). Book three.",
      "Author D. (2018). Book four.", "Author E. (2017). Book five."].join("\n"))).toBe("bibliography");
    expect(classifyPageKind("1-A 2-C 3-B 4-D 5-E 6-A 7-B 8-C 9-D 10-E", 9)).toBe("answer_key");
    expect(classifyPageKind("Topic Alpha", 3)).toBe("title_only");
    expect(classifyPageKind("2. Topic Alpha\nSubtopic One", 4)).toBe("title_only");
    // Kısa ama bilgi taşıyan slayt içeriktir: bağıntı, rakam, iki nokta ya da yüklem.
    expect(classifyPageKind("x = 2y + 1", 5)).not.toBe("title_only");
    expect(classifyPageKind("Subtopic one: three stages", 5)).not.toBe("title_only");
    expect(noisePageKind("Alfa kuralı her durumda geçerlidir")).toBeNull();
    // Gövdesinde "kaynakça" geçen öğretim sayfası kaynakça değildir.
    const body = "Bu bölümde topic-alpha ele alınır. Ayrıntılı kaynakça listesi kitabın sonundadır. " + "Uzun açıklama. ".repeat(20);
    expect(classifyPageKind(body, 6)).toBe("content");
  });

  it("yeni türler veritabanına CHECK listesindeki karşılığıyla yazılır, okuyucu metinden yeniden tanır", () => {
    expect(storedPageKind("bibliography")).toBe("answer_key");
    expect(storedPageKind("title_only")).toBe("uncertain");
    expect(storedPageKind("content")).toBe("content");
    // Eski kayıt "uncertain" dese de metin yalnız başlıksa ders okumaz.
    expect(pageUsableForLesson({ text_content: "Topic Alpha", page_kind: "uncertain" })).toBe(false);
    expect(pageUsableForLesson({ text_content: "x = 2y + 1 bağıntısı her adımda kullanılır", page_kind: "uncertain" })).toBe(true);
  });
});

describe("ünite sayısı bandı", () => {
  it("etkin sayfaya göre beş bant ve 15 tavanı", () => {
    expect(unitCountBand(1)).toEqual({ min: 1, max: 3 });
    expect(unitCountBand(6)).toEqual({ min: 1, max: 3 });
    expect(unitCountBand(7)).toEqual({ min: 3, max: 5 });
    expect(unitCountBand(15)).toEqual({ min: 3, max: 5 });
    expect(unitCountBand(16)).toEqual({ min: 5, max: 8 });
    expect(unitCountBand(35)).toEqual({ min: 5, max: 8 });
    expect(unitCountBand(36)).toEqual({ min: 8, max: 12 });
    expect(unitCountBand(80)).toEqual({ min: 8, max: 12 });
    expect(unitCountBand(81)).toEqual({ min: 10, max: 15 });
    expect(unitCountBand(5_000)).toEqual({ min: 10, max: MAX_MAIN_UNITS });
    expect(effectivePageCount([doc("doc-a", "pdf", [1, 2, 3]), doc("slide-b", "office", [1, 1, 2])])).toBe(5);
  });

  for (const [pages, band] of [
    [5, { min: 1, max: 3 }],
    [12, { min: 3, max: 5 }],
    [30, { min: 5, max: 8 }],
    [60, { min: 8, max: 12 }],
    [120, { min: 10, max: 15 }],
  ] as const) {
    it(`${pages} etkin sayfa: ${band.min}–${band.max} ana ünite, kayıpsız`, () => {
      // Her sayfa ayrı ince konu, her konu ayrı ünite (en parçalı harita).
      const topics = range(1, pages).map((page) => topic(`fragment-${page} subtopic-${page}`, "doc-a", "doc-a.pdf", [page], `n${page}`));
      const input: ConsolidationInput = {
        topics,
        units: topics.map((item, index) => ({ title: `unit-${index + 1} ${item.title}`, topics: [index] })),
        documents: [doc("doc-a", "pdf", range(1, pages))],
      };
      const result = consolidateFragmentedTopics(input);
      expect(result.band).toEqual(band);
      expect(result.units.length).toBeGreaterThanOrEqual(band.min);
      expect(result.units.length).toBeLessThanOrEqual(band.max);
      expect(result.units.length).toBeLessThanOrEqual(MAX_MAIN_UNITS);
      expectLossless(input, result);
    });
  }

  it("tabanın altı: en büyük çok konulu ünite konularından bölünür; tek konulu materyal tabanın altında kalabilir", () => {
    const topics = range(1, 9).map((index) => topic(`topic-alpha part-${index}`, "doc-a", "doc-a.pdf", range(index * 4 - 3, index * 4), `n${index}`));
    const input: ConsolidationInput = {
      topics,
      units: [{ title: "unit-alpha", topics: range(0, 8) }],
      documents: [doc("doc-a", "pdf", range(1, 36))],
    };
    const result = consolidateFragmentedTopics(input);
    expect(result.units.length).toBe(8);
    expect(result.units[0]!.title).toBe("unit-alpha");
    // Bölünen ikinci parçanın adı onun ilk konusunun (modelin yazdığı) adıdır; kod başlık yazmaz.
    const titles = new Set(topics.map((item) => item.title));
    for (const unit of result.units.slice(1)) expect(titles.has(unit.title)).toBe(true);
    expectLossless(input, result);

    const single = consolidateFragmentedTopics({
      topics: [topic("topic-beta", "doc-a", "doc-a.pdf", range(1, 20), "n1")],
      units: [{ title: "unit-beta", topics: [0] }],
      documents: [doc("doc-a", "pdf", range(1, 20))],
    });
    expect(single.units).toHaveLength(1);
    expect(single.units[0]!.title).toBe("unit-beta");
  });
});

describe("karışık kaynak havuzu (a): PDF + sunu + Word + sırasız fotoğraflar", () => {
  // doc-a.pdf 12 sayfa (1 kapak, 2 içindekiler, 12 kaynakça), slide-b.pptx 10 slayt (1 yalnız başlık, 10 boş),
  // note-c.docx 4 sayfa, photo-01.jpg … photo-10.jpg tek fotoğraf seti, sırasız. Toplam 36 kaynak sayfası.
  const documents: ConsolidationDocument[] = [
    doc("doc-a", "pdf", range(3, 11)),
    doc("slide-b", "office", range(2, 9), 500),
    doc("note-c", "office", range(1, 4), 900),
    doc("photos", "photo", range(1, 10), 650),
  ];
  const topics: ConsolidationTopic[] = [
    // doc-a: üç ünite + kaynakça "konusu"
    topic("topic-alpha subtopic-1", "doc-a", "doc-a.pdf", [3, 4], "a1"),
    topic("topic-alpha subtopic-2", "doc-a", "doc-a.pdf", [5], "a2"),
    topic("topic-beta subtopic-1", "doc-a", "doc-a.pdf", [6, 7], "a3"),
    topic("topic-beta subtopic-2", "doc-a", "doc-a.pdf", [8], "a4"),
    topic("topic-gamma subtopic-1", "doc-a", "doc-a.pdf", [9, 10, 11], "a5"),
    topic("reference-list", "doc-a", "doc-a.pdf", [12], "a6"),
    // slide-b: aynı temalar başka dosyada
    topic("topic-alpha slide-summary", "slide-b", "slide-b.pptx", [2, 3], "b1"),
    topic("topic-beta subtopic-2", "slide-b", "slide-b.pptx", [4, 5], "b2"),
    topic("topic-delta subtopic-1", "slide-b", "slide-b.pptx", [6, 7, 8, 9], "b3"),
    topic("cover-slide", "slide-b", "slide-b.pptx", [1], "b4"),
    // note-c
    topic("topic-gamma subtopic-2", "note-c", "note-c.docx", [1, 2], "c1"),
    topic("topic-delta subtopic-2", "note-c", "note-c.docx", [3, 4], "c2"),
    // photos: sırasız parçalar
    topic("topic-delta photo-note", "photos", "photo-01.jpg", [7, 2], "p1"),
    topic("topic-alpha subtopic-1", "photos", "photo-01.jpg", [5], "p2"),
    topic("topic-epsilon fragment-1", "photos", "photo-01.jpg", [1, 3], "p3"),
    topic("topic-epsilon fragment-2", "photos", "photo-01.jpg", [4, 6], "p4"),
    topic("topic-zeta fragment-1", "photos", "photo-01.jpg", [8, 9, 10], "p5"),
  ];
  const units: ConsolidationUnit[] = [
    { title: "Topic Alpha", stage: 1, topics: [0, 1] },
    { title: "Topic Beta", stage: 2, topics: [2, 3] },
    { title: "Topic Gamma", stage: 3, topics: [4] },
    { title: "Back Matter", stage: 4, topics: [5] },
    { title: "Topic Alpha", stage: 1, topics: [6] },
    { title: "Topic Beta", stage: 2, topics: [7] },
    { title: "Topic Delta", stage: 3, topics: [8] },
    { title: "Opening", stage: 1, topics: [9] },
    { title: "Topic Gamma", stage: 3, topics: [10] },
    { title: "Topic Delta", stage: 3, topics: [11] },
    { title: "Topic Delta", stage: 3, topics: [12] },
    { title: "Topic Alpha", stage: 1, topics: [13] },
    { title: "Topic Epsilon", stage: 4, topics: [14, 15] },
    { title: "Topic Zeta", stage: 2, topics: [16] },
  ];
  const input: ConsolidationInput = { topics, units, documents };
  const result = consolidateFragmentedTopics(input);

  it("gürültü sayfaları etkin sayfaya girmez, ünite açmaz", () => {
    expect(result.effectivePageCount).toBe(31);
    expect(result.band).toEqual({ min: 5, max: 8 });
    expect(result.droppedNoise).toEqual([5, 9]);
    expect(result.units.flatMap((unit) => unit.subtopics)).not.toContain("reference-list");
    expect(result.units.flatMap((unit) => unit.subtopics)).not.toContain("cover-slide");
  });

  it("aynı temanın dosyalara dağılmış parçaları tek ünitede, bütün kaynaklarıyla", () => {
    const alpha = result.units.filter((unit) => unit.subtopics.some((title) => title.includes("topic-alpha")));
    expect(alpha).toHaveLength(1);
    expect(new Set(alpha[0]!.sourceRefs.map((ref) => ref.documentId))).toEqual(new Set(["doc-a", "slide-b", "photos"]));
    const beta = result.units.filter((unit) => unit.subtopics.some((title) => title.includes("topic-beta")));
    expect(beta).toHaveLength(1);
    // Aynı ince konu iki dosyada: alt başlık bir kez, iki kaynak.
    expect(beta[0]!.subtopics.filter((title) => title === "topic-beta subtopic-2")).toHaveLength(1);
    expect(beta[0]!.sourceRefs.filter((ref) => ref.nodeId === "a4" || ref.nodeId === "b2")).toHaveLength(2);
    const delta = result.units.filter((unit) => unit.subtopics.some((title) => title.includes("topic-delta")));
    expect(delta).toHaveLength(1);
    expect(new Set(delta[0]!.sourceRefs.map((ref) => ref.documentId))).toEqual(new Set(["slide-b", "note-c", "photos"]));
  });

  it("toplam ünite bandın içinde; kaynak, sayfa ve alt başlık kaybolmaz", () => {
    expect(result.units.length).toBeGreaterThanOrEqual(5);
    expect(result.units.length).toBeLessThanOrEqual(8);
    expectLossless(input, result);
  });

  it("(c) fotoğraflı ve çok belgeli kursta üniteler öğrenme basamağına göre", () => {
    expect(result.stageOrdered).toBe(true);
    const stages = result.units.map((unit) => unit.stage!);
    expect(stages).toEqual([...stages].sort((a, b) => a - b));
    expect(result.units[0]!.subtopics.some((title) => title.includes("topic-alpha"))).toBe(true);
  });
});

describe("31 fotoğraf, 29 parça başlık (b)", () => {
  const themes = ["topic-alpha", "topic-beta", "topic-gamma", "topic-delta", "topic-epsilon", "topic-zeta"];
  // Fotoğraf 1 ve 31 yalnız başlık (gürültü); 2–30 arası 29 parça, temalar sırasız dağılmış.
  const order = [7, 2, 19, 11, 25, 4, 13, 28, 9, 16, 22, 3, 30, 6, 18, 12, 26, 5, 21, 14, 29, 8, 17, 24, 10, 20, 15, 27, 23];
  const topics = order.map((page, index) =>
    topic(`${themes[index % themes.length]} fragment-${index + 1}`, "photos", `photo-${String(page).padStart(2, "0")}.jpg`, [page], `f${index + 1}`),
  );
  const input: ConsolidationInput = {
    topics,
    units: topics.map((item, index) => ({ title: item.title, stage: ((index % 4) + 1) as 1 | 2 | 3 | 4, topics: [index] })),
    documents: [{ documentId: "photos", kind: "photo", usablePages: range(2, 30), pageChars: chars(range(2, 30), 420) }],
  };
  const result = consolidateFragmentedTopics(input);

  it("5–8 ana ünite", () => {
    expect(result.effectivePageCount).toBe(29);
    expect(result.units.length).toBeGreaterThanOrEqual(5);
    expect(result.units.length).toBeLessThanOrEqual(8);
  });

  it("hiçbir kaynak ya da alt başlık kaybolmaz", () => {
    expectLossless(input, result);
    expect(new Set(result.units.flatMap((unit) => unit.sourceRefs.flatMap((ref) => ref.pages)))).toEqual(new Set(order));
  });

  it("aynı temanın parçaları büyük ölçüde aynı ünitede (sözcük örtüşmesi)", () => {
    for (const theme of themes) {
      const holders = result.units.filter((unit) => unit.subtopics.some((title) => title.startsWith(theme)));
      expect(holders.length).toBeLessThanOrEqual(2);
    }
  });

  it("fotoğraf setinde basamak sırası", () => {
    expect(result.stageOrdered).toBe(true);
    const stages = result.units.map((unit) => unit.stage!);
    expect(stages).toEqual([...stages].sort((a, b) => a - b));
  });
});

describe("sıra (c): tek düzenli belge kendi sırasında", () => {
  it("basamak yazılmış olsa da tek metin belgesi belge sırasıyla kalır", () => {
    const topics = range(1, 6).map((index) => topic(`topic-${index} subtopic-${index}`, "doc-a", "doc-a.pdf", range(index * 3 - 2, index * 3), `n${index}`));
    const units: ConsolidationUnit[] = topics.map((item, index) => ({ title: `unit-${index + 1}`, stage: (4 - (index % 4)) as 1 | 2 | 3 | 4, topics: [index] }));
    const result = consolidateFragmentedTopics({ topics, units, documents: [doc("doc-a", "pdf", range(1, 18))] });
    expect(result.stageOrdered).toBe(false);
    expect(result.units.map((unit) => unit.title)).toEqual(units.map((unit) => unit.title));
  });

  it("basamağı eksik ünite varsa çok belgeli kursta da sıra değişmez", () => {
    const topics = [
      topic("topic-1", "doc-a", "doc-a.pdf", range(1, 8), "n1"),
      topic("topic-2", "slide-b", "slide-b.pptx", range(1, 8), "n2"),
      topic("topic-3", "doc-a", "doc-a.pdf", range(9, 16), "n3"),
      topic("topic-4", "slide-b", "slide-b.pptx", range(9, 16), "n4"),
      topic("topic-5", "doc-a", "doc-a.pdf", range(17, 24), "n5"),
    ];
    const units: ConsolidationUnit[] = [
      { title: "unit-1", stage: 3, topics: [0] },
      { title: "unit-2", topics: [1] },
      { title: "unit-3", stage: 1, topics: [2] },
      { title: "unit-4", stage: 2, topics: [3] },
      { title: "unit-5", stage: 1, topics: [4] },
    ];
    const result = consolidateFragmentedTopics({
      topics,
      units,
      documents: [doc("doc-a", "pdf", range(1, 24)), doc("slide-b", "office", range(1, 16))],
    });
    expect(result.stageOrdered).toBe(false);
    expect(result.units.map((unit) => unit.title)).toEqual(["unit-1", "unit-2", "unit-3", "unit-4", "unit-5"]);
  });

  it("aynı üst başlığın numaralı parçaları birleşir (tabanın altına inmeden)", () => {
    expect(partParentKey("1.1 Topic Alpha")).toBe("num:1");
    expect(partParentKey("1.2 Topic Beta")).toBe("num:1");
    expect(partParentKey("Topic Alpha Bölüm A")).toBe(partParentKey("Topic Alpha Bölüm B"));
    expect(partParentKey("Topic Alpha I")).toBe(partParentKey("Topic Alpha II"));
    expect(partParentKey("Bölüm 1")).toBeNull();
    const topics = range(1, 8).map((index) => topic(`subtopic-${index}`, "doc-a", "doc-a.pdf", range(index * 4 - 3, index * 4), `n${index}`));
    const titles = ["1.1 unit-one", "1.2 unit-one", "2.1 unit-two", "2.2 unit-two", "3.1 unit-three", "3.2 unit-three", "4.1 unit-four", "4.2 unit-four"];
    const result = consolidateFragmentedTopics({
      topics,
      units: titles.map((title, index) => ({ title, topics: [index] })),
      documents: [doc("doc-a", "pdf", range(1, 32))],
    });
    // 32 sayfa → 5–8; sekiz parça en çok tabana (5) kadar birleşir.
    expect(result.units.length).toBe(5);
    expect(result.units.map((unit) => unit.title)).toContain("1.1 unit-one");
  });
});

describe("dersler: 12 öğretilebilir sayfa sınırı", () => {
  it("12 sayfaya kadar tek ders; fazlası alt başlık gruplarına göre ardışık dersler, sayfa kaybolmaz", () => {
    const usable = new Set(range(1, 30).filter((page) => page !== 15));
    const parts = [
      { title: "subtopic-1", documentId: "doc-a", pages: range(1, 5) },
      { title: "absorbed-unit", documentId: "", pages: [] },
      { title: "subtopic-2", documentId: "doc-a", pages: range(6, 10) },
      { title: "subtopic-3", documentId: "doc-a", pages: range(11, 16) },
      { title: "subtopic-4", documentId: "slide-b", pages: range(1, 20) },
    ];
    const groups = unitLessonGroups(parts, (documentId) => (documentId === "doc-a" ? usable : null));
    expect(groups.length).toBeGreaterThan(2);
    for (const group of groups) {
      const count = group.sourceRefs.reduce(
        (sum, ref) => sum + ref.pages.filter((page) => (ref.documentId === "doc-a" ? usable.has(page) : true)).length,
        0,
      );
      expect(count).toBeLessThanOrEqual(12);
    }
    expect(groups[0]!.subtopics).toEqual(["subtopic-1", "absorbed-unit", "subtopic-2"]);
    const byDoc = (documentId: string) => groups.flatMap((group) => group.sourceRefs.filter((ref) => ref.documentId === documentId).flatMap((ref) => ref.pages));
    expect(byDoc("doc-a")).toEqual(range(1, 16));
    expect(byDoc("slide-b")).toEqual(range(1, 20));
    // Sınırı tek başına aşan alt başlık kendi sayfalarında bölünür ve her parçada adı durur.
    expect(groups.filter((group) => group.subtopics.includes("subtopic-4")).length).toBe(2);

    const small = unitLessonGroups([{ title: "subtopic-1", documentId: "doc-a", pages: range(1, 12) }], () => null);
    expect(small).toHaveLength(1);
  });

  it("takvim: grup başına ders, ders düğümünde alt başlıklar ve belge başına kaynak", () => {
    const unit: ScheduleTopicInput = {
      id: "leaf-1",
      title: "Topic Alpha",
      pageNumbers: range(1, 20),
      sourceRefs: [
        { documentId: "doc-a", fileName: "doc-a.pdf", pages: range(1, 12), nodeId: "leaf-1" },
        { documentId: "slide-b", fileName: "slide-b.pptx", pages: range(1, 8), nodeId: "leaf-2" },
      ],
      subtopics: ["subtopic-1", "subtopic-2"],
      lessonGroups: [
        { subtopics: ["subtopic-1"], sourceRefs: [{ documentId: "doc-a", pages: range(1, 12) }] },
        { subtopics: ["subtopic-2"], sourceRefs: [{ documentId: "slide-b", pages: range(1, 8) }] },
      ],
    };
    const chunks = topicLessonChunks(unit);
    expect(chunks.map((chunk) => chunk.subtopics)).toEqual([["subtopic-1"], ["subtopic-2"]]);
    const schedule = buildExamScheduleV2({
      daysToExam: 20,
      dailyMinutes: 60,
      studyDays: [1, 2, 3, 4, 5, 6, 7],
      topics: [unit, { id: "leaf-9", title: "Topic Beta", pageNumbers: [13, 14], subtopics: ["subtopic-9"], sourceRefs: [{ documentId: "doc-a", fileName: "doc-a.pdf", pages: [13, 14], nodeId: "leaf-9" }] }],
      fromDate: new Date("2026-11-21T08:00:00Z"),
    });
    const alphaLessons = schedule.sessions.filter((session) => session.topicId === "leaf-1" && session.role === "learn");
    expect(alphaLessons.map((session) => session.lessonSubtopics)).toEqual([["subtopic-1"], ["subtopic-2"]]);
    expect(alphaLessons.map((session) => session.unitSources)).toEqual([
      [{ documentId: "doc-a", pages: range(1, 12) }],
      [{ documentId: "slide-b", pages: range(1, 8) }],
    ]);
    const alphaTest = schedule.sessions.find((session) => session.topicId === "leaf-1" && session.kind === "quiz")!;
    expect(alphaTest.lessonSubtopics).toBeUndefined();
    expect(alphaTest.unitSources).toEqual([
      { documentId: "doc-a", pages: range(1, 12) },
      { documentId: "slide-b", pages: range(1, 8) },
    ]);
    // Tek dersli ünite: bütün alt başlıklar tek derste, mekanik sayfa bölmesi yok.
    expect(schedule.sessions.filter((session) => session.topicId === "leaf-9" && session.role === "learn")).toHaveLength(1);
    const mock = schedule.sessions.find((session) => session.role === "mock")!;
    expect(mock.unitSources).toBeUndefined();
    const drafts = scheduleSessionsToNodeDrafts(schedule.sessions);
    const lessonMeta = parseSessionMeta(drafts.find((draft) => draft.meta.topicId === "leaf-1" && draft.kind === "lesson")!.meta);
    expect(lessonMeta?.lessonSubtopics).toEqual(["subtopic-1"]);
    expect(lessonMeta?.unitSources).toEqual([{ documentId: "doc-a", pages: range(1, 12) }]);
    expect(mainSessionSource(alphaTest.unitSources)?.documentId).toBe("doc-a");
    // Şablonun eklediği adımlar: hazırlık geneli adım bir ünitenin kaynağına bağlanmaz; hiçbir dolgu ders alt başlığı taşımaz.
    const merged = mergeStudyPathTemplate(drafts);
    const present = new Set(drafts.map((draft) => draft.kind));
    const fillers = merged.filter((item) => !present.has(item.kind));
    expect(fillers.length).toBeGreaterThan(0);
    for (const node of fillers) {
      expect(node.meta?.lessonSubtopics).toBeUndefined();
      if (["gaps", "focused", "written_exam", "flashcards", "final_check", "readiness"].includes(node.kind)) {
        expect(node.meta?.unitSources).toBeUndefined();
      }
    }
  });
});

describe("sonradan materyal ekleme (e)", () => {
  const existingTopics = [
    {
      id: "row-alpha",
      label: "Topic Alpha",
      sortOrder: 0,
      status: "ready",
      sourceRefs: [{ documentId: "doc-a", fileName: "doc-a.pdf", pages: [1, 2], nodeId: "a1" }],
      subtopics: ["subtopic-1", "subtopic-2"],
    },
    {
      id: "row-beta",
      label: "Topic Beta",
      sortOrder: 1,
      status: "ready",
      sourceRefs: [{ documentId: "doc-a", fileName: "doc-a.pdf", pages: [3, 4], nodeId: "a2" }],
      subtopics: ["subtopic-3"],
    },
  ];
  const existingNodes = [
    { id: "n0", title: "Topic Alpha · Ders", sortOrder: 0, status: "done", kind: "lesson", dayIndex: 1, topicId: "row-alpha", lessonPages: 1 },
    { id: "n0b", title: "Topic Alpha · Ders 2", sortOrder: 1, status: "ready", kind: "lesson", dayIndex: 1, topicId: "row-alpha", lessonPages: 1 },
    { id: "n1", title: "Topic Beta · Ders", sortOrder: 2, status: "ready", kind: "lesson", dayIndex: 2, topicId: "row-beta", lessonPages: 2 },
  ];
  const incoming: IncomingPrepTopic[] = [
    {
      title: "Topic Alpha Extra",
      pages: [1, 2],
      sources: [{ documentId: "slide-b", fileName: "slide-b.pptx", pages: [1, 2], nodeId: "b1" }],
      prerequisites: [],
      nodeIds: ["b1"],
      subtopics: ["subtopic-2", "subtopic-4"],
    },
    {
      title: "Topic Omega",
      pages: [3, 4, 5],
      sources: [{ documentId: "slide-b", fileName: "slide-b.pptx", pages: [3, 4, 5], nodeId: "b2" }],
      prerequisites: ["Topic Alpha"],
      nodeIds: ["b2"],
      subtopics: ["subtopic-5"],
    },
  ];
  const plan = planAddedMaterial({
    existingDocumentIds: ["doc-a"],
    newDocumentIds: ["slide-b"],
    readinessScore: 40,
    contradictionsByTitle: new Map(),
    existingTopics,
    existingNodes,
    incoming,
    units: true,
  });

  it("alt başlık örtüşen ünite var olan üniteye katılır: yeni alt başlıklar ve kaynak, yeni küçük ünite yok", () => {
    expect(plan.topicUpdates).toHaveLength(1);
    expect(plan.topicUpdates[0]!.id).toBe("row-alpha");
    expect(plan.topicUpdates[0]!.subtopics).toEqual(["subtopic-1", "subtopic-2", "Topic Alpha Extra", "subtopic-4"]);
    expect(plan.topicUpdates[0]!.sourceRefs.map((ref) => ref.nodeId)).toEqual(["a1", "b1"]);
    expect(plan.topicUpdates[0]!.addedSources?.map((ref) => ref.documentId)).toEqual(["slide-b"]);
    // Açık son derse (1 sayfa) 2 sayfa eklenir: sınırın altında, yeni ders açılmaz; o derse yalnız yeni alt başlıklar.
    expect(plan.topicUpdates[0]!.refreshSubtopics).toEqual(["Topic Alpha Extra", "subtopic-2", "subtopic-4"]);
    expect(plan.nodeInserts.some((node) => node.topicId === "row-alpha")).toBe(false);
  });

  it("örtüşmeyen ünite önkoşulunun ardına yeni ünite olarak girer; ilerleme sıfırlanmaz", () => {
    expect(plan.topicInserts.map((topic) => topic.label)).toEqual(["Topic Omega"]);
    expect(plan.topicInserts[0]!.subtopics).toEqual(["subtopic-5"]);
    expect(plan.topicInserts[0]!.sortOrder).toBe(1);
    expect(plan.topicSortUpdates).toEqual([{ id: "row-beta", sortOrder: 2 }]);
    expect(plan.nodeInserts).toHaveLength(1);
    expect(plan.nodeInserts[0]!.lessonSubtopics).toEqual(["subtopic-5"]);
    expect(plan.nodeInserts[0]!.unitSources).toEqual([{ documentId: "slide-b", pages: [3, 4, 5] }]);
    expect(plan.keptNodeStatuses).toEqual([
      { id: "n0", status: "done" },
      { id: "n0b", status: "ready" },
      { id: "n1", status: "ready" },
    ]);
    expect(plan.readinessScore).toBe(40);
  });

  it("katılan ünitenin son bitmemiş dersi yeni alt başlıkları ve kaynağı alır; bitmiş ders ve öbür adımlar değişmez", () => {
    const row = { id: "row-alpha", document_topic_node_id: "a1" };
    const nodes = [
      { id: "l1", sort_order: 0, status: "done", kind: "lesson", session_meta: { topicId: "a1", lessonSubtopics: ["subtopic-1"], unitSources: [{ documentId: "doc-a", pages: [1] }] } },
      { id: "l2", sort_order: 1, status: "ready", kind: "lesson", session_meta: { topicId: "a1", lessonSubtopics: ["subtopic-2"], unitSources: [{ documentId: "doc-a", pages: [2] }] } },
      { id: "q1", sort_order: 2, status: "locked", kind: "quiz", session_meta: { topicId: "a1", unitSources: [{ documentId: "doc-a", pages: [1, 2] }] } },
      { id: "other", sort_order: 3, status: "ready", kind: "lesson", session_meta: { topicId: "zz", unitSources: [{ documentId: "doc-a", pages: [9] }] } },
    ];
    const updates = unitNodeRefreshes(
      row,
      nodes,
      [{ documentId: "slide-b", fileName: "slide-b.pptx", pages: [1, 2], nodeId: "b1" }],
      ["subtopic-1", "subtopic-2", "Topic Alpha Extra", "subtopic-4"],
    );
    expect(updates.map((update) => update.id)).toEqual(["l2"]);
    expect(updates[0]!.meta.lessonSubtopics).toEqual(["subtopic-2", "Topic Alpha Extra", "subtopic-4"]);
    expect(updates[0]!.meta.unitSources).toEqual([
      { documentId: "doc-a", pages: [2] },
      { documentId: "slide-b", pages: [1, 2] },
    ]);
    // Bütün dersleri bitmiş ünite: yazım yok.
    expect(unitNodeRefreshes(row, [nodes[0]!], [{ documentId: "slide-b", fileName: "", pages: [1], nodeId: null }], [])).toEqual([]);
  });

  it("aynı tema ölçüsü: ad, alt başlık ya da yarıdan fazla ortak alt başlık", () => {
    expect(sameUnitTheme({ title: "Topic Alpha", subtopics: [] }, { title: "topic alpha", subtopics: [] })).toBe(true);
    expect(sameUnitTheme({ title: "subtopic-1", subtopics: [] }, { title: "Topic Alpha", subtopics: ["subtopic-1"] })).toBe(true);
    expect(sameUnitTheme({ title: "Topic X", subtopics: ["subtopic-9"] }, { title: "Topic Y", subtopics: ["subtopic-8"] })).toBe(false);
  });
});

describe("sonradan materyal ekleme (e2): ünite tavanı ve sayfa kaybı yok", () => {
  /** n var olan ünite; her birinin tek, açık dersi (ilk ünite bitmiş). */
  function existingPrep(n: number) {
    const topics = Array.from({ length: n }, (_, index) => ({
      id: `row-${index + 1}`,
      label: `topic-${String.fromCharCode(97 + index)} unit`,
      sortOrder: index,
      status: "ready",
      sourceRefs: [{ documentId: "doc-a", fileName: "doc-a.pdf", pages: [index + 1], nodeId: `a${index + 1}` }],
      subtopics: [`subtopic-${index + 1}`],
    }));
    const nodes = topics.map((topic, index) => ({
      id: `n${index + 1}`,
      title: topic.label,
      sortOrder: index,
      status: index === 0 ? "done" : "ready",
      kind: "lesson",
      dayIndex: index,
      topicId: topic.id,
      lessonPages: 1,
    }));
    return { topics, nodes };
  }
  const incomingUnit = (title: string, pages: number[], subtopics: string[], documentId = "doc-big", groups?: number[][]): IncomingPrepTopic => ({
    title,
    pages,
    sources: [{ documentId, fileName: "doc-big.pdf", pages, nodeId: `${title}-leaf` }],
    prerequisites: [],
    nodeIds: [`${title}-leaf`],
    subtopics,
    ...(groups
      ? { lessonGroups: groups.map((group, index) => ({ subtopics: [subtopics[index] ?? title], sourceRefs: [{ documentId, pages: group }] })) }
      : {}),
  });
  const allPages = (plan: ReturnType<typeof planAddedMaterial>, documentId: string) =>
    [
      ...new Set(
        [...plan.topicUpdates.flatMap((topic) => topic.sourceRefs), ...plan.topicInserts.flatMap((topic) => topic.sourceRefs)]
          .filter((ref) => ref.documentId === documentId)
          .flatMap((ref) => ref.pages),
      ),
    ].sort((a, b) => a - b);

  it("tavan: 14 ünitelik hazırlığa üç yeni ünite gelirse yalnız biri açılır, öbürleri en ilgili üniteye katılır; sayfa düşmez", () => {
    const { topics, nodes } = existingPrep(14);
    const plan = planAddedMaterial({
      existingDocumentIds: ["doc-a"],
      newDocumentIds: ["doc-big"],
      readinessScore: 0,
      contradictionsByTitle: new Map(),
      existingTopics: topics,
      existingNodes: nodes,
      incoming: [
        incomingUnit("Topic Omega", [41, 42], ["subtopic-omega-1"]),
        incomingUnit("Omega Extension", [43, 44], ["subtopic-omega-2"]),
        incomingUnit("topic-c unit continued", [45, 46], ["subtopic-c-more"]),
      ],
      units: true,
    });
    expect(topics.length + plan.topicInserts.length).toBe(MAX_MAIN_UNITS);
    expect(plan.topicInserts.map((topic) => topic.label)).toEqual(["Topic Omega"]);
    // "Omega Extension" yeni ünitenin sözcüğünü taşır: aynı eklemenin yeni ünitesine katılır, alt başlık olur.
    expect(plan.topicInserts[0]!.subtopics).toEqual(["subtopic-omega-1", "Omega Extension", "subtopic-omega-2"]);
    // "topic-c unit continued" var olan üçüncü üniteyle sözcük paylaşır: oraya katılır.
    expect(plan.topicUpdates.map((topic) => topic.id)).toEqual(["row-3"]);
    expect(allPages(plan, "doc-big")).toEqual([41, 42, 43, 44, 45, 46]);
    // Yeni ünitenin iki dersi (kendi + katılan), ikisi de ünite adını taşır.
    const omega = plan.nodeInserts.filter((node) => node.topicTitle === "Topic Omega");
    expect(omega.map((node) => node.unitSources)).toEqual([
      [{ documentId: "doc-big", pages: [41, 42] }],
      [{ documentId: "doc-big", pages: [43, 44] }],
    ]);
  });

  it("tavan dolu ve örtüşme yok: ünite yolun son ünitesine katılır", () => {
    const { topics, nodes } = existingPrep(MAX_MAIN_UNITS);
    const plan = planAddedMaterial({
      existingDocumentIds: ["doc-a"],
      newDocumentIds: ["doc-big"],
      readinessScore: 0,
      contradictionsByTitle: new Map(),
      existingTopics: topics,
      existingNodes: nodes,
      incoming: [incomingUnit("Zeta Quantum", [50], ["zeta-leaf"])],
      units: true,
    });
    expect(plan.topicInserts).toEqual([]);
    expect(plan.topicUpdates.map((topic) => topic.id)).toEqual([`row-${MAX_MAIN_UNITS}`]);
    expect(plan.topicUpdates[0]!.subtopics).toEqual([`subtopic-${MAX_MAIN_UNITS}`, "Zeta Quantum", "zeta-leaf"]);
  });

  it("katılan içerik açık son dersin sınırını aşarsa ünitenin son dersinden sonra yeni dersler açılır (bitmemiş test arkada kalır)", () => {
    const topics = [
      { id: "row-alpha", label: "Topic Alpha", sortOrder: 0, status: "ready", sourceRefs: [{ documentId: "doc-a", fileName: "doc-a.pdf", pages: [1, 2], nodeId: "a1" }], subtopics: ["subtopic-1"] },
      { id: "row-beta", label: "Topic Beta", sortOrder: 1, status: "ready", sourceRefs: [{ documentId: "doc-a", fileName: "doc-a.pdf", pages: [3], nodeId: "a2" }], subtopics: ["subtopic-2"] },
    ];
    const nodes = [
      { id: "l1", title: "Topic Alpha", sortOrder: 0, status: "done", kind: "lesson", dayIndex: 0, topicId: "row-alpha", lessonPages: 2 },
      { id: "q1", title: "Topic Alpha · Konu testi", sortOrder: 1, status: "ready", kind: "quiz", dayIndex: 0, topicId: "row-alpha" },
      { id: "l2", title: "Topic Beta", sortOrder: 2, status: "locked", kind: "lesson", dayIndex: 1, topicId: "row-beta", lessonPages: 1 },
    ];
    const big = incomingUnit("Topic Alpha", [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25], ["subtopic-1", "subtopic-1b"], "doc-big", [
      [10, 11, 12, 13, 14, 15, 16, 17],
      [18, 19, 20, 21, 22, 23, 24, 25],
    ]);
    const plan = planAddedMaterial({
      existingDocumentIds: ["doc-a"],
      newDocumentIds: ["doc-big"],
      readinessScore: 55,
      contradictionsByTitle: new Map(),
      existingTopics: topics,
      existingNodes: nodes,
      incoming: [big],
      units: true,
    });
    expect(plan.topicInserts).toEqual([]);
    expect(plan.topicUpdates[0]!.addedSources).toBeUndefined();
    expect(plan.nodeInserts.map((node) => ({ title: node.title, sortOrder: node.sortOrder, topicId: node.topicId, unitSources: node.unitSources, part: node.lessonPart }))).toEqual([
      { title: "Topic Alpha · Ders 2: subtopic-1", sortOrder: 1, topicId: "row-alpha", unitSources: [{ documentId: "doc-big", pages: [10, 11, 12, 13, 14, 15, 16, 17] }], part: 2 },
      { title: "Topic Alpha · Ders 3: subtopic-1b", sortOrder: 2, topicId: "row-alpha", unitSources: [{ documentId: "doc-big", pages: [18, 19, 20, 21, 22, 23, 24, 25] }], part: 3 },
    ]);
    // Bitmemiş konu testi yeni derslerin arkasına kayar; bitmiş ders yerinde, hiçbir durum değişmez.
    expect(plan.nodeSortUpdates).toEqual([
      { id: "q1", sortOrder: 3 },
      { id: "l2", sortOrder: 4 },
    ]);
    expect(plan.keptNodeStatuses).toEqual([
      { id: "l1", status: "done" },
      { id: "q1", status: "ready" },
      { id: "l2", status: "locked" },
    ]);
    expect(plan.nodeInserts.every((node) => node.status === "locked")).toBe(true);
    expect(plan.readinessScore).toBe(55);
  });

  it("bütün dersleri bitmiş üniteye küçük ekleme yeni ders açar; açık dersi sınırına yakınsa da", () => {
    const topics = [{ id: "row-alpha", label: "Topic Alpha", sortOrder: 0, status: "ready", sourceRefs: [{ documentId: "doc-a", fileName: "doc-a.pdf", pages: [1], nodeId: "a1" }], subtopics: ["subtopic-1"] }];
    const small = incomingUnit("Topic Alpha", [30, 31], ["subtopic-1c"]);
    const run = (status: string, lessonPages: number) =>
      planAddedMaterial({
        existingDocumentIds: ["doc-a"],
        newDocumentIds: ["doc-big"],
        readinessScore: 0,
        contradictionsByTitle: new Map(),
        existingTopics: topics,
        existingNodes: [{ id: "l1", title: "Topic Alpha", sortOrder: 0, status, kind: "lesson", dayIndex: 0, topicId: "row-alpha", lessonPages }],
        incoming: [small],
        units: true,
      });
    const done = run("done", 1);
    expect(done.nodeInserts).toHaveLength(1);
    expect(done.nodeInserts[0]!.status).toBe("ready");
    expect(done.nodeInserts[0]!.lessonSubtopics).toEqual(["subtopic-1c"]);
    expect(done.topicUpdates[0]!.addedSources).toBeUndefined();
    const nearLimit = run("ready", UNIT_LESSON_MAX_PAGES - 1);
    expect(nearLimit.nodeInserts).toHaveLength(1);
    expect(nearLimit.topicUpdates[0]!.addedSources).toBeUndefined();
    const roomy = run("ready", 3);
    expect(roomy.nodeInserts).toEqual([]);
    expect(roomy.topicUpdates[0]!.addedSources?.map((ref) => ref.pages)).toEqual([[30, 31]]);
  });

  it("ilişki ölçüsü: ortak sözcük yoksa 0, ad ve alt başlık birlikte sayılır", () => {
    expect(unitRelatedness({ title: "Zeta Quantum", subtopics: [] }, { title: "Topic Alpha", subtopics: ["subtopic-1"] })).toBe(0);
    expect(unitRelatedness({ title: "Omega Extension", subtopics: [] }, { title: "Topic Omega", subtopics: [] })).toBeGreaterThan(0);
  });
});

describe("eski hazırlık (f): alt başlıksız satır bugünkü gibi", () => {
  it("eski ekleme kuralı: ad eşleşmesi, kaynak belge başına birleşir, ünite alanı yazılmaz", () => {
    const plan = planAddedMaterial({
      existingDocumentIds: ["doc-a"],
      newDocumentId: "slide-b",
      readinessScore: 10,
      contradictionsByTitle: new Map(),
      existingTopics: [{ id: "row-1", label: "Topic Alpha", sortOrder: 0, status: "ready", sourceRefs: [{ documentId: "slide-b", fileName: "slide-b.pptx", pages: [1], nodeId: "x" }] }],
      existingNodes: [],
      incoming: [
        { title: "Topic Alpha", pages: [2], sources: [{ documentId: "slide-b", fileName: "slide-b.pptx", pages: [2], nodeId: "y" }], prerequisites: [], nodeIds: ["y"] },
        { title: "Topic Gamma", pages: [3], sources: [{ documentId: "slide-b", fileName: "slide-b.pptx", pages: [3], nodeId: "z" }], prerequisites: [], nodeIds: ["z"] },
      ],
    });
    expect(plan.topicUpdates[0]!.sourceRefs).toEqual([{ documentId: "slide-b", fileName: "slide-b.pptx", pages: [1, 2], nodeId: "x" }]);
    expect(plan.topicUpdates[0]!.subtopics).toBeUndefined();
    expect(plan.topicInserts[0]!.subtopics).toBeUndefined();
    expect(plan.nodeInserts[0]!.lessonSubtopics).toBeUndefined();
    expect(plan.nodeInserts[0]!.unitSources).toBeUndefined();
  });

  it("eski konu: mekanik sayfa dilimleri ve kavram birimleri aynen; oturumda ünite alanı yok", () => {
    expect(topicLessonChunks({ pageNumbers: range(1, 9) }).map((chunk) => chunk.pages)).toEqual([range(1, 3), range(4, 6), range(7, 9)]);
    expect(topicLessonChunks({ pageNumbers: [1, 2, 3], units: [{ title: "u1", pages: [1] }, { title: "u2", pages: [2, 3] }] }).map((chunk) => chunk.title)).toEqual(["u1", "u2"]);
    const schedule = buildExamScheduleV2({
      daysToExam: 10,
      dailyMinutes: 45,
      studyDays: [1, 2, 3, 4, 5, 6, 7],
      topics: [{ id: "old-1", title: "Topic Alpha", pageNumbers: range(1, 9) }],
      fromDate: new Date("2026-11-21T08:00:00Z"),
    });
    expect(schedule.sessions.some((session) => "lessonSubtopics" in session || "unitSources" in session)).toBe(false);
    expect(parseSessionMeta({ topicId: "old-1", role: "learn", sourcePages: [1] })).not.toHaveProperty("lessonSubtopics");
    expect(isUnitTopicRow({ subtopics: [] })).toBe(false);
    expect(isUnitTopicRow({})).toBe(false);
    expect(isUnitTopicRow({ subtopics: ["subtopic-1"] })).toBe(true);
    expect(parseSubtopics([" subtopic-1 ", "", 3, "subtopic-1"])).toEqual(["subtopic-1"]);
    expect(nodesUseUnits([{ session_meta: { topicId: "old-1", role: "learn" } }])).toBe(false);
    expect(nodesUseUnits([{ session_meta: { lessonSubtopics: ["subtopic-1"] } }])).toBe(true);
  });

  it("eski sekmenin ince konu listesi üniteye düşer: ünite bir kez, kendi adıyla", () => {
    const loaded = {
      titles: ["Topic Alpha"],
      nodeIds: ["leaf-1"],
      scheduleTopics: [{ id: "leaf-1", title: "Topic Alpha", subtopics: ["subtopic-1", "subtopic-2"], sourceRefs: [] }],
    };
    const applied = applyStudentTopicList({
      requested: [
        { title: "subtopic-1", linkedTitle: null, pageNumbers: [] },
        { title: "subtopic-2", linkedTitle: null, pageNumbers: [] },
      ],
      loaded,
    });
    expect(applied.titles).toEqual(["Topic Alpha"]);
    expect(applied.scheduleTopics[0]!.subtopics).toEqual(["subtopic-1", "subtopic-2"]);
  });
});

describe("sihirbaz: ünitenin alt başlıkları", () => {
  it("ünitenin altında tekrarsız, ünitenin kendi adı yazılmaz", () => {
    expect(unitSubtopicsToShow("Topic Alpha", ["topic alpha", "subtopic-1", " subtopic-1 ", 4, "subtopic-2", ""])).toEqual([
      "subtopic-1",
      "subtopic-2",
    ]);
    expect(unitSubtopicsToShow("Topic Alpha", ["Topic Alpha"])).toEqual([]);
  });

  it("ünite satırı alt başlık listesini çizer ve ekran okuyucuya ünitenin adıyla söyler", () => {
    const wizard = readFileSync(join(process.cwd(), "src/components/parity/exam-create-wizard.tsx"), "utf8");
    expect(wizard).toContain('className="apw-topic-subtopics"');
    expect(wizard).toContain("payload?.draft?.topicSubtopics");
    const intake = readFileSync(join(process.cwd(), "src/app/api/learning/exam-prep/intake/route.ts"), "utf8");
    expect(intake).toContain("loadIntakeMainUnits(service, userId, documentIds");
    expect(intake).toContain("topicSubtopics: mainSubtopics");
    const create = readFileSync(join(process.cwd(), "src/app/api/learning/exam-prep/create/route.ts"), "utf8");
    expect(create).toContain("{ mainUnits: true }");
  });
});

describe("konu haritası: öğrenme basamağı alanı", () => {
  it("şema basamağı ister (katı JSON), eski taslak basamaksız okunur", () => {
    const unitProps = ((oneShotJsonSchema.properties as Record<string, { items: { required: string[] } }>).units).items;
    expect(unitProps.required).toContain("stage");
    const draft = oneShotOutlineSchema.parse({
      units: [{ title: "unit-1", topics: [{ title: "topic-1", pageStart: 1, pageEnd: 2 }] }],
    });
    expect(draft.units[0]!.stage).toBeUndefined();
    expect(asStage(3)).toBe(3);
    expect(asStage(7)).toBeUndefined();
    expect(asStage("2")).toBe(2);
  });
});

/* ------------------------------------------------------------------------------------------------------------------ */
/* Uçtan uca okuma: kayıtlı harita + sayfa ölçüsü → ana üniteler (sahte veritabanı, model çağrısı yok).                  */
/* ------------------------------------------------------------------------------------------------------------------ */

type Row = Record<string, unknown>;

function fakeDb(tables: Record<string, Row[]>) {
  const query = (rows: Row[]) => {
    let current = [...rows];
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (column: string, value: unknown) => {
        current = current.filter((row) => row[column] === value);
        return api;
      },
      in: (column: string, values: unknown[]) => {
        current = current.filter((row) => values.includes(row[column]));
        return api;
      },
      is: () => api,
      order: (column: string) => {
        current = [...current].sort((a, b) => {
          const left = a[column];
          const right = b[column];
          return typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
        });
        return api;
      },
      range: (from: number, to: number) => Promise.resolve({ data: current.slice(from, to + 1), error: null }),
      maybeSingle: () => Promise.resolve({ data: current[0] ?? null, error: null }),
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: current, error: null }),
    };
    return api;
  };
  return { from: (table: string) => query(tables[table] ?? []) } as never;
}

describe("yeniden planlama: ünite satırı aynı dersleri kurar", () => {
  const groups = [
    { subtopics: ["subtopic-1"], sourceRefs: [{ documentId: "doc-a", pages: range(1, 12) }] },
    { subtopics: ["subtopic-2"], sourceRefs: [{ documentId: "doc-a", pages: range(13, 20) }] },
  ];
  const previous = {
    sessions: groups.map((group, index) => ({
      topicId: "leaf-1",
      topicTitle: "Topic Alpha",
      sourcePages: [],
      role: "learn",
      lessonPart: index + 1,
      lessonParts: 2,
      lessonSubtopics: group.subtopics,
      unitSources: group.sourceRefs,
    })),
  } as never;
  const row = {
    id: "row-1",
    exam_prep_id: "prep",
    label: "Topic Alpha",
    sort_order: 0,
    document_topic_node_id: "leaf-1",
    source_refs: [
      { documentId: "doc-a", fileName: "doc-a.pdf", pages: range(1, 12), nodeId: "leaf-1" },
      { documentId: "doc-a", fileName: "doc-a.pdf", pages: range(13, 20), nodeId: "leaf-2" },
    ],
    measured_level: null,
  };

  it("alt başlıklı satır ünite olarak okunur; kaynak değişmediyse önceki ders grupları", async () => {
    const topics = await loadPrepScheduleTopics(
      fakeDb({ exam_prep_topics: [{ ...row, subtopics: ["subtopic-1", "subtopic-2"] }], document_topic_nodes: [] }),
      { prepId: "prep", previous, hardTopics: [] },
    );
    expect(topics[0]!.subtopics).toEqual(["subtopic-1", "subtopic-2"]);
    expect(topics[0]!.pageNumbers).toEqual(range(1, 20));
    expect(topics[0]!.lessonGroups).toEqual(groups);
    expect(topics[0]!.units).toBeUndefined();
  });

  it("göçten önce kurulan ünite (sütun yok): alt başlıklar önceki ders oturumlarından", async () => {
    const topics = await loadPrepScheduleTopics(fakeDb({ exam_prep_topics: [row], document_topic_nodes: [] }), {
      prepId: "prep",
      previous,
      hardTopics: ["subtopic-2"],
    });
    expect(topics[0]!.subtopics).toEqual(["subtopic-1", "subtopic-2"]);
    expect(topics[0]!.selfHard).toBe(true);
  });

  it("eski satır (alt başlıksız, ünite oturumu yok) bugünkü gibi", async () => {
    const topics = await loadPrepScheduleTopics(fakeDb({ exam_prep_topics: [row], document_topic_nodes: [] }), {
      prepId: "prep",
      previous: { sessions: [{ topicId: "leaf-1", topicTitle: "Topic Alpha", sourcePages: [], role: "learn" }] } as never,
      hardTopics: [],
    });
    expect(topics[0]!.subtopics).toBeUndefined();
    expect(topics[0]!.pageNumbers).toEqual(range(1, 12));
  });
});

describe("loadIntakeMainUnits: kayıtlı haritadan ana üniteler", () => {
  // İki dosya ayrı haritalanmış (ortak kurs etiketi yok): aynı tema iki haritada ayrı ünite olarak durur.
  const unitRow = (id: string, documentId: string, title: string, order: number, stage: 1 | 2 | 3 | 4) => ({
    id,
    document_id: documentId,
    title,
    parent_id: null,
    sort_order: order,
    ...packTopicPerspective({ examWeight: "medium" }),
    key_relations: [
      ...packTopicPerspective({ examWeight: "medium" }).key_relations,
      packCourseRelation(`course-${documentId}`),
      packStageRelation(stage),
    ],
  });
  const leafRow = (id: string, documentId: string, title: string, parent: string, order: number, prerequisites: string[] = []) => ({
    id,
    document_id: documentId,
    title,
    parent_id: parent,
    sort_order: order,
    ...packTopicPerspective({ examWeight: "medium", prerequisiteTitles: prerequisites }),
  });
  const pageRow = (documentId: string, page: number, text: string) => ({
    document_id: documentId,
    page_number: page,
    page_kind: "content",
    char_count: text.length,
    text_content: text,
  });
  const body = (word: string) => `${word} açıklaması. `.repeat(60);
  const tables = {
    documents: [
      { id: "doc-a", user_id: "u1", file_name: "doc-a.pdf", topic_map_status: "ready" },
      { id: "slide-b", user_id: "u1", file_name: "slide-b.pptx", topic_map_status: "ready" },
    ],
    document_topic_nodes: [
      unitRow("ua1", "doc-a", "Topic Alpha", 0, 2),
      unitRow("ua2", "doc-a", "Topic Beta", 1, 1),
      unitRow("ub1", "slide-b", "Topic Alpha", 0, 2),
      leafRow("la1", "doc-a", "subtopic-sigma", "ua1", 2),
      leafRow("la2", "doc-a", "subtopic-kappa", "ua1", 3, ["subtopic-theta"]),
      leafRow("la3", "doc-a", "subtopic-theta", "ua2", 4),
      leafRow("lb1", "slide-b", "subtopic-omega", "ub1", 5),
    ],
    document_topic_page_links: [
      ...[1, 2].map((page) => ({ document_id: "doc-a", topic_id: "la1", page_number: page })),
      { document_id: "doc-a", topic_id: "la2", page_number: 3 },
      ...[4, 5].map((page) => ({ document_id: "doc-a", topic_id: "la3", page_number: page })),
      { document_id: "slide-b", topic_id: "lb1", page_number: 2 },
    ],
    document_pages: [
      ...range(1, 5).map((page) => pageRow("doc-a", page, body(`topic-alpha page-${page}`))),
      pageRow("doc-a", 6, "References\nAuthor A. (2019). Book one.\nAuthor B. (2020). Book two.\nAuthor C. (2021). Book three.\nAuthor D. (2018). Book four."),
      pageRow("slide-b", 1, "Topic Alpha"),
      pageRow("slide-b", 2, body("slide-two")),
    ],
  };

  it("aynı adlı üniteler (iki dosya) tek ünite; önkoşul üniteye çevrilir; gürültü sayfası sayılmaz", async () => {
    const result = await loadIntakeMainUnits(fakeDb(tables), "u1", ["doc-a", "slide-b"]);
    expect(result).not.toBeNull();
    // doc-a 5 + slide-b 1 öğretilebilir sayfa (kaynakça ve yalnız başlık slaytı hariç) → 1–3 ünite.
    expect(result!.consolidation.effectivePageCount).toBe(6);
    const titles = result!.topics.map((unit) => unit.title);
    expect(titles.filter((title) => title === "Topic Alpha")).toHaveLength(1);
    const alpha = result!.topics.find((unit) => unit.title === "Topic Alpha")!;
    expect(alpha.subtopics).toEqual(["subtopic-sigma", "subtopic-kappa", "subtopic-omega"]);
    expect(alpha.sources.map((ref) => ref.nodeId)).toEqual(["la1", "la2", "lb1"]);
    expect(alpha.nodeIds[0]).toBe("la1");
    expect(alpha.prerequisites).toEqual(["Topic Beta"]);
    expect(alpha.lessonGroups).toHaveLength(1);
    // Çok belgeli kursta basamak sırası: Topic Beta (1) önce.
    expect(titles).toEqual(["Topic Beta", "Topic Alpha"]);
  });

  it("kapsam dışı ince konu üniteye girmez", async () => {
    const result = await loadIntakeMainUnits(fakeDb(tables), "u1", ["doc-a", "slide-b"], { exclusionPhrases: ["subtopic-kappa"] });
    const alpha = result!.topics.find((unit) => unit.title === "Topic Alpha")!;
    expect(alpha.subtopics).not.toContain("subtopic-kappa");
    expect(result!.excluded.map((note) => note.title)).toEqual(["subtopic-kappa"]);
  });
});
