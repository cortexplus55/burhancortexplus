/**
 * Paket I (30 Ekim 2026) — konu haritası belgenin iskeletini yutmaz, kararlıdır.
 *
 * Canlı stres testi: muhasebe notunda "Mizan", "Tekdüzen Hesap Planı", "Azalan Bakiyeler" ayrı konu olmadı;
 * veri yapıları notunda bir kurulumda 14, ötekinde 22 konu çıktı, "Kuyruk" yığınla birleşti, "Hash" yoktu,
 * "finalde yok" denen başlık konu oldu. Örnekler üç farklı dersten; kodda ders adı ya da terim yok.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "./helpers/fake-supabase";
import { model } from "./helpers/outline-model-mock";

vi.mock("@/lib/ai/generate", async () => (await import("./helpers/outline-model-mock")).generateModule());
vi.mock("@/lib/env", async () => (await import("./helpers/outline-model-mock")).outlineEnv);

import {
  buildDocumentSkeleton,
  headingNamedIn,
  mergeOutlinePatch,
  orderOutlineByPosition,
  sameWordStem,
  skeletonCoverage,
  skeletonExclusions,
} from "@/lib/documents/outline-skeleton";
import {
  prepareOutlineMaterial,
  runOutlineStep,
  type OutlineProgress,
  type OutlineStepResult,
} from "@/lib/documents/outline-oneshot";
import type { OutlineUnitDraft } from "@/lib/documents/outline-clean";
import { extractTocEntries } from "@/lib/documents/outline-clean";
import { exclusionPhrases } from "@/lib/learning/cross-material-topics";
import { splitExcludedTopics } from "@/lib/learning/topic-scope";
import { readSyllabusScope } from "@/lib/learning/prep-corpus";
import { sharedCourseTag, packCourseRelation } from "@/lib/documents/outline-topic-meta";
import { planCourseMap, runCourseMapRound } from "@/lib/documents/pdf-learning-v2";
import { loadOneshotIntakeTopics } from "@/lib/learning/intake-outline";

type Page = { pageNumber: number; text: string };

/** Öğretim işaretli gövde: başlığın sözcüklerini taşır (temellendirme), tanım/örnek/kural içerir. */
function teach(subject: string, chars = 700): string {
  const sentence =
    `Tanım: ${subject} bu bölümde kendi kuralıyla anlatılır. Örnek: ${subject} için bir uygulama adım adım çözülür. ` +
    `Kural: ${subject} sınavda bu biçimde sorulur. `;
  return sentence.repeat(Math.ceil(chars / sentence.length)).slice(0, chars);
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const topic = (title: string, pages: number[], fileIndex = 0, extra: Partial<OutlineUnitDraft["topics"][number]> = {}) => ({
  title,
  sourceTitles: [title],
  fileIndex,
  pageNumbers: pages,
  ...extra,
});

/** Muhasebe notu: numaralı bölümler ve içindekiler (alt bölümler dahil). */
function accountingNote(): Page[] {
  return [
    {
      pageNumber: 1,
      text: [
        "İÇİNDEKİLER",
        "1. Muhasebenin Temel Kavramları ........ 2",
        "1.1 Varlık ve Kaynak ........ 2",
        "2. Mizan ........ 4",
        "3. Tekdüzen Hesap Planı ........ 5",
        "4. Amortisman ........ 6",
        "4.1 Normal Amortisman ........ 6",
        "4.2 Azalan Bakiyeler Yöntemi ........ 7",
      ].join("\n"),
    },
    { pageNumber: 2, text: `1. Muhasebenin Temel Kavramları\nKısa giriş.\n1.1 Varlık ve Kaynak\n${teach("Varlık ve kaynak")}` },
    { pageNumber: 3, text: teach("Varlık ve kaynak dengesi") },
    { pageNumber: 4, text: `2. Mizan\n${teach("Mizan")}` },
    { pageNumber: 5, text: `3. Tekdüzen Hesap Planı\n${teach("Tekdüzen hesap planı")}` },
    { pageNumber: 6, text: `4. Amortisman\nKısa giriş.\n4.1 Normal Amortisman\n${teach("Normal amortisman")}` },
    { pageNumber: 7, text: `4.2 Azalan Bakiyeler Yöntemi\n${teach("Azalan bakiyeler yöntemi")}` },
    { pageNumber: 8, text: "Kaynakça\nKitap listesi." },
  ];
}

const RUNNING = "VERİ YAPILARI DERS NOTU";
/** Veri yapıları notu: numarasız büyük harf başlıklar, her sayfada koşan başlık, "finalde yok" notu. */
function dataStructuresNote(): Page[] {
  const pageOf = (n: number, heading: string, subject: string, tail = "") => ({
    pageNumber: n,
    text: `${RUNNING}\n${heading}\n${teach(subject)}${tail}`,
  });
  return [
    pageOf(1, "DİZİLER", "Diziler"),
    pageOf(2, "YIĞIN", "Yığın"),
    pageOf(3, "KUYRUK", "Kuyruk"),
    pageOf(4, "HASH TABLOLARI", "Hash tabloları"),
    pageOf(5, "KIRMIZI-SİYAH AĞAÇLAR", "Kırmızı-siyah ağaçlar", "\nNot: Kırmızı-siyah ağaçlar finalde yok."),
    pageOf(6, "SIRALAMA ALGORİTMALARI", "Sıralama algoritmaları"),
  ];
}

/** Biyoloji slaytları: her slaydın ilk satırı başlık; aynı başlıklı ardışık slaytlar tek bölüm. */
function biologySlides(): Page[] {
  return [
    { pageNumber: 1, text: "Hücre Bölünmesi\nDers sunumu" },
    { pageNumber: 2, text: `Mitoz Evreleri\n${teach("Mitoz evreleri", 320)}` },
    { pageNumber: 3, text: `Mitoz Evreleri\n${teach("Mitoz evreleri sitokinez", 320)}` },
    { pageNumber: 4, text: `Mayoz ve Krossing Over\n${teach("Mayoz ve krossing over", 650)}` },
    { pageNumber: 5, text: `Kontrol Noktaları\n${teach("Kontrol noktaları", 650)}` },
    { pageNumber: 6, text: "Özet\nKısa tekrar." },
  ];
}

describe("Paket I-2.1 — belgenin iskeleti koddan", () => {
  it("numaralı not: içindekiler alt bölümleri okunur, kısa bölüm adları (Mizan) da başlıktır, üst başlık alt başlıklarıyla ölçülür", () => {
    const toc = extractTocEntries(accountingNote());
    expect(toc.map((entry) => entry.title)).toContain("Mizan");
    expect(toc.find((entry) => entry.title === "Azalan Bakiyeler Yöntemi")).toMatchObject({ number: "4.2", depth: 2, printedPage: 7 });

    const { headings } = buildDocumentSkeleton([{ fileName: "muhasebe.pdf", pages: accountingNote() }]);
    const byTitle = new Map(headings.map((heading) => [heading.title, heading]));
    expect([...byTitle.keys()]).toEqual(
      expect.arrayContaining(["Mizan", "Tekdüzen Hesap Planı", "Azalan Bakiyeler Yöntemi", "Varlık ve Kaynak"]),
    );
    expect(byTitle.get("Mizan")).toMatchObject({ page: 4, pages: [4], teaching: true, parent: false });
    expect(byTitle.get("Mizan")!.sources).toEqual(["numbered", "toc"]);
    expect(byTitle.get("Muhasebenin Temel Kavramları")).toMatchObject({ parent: true, teaching: false });
    expect(byTitle.get("Varlık ve Kaynak")!.pages).toEqual([2, 3]);
    // İçindekiler sayfasının satırları gövde başlığı değildir.
    expect(headings.every((heading) => heading.page !== 1)).toBe(true);
  });

  it("büyük harf başlıklı not: her sayfadaki koşan başlık iskelete girmez", () => {
    const { headings } = buildDocumentSkeleton([{ fileName: "ders.pdf", pages: dataStructuresNote() }]);
    expect(headings.map((heading) => heading.title)).toEqual([
      "Diziler",
      "Yığın",
      "Kuyruk",
      "Hash tabloları",
      "Kırmızı-siyah ağaçlar",
      "Sıralama algoritmaları",
    ]);
    expect(headings.every((heading) => heading.sources[0] === "caps" && heading.teaching)).toBe(true);
  });

  it("slayt destesi: slayt başlıkları bölümdür, aynı başlıklı slaytlar tek bölüm, ilk slayt destenin adı", () => {
    const { headings } = buildDocumentSkeleton([{ fileName: "hucre-bolunmesi.pptx", pages: biologySlides() }]);
    const mitosis = headings.find((heading) => heading.title === "Mitoz Evreleri")!;
    expect(mitosis).toMatchObject({ pages: [2, 3], teaching: true });
    expect(mitosis.sources).toEqual(["slide"]);
    expect(headings[0]).toMatchObject({ title: "Hücre Bölünmesi", documentTitle: true });
  });

  it("içindekiler satırı gövdede düz satır olarak duruyorsa da eşleşir", () => {
    const pages: Page[] = [
      { pageNumber: 1, text: "İÇİNDEKİLER\nGiriş 2\nPiyasa dengesi 3\nVergi yükünün dağılımı 4" },
      { pageNumber: 2, text: `Giriş\n${teach("İktisat", 200)}` },
      { pageNumber: 3, text: `Piyasa dengesi\n${teach("Piyasa dengesi")}` },
      { pageNumber: 4, text: `Vergi yükünün dağılımı\n${teach("Vergi yükünün dağılımı")}` },
    ];
    const { headings } = buildDocumentSkeleton([{ fileName: "iktisat.pdf", pages }]);
    expect(headings.find((heading) => heading.title === "Vergi yükünün dağılımı")).toMatchObject({ sources: ["toc"], page: 4 });
  });

  it("Türkçe ek almış sözcük aynı köktür; başka sözcük değildir", () => {
    expect(sameWordStem("agaclar", "agaci")).toBe(true);
    expect(sameWordStem("bakiyeler", "bakiye")).toBe(true);
    expect(sameWordStem("secmeli", "secimli")).toBe(false);
    expect(headingNamedIn("Azalan Bakiyeler Yöntemi", ["Amortisman Yöntemleri"])).toBe(false);
    expect(headingNamedIn("Kuyruk", ["Yığın ve Kuyruk Yapıları"])).toBe(true);
  });
});

describe("Paket I-2.2 — kapsam başlık düzeyinde", () => {
  it("muhasebe: içinde kalan ve hiçbir konuya bağlanmayan başlık yutulmuş sayılır; üst ve ön/arka madde ölçülmez", () => {
    const skeleton = buildDocumentSkeleton([{ fileName: "muhasebe.pdf", pages: accountingNote() }]);
    const units: OutlineUnitDraft[] = [
      { title: "Muhasebe Temelleri", topics: [topic("Muhasebenin Temel Kavramları", range(2, 5))] },
      { title: "Amortisman", topics: [topic("Amortisman Yöntemleri", [6])] },
    ];
    const coverage = skeletonCoverage(skeleton, units, { singleFile: true });
    expect(coverage.gaps.map((gap) => [gap.heading, gap.inTopic])).toEqual([
      ["Mizan", "Muhasebenin Temel Kavramları"],
      ["Tekdüzen Hesap Planı", "Muhasebenin Temel Kavramları"],
      ["Azalan Bakiyeler Yöntemi", null],
    ]);
    expect(coverage.gaps.find((gap) => gap.heading === "Mizan")).toMatchObject({ pageStart: 4, pageEnd: 4, label: "2. Mizan" });
    // "Varlık ve Kaynak" konunun ilk bölümü (ayrı konu sayılır); "Kaynakça" ve üst başlıklar ölçülmez.
    expect(coverage.measured).toBe(5);
    expect(coverage.represented).toBe(2);
  });

  it("ayrı konu başka adla, konu/ünite adı ya da kayıtlı birleştirme: yutma değil", () => {
    const skeleton = buildDocumentSkeleton([{ fileName: "muhasebe.pdf", pages: accountingNote() }]);
    const units: OutlineUnitDraft[] = [
      {
        title: "Muhasebe Temelleri",
        topics: [
          topic("Muhasebenin Temel Kavramları", range(2, 3)),
          topic("Genel Geçici Mizan Tablosu", [4]),
          topic("Hesap Kodları", [5], 0, { sourceTitles: ["Hesap Kodları", "Tekdüzen Hesap Planı"] }),
        ],
      },
      { title: "Amortisman", topics: [topic("Normal Amortisman", [6]), topic("Hızlandırılmış Yöntem", [7])] },
    ];
    expect(skeletonCoverage(skeleton, units, { singleFile: true }).gaps).toEqual([]);
  });

  it("veri yapıları: yığına katılan kuyruk ve hiç açılmayan hash yutulmuş; 'finalde yok' denen başlık sayılmaz", () => {
    const pages = dataStructuresNote();
    const files = [{ fileName: "ders.pdf", pages }];
    const exclusions = skeletonExclusions(files);
    expect(exclusions).toContain("Kırmızı-siyah ağaçlar");
    const units: OutlineUnitDraft[] = [
      {
        title: "Temel Veri Yapıları",
        topics: [
          topic("Diziler", [1]),
          topic("Yığın", [2, 3]),
          topic("Kırmızı-Siyah Ağaçlar", [5]),
          topic("Sıralama Algoritmaları", [6]),
        ],
      },
    ];
    const coverage = skeletonCoverage(buildDocumentSkeleton(files), units, { exclusions, singleFile: true });
    expect(coverage.gaps.map((gap) => [gap.label, gap.inTopic])).toEqual([
      ["KUYRUK", "Yığın"],
      ["HASH TABLOLARI", null],
    ]);
    expect(coverage.excludedHeadings).toEqual(["Kırmızı-siyah ağaçlar"]);
    expect(coverage.excludedTopics.map((item) => item.title)).toEqual(["Kırmızı-Siyah Ağaçlar"]);
  });

  it("biyoloji slaytları: yan slayttaki bölüm (Kontrol Noktaları) mayoz konusuna katılmış", () => {
    const skeleton = buildDocumentSkeleton([{ fileName: "hucre-bolunmesi.pptx", pages: biologySlides() }]);
    const units: OutlineUnitDraft[] = [
      { title: "Hücre Bölünmesi", topics: [topic("Mitoz", [2, 3]), topic("Mayoz Bölünme", [4, 5])] },
    ];
    expect(skeletonCoverage(skeleton, units, { singleFile: true }).gaps.map((gap) => [gap.heading, gap.inTopic])).toEqual([
      ["Kontrol Noktaları", "Mayoz Bölünme"],
    ]);
  });

  it("gövdesi olmayan etiket ve kısa liste başlığı ölçülmez", () => {
    const pages: Page[] = [
      { pageNumber: 1, text: `1. Kuvvet\n${teach("Kuvvet")}` },
      { pageNumber: 2, text: "2. Hatırlatma Notu\nKısa.\n3. Birimler\n- N\n- kg\n4. İş ve Enerji\nkısa satır" },
    ];
    const skeleton = buildDocumentSkeleton([{ fileName: "fizik.pdf", pages }]);
    const coverage = skeletonCoverage(skeleton, [{ title: "Fizik", topics: [topic("Kuvvet", [1])] }], { singleFile: true });
    expect(coverage.gaps).toEqual([]);
    expect(coverage.measured).toBe(1);
  });

  it("numaralı öğe etiketi (SORU 3, ŞEKİL 2) ve çözümlü örnek bölüm değildir", () => {
    const pages: Page[] = [
      { pageNumber: 1, text: `1. Basınç\n${teach("Basınç")}` },
      { pageNumber: 2, text: `SORU 3\n${teach("Basınç sorusu")}\nŞEKİL 2\n${teach("Basınç şekli")}` },
      { pageNumber: 3, text: `Çözümlü Örnek\n${teach("Basınç çözümü")}` },
    ];
    const titles = buildDocumentSkeleton([{ fileName: "fizik.pdf", pages }]).headings.map((heading) => heading.title);
    expect(titles).toEqual(["Basınç"]);
  });
});

describe("Paket I-2.4 — kapsam dışı başlık", () => {
  it("ders notunun kısa notu ve müfredat cümlesi aynı okuyucudan", () => {
    expect(exclusionPhrases("Not: Kırmızı-siyah ağaçlar finalde yok.")).toEqual(["Kırmızı-siyah ağaçlar"]);
    expect(exclusionPhrases("Finalde Kalıtsal Hastalıklar yok")).toEqual(["Kalıtsal Hastalıklar"]);
    expect(exclusionPhrases("Ekonomik büyüme modelleri vizede sorulmayacak.")).toEqual(["Ekonomik büyüme modelleri"]);
    expect(exclusionPhrases("Geçici maddeler sınav kapsamı dışındadır.")).toEqual(["Geçici maddeler"]);
    expect(exclusionPhrases("Kapsam dışı: Osmanlı duraklama dönemi")).toEqual(["Osmanlı duraklama dönemi"]);
    expect(exclusionPhrases("Bu bölümde tanımlar ve örnekler var.")).toEqual([]);
  });

  it("konu hazırlık listesine girmez, kapsam dışı notuyla görünür; üniteler yeniden sayılır; hepsini düşüren ifade yok sayılır", () => {
    const topics = [{ title: "Yığın" }, { title: "Kırmızı-Siyah Ağaçlar" }, { title: "Kuyruk" }];
    const units = [{ title: "Yapılar", topicIndexes: [0, 1, 2] }];
    const split = splitExcludedTopics(topics, units, ["Kırmızı-siyah ağaçlar"]);
    expect(split.topics.map((item) => item.title)).toEqual(["Yığın", "Kuyruk"]);
    expect(split.units).toEqual([{ title: "Yapılar", topicIndexes: [0, 1] }]);
    expect(split.excluded[0]).toMatchObject({ title: "Kırmızı-Siyah Ağaçlar" });
    expect(split.excluded[0]!.reason).toContain("kapsam dışı");
    expect(splitExcludedTopics([{ title: "Yığın" }], [], ["Yığın"]).topics).toHaveLength(1);
  });

  it("sohbetin kapsam okuyucusu da kısa notu tanır", () => {
    const scope = readSyllabusScope([{ documentName: "not.pdf", text: "Kalıtsal hastalıklar finalde yok." }]);
    expect(scope.excluded.map((hit) => hit.topic)).toContain("Kalıtsal hastalıklar");
  });
});

describe("Paket I-2.3 — yutulan başlık için yalnız o bölüme onarım (sahte model)", () => {
  beforeEach(() => {
    model.calls.length = 0;
    model.impl = () => null;
  });

  const draftTopic = (id: string, title: string, start: number, end: number) => ({
    id,
    title,
    whyLearn: "Öğreneceksin.",
    description: "",
    fileIndex: 0,
    pageStart: start,
    pageEnd: end,
    examWeight: "high",
    likelyAsked: [],
    prerequisiteIds: [],
  });
  const first = {
    units: [
      {
        title: "Temel Veri Yapıları",
        examWeight: "high",
        topics: [
          draftTopic("t1", "Diziler", 1, 1),
          draftTopic("t2", "Yığın", 2, 3),
          draftTopic("t3", "Kırmızı-Siyah Ağaçlar", 5, 5),
          draftTopic("t4", "Sıralama Algoritmaları", 6, 6),
        ],
      },
    ],
  };
  const patch = {
    units: [
      {
        title: "Temel Veri Yapıları",
        examWeight: "high",
        topics: [draftTopic("p1", "Kuyruk", 3, 3), draftTopic("p2", "Hash Tabloları", 4, 4)],
      },
    ],
  };

  async function runAll(material: ReturnType<typeof prepareOutlineMaterial>) {
    const service = makeFakeDb({ credit_reservations: [] }, { creditCost: 3 }).client;
    let progress: OutlineProgress = { stage: "first" };
    let result: OutlineStepResult | null = null;
    for (let step = 1; step <= 6; step += 1) {
      result = await runOutlineStep({
        service: service as never,
        userId: "u1",
        material,
        progress,
        keyFor: (stage) => `k:${step}:${stage}`,
        deadlineAt: Date.now() + 300_000,
      });
      if (result.kind !== "continue") break;
      progress = result.progress;
    }
    return result;
  }

  it("ilk harita kuyruğu ve hash'i yutar → onarım yalnız 3-4. sayfaları okur → iki konu eklenir, öbürleri olduğu gibi kalır", async () => {
    const material = prepareOutlineMaterial([{ fileName: "ders.pdf", pages: dataStructuresNote() }]);
    model.impl = () => (model.calls.length === 1 ? first : patch);
    const result = await runAll(material);
    expect(model.calls).toHaveLength(2);
    const prompt = model.calls[1]!.prompt;
    expect(prompt).toContain("YUTULAN BAŞLIKLAR — AYRI KONU YAZ");
    expect(prompt).toContain('"KUYRUK" (d1 s.3-3): şu an "Yığın" konusunun içinde kalmış');
    expect(prompt).toContain('"HASH TABLOLARI" (d1 s.4-4): hiçbir konuya bağlanmamış');
    expect(prompt).toContain("Haritanın geri kalanına DOKUNMA");
    const listed = prompt.slice(prompt.indexOf("YUTULAN"), prompt.indexOf("KURAL:"));
    expect(listed).not.toContain("KIRMIZI");
    const corpus = prompt.slice(prompt.indexOf("Materyal (yalnız"));
    expect(corpus).toContain("[d1 s.3]");
    expect(corpus).toContain("[d1 s.4]");
    expect(corpus).not.toContain("[d1 s.1]");
    expect(corpus).not.toContain("[d1 s.6]");

    expect(result?.kind).toBe("done");
    if (result?.kind !== "done") return;
    expect(result.path).toBe("patch");
    const topics = result.map.units.flatMap((unit) => unit.topics);
    expect(topics.map((item) => item.title)).toEqual([
      "Diziler",
      "Yığın",
      "Kuyruk",
      "Hash Tabloları",
      "Kırmızı-Siyah Ağaçlar",
      "Sıralama Algoritmaları",
    ]);
    expect(topics.find((item) => item.title === "Yığın")!.pageNumbers).toEqual([2, 3]);
    expect(result.map.kept).toBe(6);
    expect(result.map.reservationIds).toHaveLength(2);
  });

  it("onarım düşerse doğrulanmış harita kalır; yutma yoksa tek çağrı", async () => {
    const material = prepareOutlineMaterial([{ fileName: "ders.pdf", pages: dataStructuresNote() }]);
    model.impl = () => (model.calls.length === 1 ? first : { error: "generation_failed" });
    const failed = await runAll(material);
    expect(failed).toMatchObject({ kind: "done", path: "kept" });
    if (failed?.kind === "done") expect(failed.map.kept).toBe(4);

    model.calls.length = 0;
    const complete = {
      units: [{ ...first.units[0]!, topics: [...first.units[0]!.topics, ...patch.units[0]!.topics] }],
    };
    model.impl = () => complete;
    const once = await runAll(material);
    expect(model.calls).toHaveLength(1);
    expect(once).toMatchObject({ kind: "done", path: "first" });
  });

  it("onarımın yeni ünitesi ve sayfa yeri: yutan konunun ünitesine, belge sırasına göre girer", () => {
    const units: OutlineUnitDraft[] = [
      { title: "Hücre", topics: [topic("Mitoz", [2, 3]), topic("Mayoz Bölünme", [4, 5])] },
      { title: "Kalıtım", topics: [topic("Mendel Yasaları", [8])] },
    ];
    const merged = mergeOutlinePatch(
      units,
      [{ title: "Bölünme Denetimi", topics: [topic("Kontrol Noktaları", [5]), topic("Mitoz", [2])] }],
      [{ heading: "Kontrol Noktaları", label: "Kontrol Noktaları", fileIndex: 0, pageStart: 5, pageEnd: 5, inTopic: "Mayoz Bölünme" }],
      40,
    );
    expect(merged.added).toEqual(["Kontrol Noktaları"]);
    expect(merged.units[0]!.topics.map((item) => item.title)).toEqual(["Mitoz", "Mayoz Bölünme", "Kontrol Noktaları"]);
    expect(merged.units).toHaveLength(2);
    expect(mergeOutlinePatch(units, [{ title: "X", topics: [topic("Yeni Konu", [9])] }], [], 3).added).toEqual([]);
  });
});

describe("Paket I-2.5 — kararlılık", () => {
  it("aynı konular hangi sırayla gelirse gelsin aynı sırayla yazılır (belge sırası, önkoşul önce)", () => {
    const a: OutlineUnitDraft[] = [
      { title: "Amortisman", topics: [topic("Azalan Bakiyeler", [7]), topic("Normal Amortisman", [6])] },
      { title: "Temeller", topics: [topic("Mizan", [4]), topic("Varlık ve Kaynak", [2])] },
    ];
    const b: OutlineUnitDraft[] = [
      { title: "Temeller", topics: [topic("Varlık ve Kaynak", [2]), topic("Mizan", [4])] },
      { title: "Amortisman", topics: [topic("Normal Amortisman", [6]), topic("Azalan Bakiyeler", [7])] },
    ];
    const flat = (units: OutlineUnitDraft[]) => units.flatMap((unit) => unit.topics.map((item) => item.title));
    expect(flat(orderOutlineByPosition(a))).toEqual(flat(orderOutlineByPosition(b)));
    expect(flat(orderOutlineByPosition(a))).toEqual(["Varlık ve Kaynak", "Mizan", "Normal Amortisman", "Azalan Bakiyeler"]);

    const withPrereq: OutlineUnitDraft[] = [
      { title: "Fizik", topics: [topic("Hareket", [3], 0, { prerequisiteTitles: ["Vektörler"] }), topic("Vektörler", [5])] },
    ];
    expect(flat(orderOutlineByPosition(withPrereq))).toEqual(["Vektörler", "Hareket"]);
  });

  it("çok dosyada dosyalar arası diziliş haritanınki, her dosyanın konuları kendi belge sırasında", () => {
    const units: OutlineUnitDraft[] = [
      { title: "Ünite", topics: [topic("B-5", [5], 1), topic("A-9", [9], 0), topic("B-2", [2], 1), topic("A-1", [1], 0)] },
    ];
    expect(orderOutlineByPosition(units)[0]!.topics.map((item) => item.title)).toEqual(["B-2", "A-1", "B-5", "A-9"]);
  });

  it("ortak kurs etiketi: kursun alt kümesi (ilk belge çıkarılmış) kurs sayılır; ayrı haritalar sayılmaz", () => {
    const unit = (course: string) => ({ parent_id: null, key_relations: [packCourseRelation(course)] });
    const leaf = { parent_id: "u", key_relations: [] };
    expect(sharedCourseTag([[unit("dA"), leaf], [unit("dA"), leaf]])).toBe("dA");
    expect(sharedCourseTag([[unit("dA"), leaf], [], [unit("dA")]])).toBe("dA");
    expect(sharedCourseTag([[unit("dB")], [unit("dC")]])).toBeNull();
    expect(sharedCourseTag([[], []])).toBeNull();
  });
});

describe("Paket I-2.5 — belge çıkarılınca harita sıfırdan yazılmaz (sahte DB)", () => {
  beforeEach(() => {
    model.calls.length = 0;
  });

  const pageText = (subject: string) => `${subject}\n${subject} bu sayfada anlatılır. Kısa açıklama.`;
  const docs = [
    { id: "dA", name: "a.pdf", subjects: ["Kinematik Temeller", "Newton Yasaları"] },
    { id: "dB", name: "b.pdf", subjects: ["Termodinamik Giriş", "Isı Aktarımı"] },
    { id: "dC", name: "c.pdf", subjects: ["Optik Kırılma", "Mercek Denklemi"] },
  ];
  function mkDb() {
    return makeFakeDb(
      {
        documents: docs.map((doc) => ({ id: doc.id, user_id: "u1", file_name: doc.name, topic_map_status: "pending", status: "processing", deleted_at: null })),
        document_pages: docs.flatMap((doc) =>
          doc.subjects.map((subject, i) => ({
            id: `${doc.id}p${i + 1}`, document_id: doc.id, page_number: i + 1, text_content: pageText(subject),
            extraction_ok: true, page_kind: null, extraction_method: "text", headings: [], char_count: 60,
          })),
        ),
        document_topic_map_jobs: [], document_topic_nodes: [], document_topic_page_links: [], document_coverage_reports: [],
        exam_preps: [], exam_prep_topics: [], credit_reservations: [],
      },
      { creditCost: 3 },
    );
  }

  it("üç belgelik kurstan ilk belge çıkarılınca kalan ikisi haritasıyla, kurs sırasıyla okunur; model çağrılmaz", async () => {
    const { client } = mkDb();
    model.impl = () => ({
      units: [
        {
          title: "Fizik",
          examWeight: "medium",
          topics: docs.flatMap((doc, fileIndex) =>
            doc.subjects.map((subject, i) => ({
              id: `${doc.id}${i}`, title: subject, whyLearn: "Öğreneceksin.", description: "", fileIndex,
              pageStart: i + 1, pageEnd: i + 1, examWeight: "medium", likelyAsked: [], prerequisiteIds: [],
            })),
          ),
        },
      ],
    });
    for (let round = 0; round < 6; round += 1) {
      const result = await runCourseMapRound(client as never, { documentIds: ["dA", "dB", "dC"], fromCourse: true });
      if (!result.pending) break;
    }
    const callsAfterMap = model.calls.length;
    expect(callsAfterMap).toBe(1);

    expect(await planCourseMap(client as never, ["dB", "dC"])).toEqual([]);
    expect(await planCourseMap(client as never, ["dA", "dC"])).toEqual([]);
    const intake = await loadOneshotIntakeTopics(client as never, "u1", ["dB", "dC"]);
    expect(intake!.topics.map((item) => item.title)).toEqual(["Termodinamik Giriş", "Isı Aktarımı", "Optik Kırılma", "Mercek Denklemi"]);
    expect(model.calls.length).toBe(callsAfterMap);
  });
});
