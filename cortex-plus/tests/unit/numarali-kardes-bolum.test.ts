import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  NUMBERED_SIBLING_BODY_MIN,
  buildDocumentSkeleton,
  measuredSkeletonHeadings,
  mergeOutlinePatch,
  skeletonCoverage,
  skeletonPromptBlock,
} from "@/lib/documents/outline-skeleton";
import { SWALLOWED_BODY_MIN } from "@/lib/documents/outline-oversize";
import { OUTLINE_GRANULARITY_RULE } from "@/lib/documents/outline-oneshot";
import type { OutlineUnitDraft } from "@/lib/documents/outline-clean";

/*
  Numaralı kardeş bölümler yutulmaz (6 Kasım 2026, canlı telefon denetiminde bulundu). Özet notta "1. …", "2. …",
  "3. …", "4. …" diye numaralanmış dört bölümün gövdesi 100-300 karakterdi; iskelet 450 karakterin altındaki
  bölümü ölçmüyordu, harita dördünü iki konuda eritti. Örnekler başka derslerden; kodda ders terimi yok.
*/

const read = (path: string) => readFileSync(path, "utf8");

/** Belirli uzunlukta, başlığın sözcüğünü taşıyan kısa gövde (öğretim işareti yok). */
function body(subject: string, chars: number): string {
  const sentence = `${subject} piyasada fiyatla birlikte değişen bir büyüklüktür ve grafikte gösterilir. `;
  return sentence.repeat(Math.ceil(chars / sentence.length)).slice(0, chars);
}

/** İki sayfalık özet not: dört numaralı bölüm, her biri 120-260 karakter. */
function summaryNote() {
  return [
    {
      fileName: "ozet.pdf",
      pages: [
        {
          pageNumber: 1,
          text: ["Ekonomiye Giriş Özet", "1. Arz", body("Arz", 180), "2. Talep", body("Talep", 220)].join("\n"),
        },
        {
          pageNumber: 2,
          text: ["3. Piyasa Dengesi", body("Denge", 260), "4. Esneklik", body("Esneklik", 130)].join("\n"),
        },
      ],
    },
  ];
}

const topic = (title: string, pages: number[]) => ({ title, sourceTitles: [title], fileIndex: 0, pageNumbers: pages });

describe("iskelet: numaralı kardeş bölümler", () => {
  it("450 karakterin altındaki numaralı bölümler de ölçülür ve ilk istemde listelenir", () => {
    const skeleton = buildDocumentSkeleton(summaryNote());
    const sections = skeleton.headings.filter((heading) => heading.number);
    expect(sections.map((heading) => heading.title)).toEqual(["Arz", "Talep", "Piyasa Dengesi", "Esneklik"]);
    for (const heading of sections) {
      expect(heading.bodyChars).toBeLessThan(SWALLOWED_BODY_MIN);
      expect(heading.teaching).toBe(false);
      expect(heading.numberedSibling).toBe(true);
    }
    expect(measuredSkeletonHeadings(skeleton).measured.map((heading) => heading.title)).toEqual([
      "Arz",
      "Talep",
      "Piyasa Dengesi",
      "Esneklik",
    ]);
    const block = skeletonPromptBlock(skeleton, { maxTopics: 40 });
    for (const label of ["1. Arz", "2. Talep", "3. Piyasa Dengesi", "4. Esneklik"]) expect(block).toContain(label);
    expect(block).toContain("Her biri ayrı bir konu olsun");
  });

  it("iki bölümü bir konuda eriten harita yutmuş sayılır; dört ayrı konu temsil eder", () => {
    const skeleton = buildDocumentSkeleton(summaryNote());
    const merged: OutlineUnitDraft[] = [
      { title: "Ekonomi", topics: [topic("Arz ve Talep", [1]), topic("Piyasa Dengesi ve Esneklik", [2])] },
    ];
    expect(skeletonCoverage(skeleton, merged, { singleFile: true }).gaps.map((gap) => gap.heading)).toEqual([
      "Arz",
      "Talep",
      "Piyasa Dengesi",
      "Esneklik",
    ]);
    const split: OutlineUnitDraft[] = [
      {
        title: "Ekonomi",
        topics: [topic("Arz", [1]), topic("Talep", [1]), topic("Piyasa Dengesi", [2]), topic("Esneklik", [2])],
      },
    ];
    expect(skeletonCoverage(skeleton, split, { singleFile: true }).gaps).toEqual([]);
  });

  it("kodun kaydettiği birleştirme (sourceTitles) eskisi gibi temsil sayılır", () => {
    const skeleton = buildDocumentSkeleton(summaryNote());
    const recorded: OutlineUnitDraft[] = [
      {
        title: "Ekonomi",
        topics: [
          { ...topic("Arz ve Talep", [1]), sourceTitles: ["Arz ve Talep", "Arz", "Talep"] },
          topic("Piyasa Dengesi", [2]),
          topic("Esneklik", [2]),
        ],
      },
    ];
    expect(skeletonCoverage(skeleton, recorded, { singleFile: true }).gaps).toEqual([]);
  });

  it("bölümün içindeki, yeniden 1'den başlayan adım listesi bölüm sayılmaz (gövdesi uzun olsa da)", () => {
    const step = (subject: string) => body(subject, 140);
    const skeleton = buildDocumentSkeleton([
      {
        fileName: "fizik.pdf",
        pages: [
          {
            pageNumber: 1,
            text: [
              "1. Problem Çözme Yöntemi",
              body("Yöntem", 600),
              "1. Verileri Yaz",
              step("Veri"),
              "2. Formülü Seç",
              step("Formül"),
              "3. Sonucu Denetle",
              step("Sonuç"),
            ].join("\n"),
          },
        ],
      },
    ]);
    expect(skeleton.headings.map((heading) => heading.title)).toEqual(expect.arrayContaining(["Verileri Yaz", "Formülü Seç", "Sonucu Denetle"]));
    expect(skeleton.headings.filter((heading) => heading.numberedSibling)).toEqual([]);
  });

  it("gövdesiz numaralı madde dizisi bölüm değildir", () => {
    const skeleton = buildDocumentSkeleton([
      {
        fileName: "liste.pdf",
        pages: [{ pageNumber: 1, text: ["1. Birinci Madde", "2. İkinci Madde", "3. Üçüncü Madde", "4. Dördüncü Madde"].join("\n") }],
      },
    ]);
    expect(skeleton.headings.filter((heading) => heading.number).length).toBe(4);
    expect(skeleton.headings.some((heading) => heading.numberedSibling)).toBe(false);
    expect(NUMBERED_SIBLING_BODY_MIN).toBeLessThanOrEqual(100);
  });

  it("onarım her bölümü ayrı yazınca şemsiye konu çıkar; biri eksikse şemsiye kalır", () => {
    const skeleton = buildDocumentSkeleton(summaryNote());
    const units: OutlineUnitDraft[] = [
      { title: "Ekonomi", topics: [topic("Arz ve Talep", [1]), topic("Piyasa Dengesi", [2]), topic("Esneklik", [2])] },
    ];
    const gaps = skeletonCoverage(skeleton, units, { singleFile: true }).gaps;
    expect(gaps.map((gap) => gap.heading)).toEqual(["Arz", "Talep"]);

    const full = mergeOutlinePatch(units, [{ title: "Ekonomi", topics: [topic("Arz", [1]), topic("Talep", [1])] }], gaps, 40);
    expect(full.added).toEqual(["Arz", "Talep"]);
    expect(full.removed).toEqual(["Arz ve Talep"]);
    expect(full.units.flatMap((unit) => unit.topics.map((item) => item.title))).toEqual([
      "Arz",
      "Talep",
      "Piyasa Dengesi",
      "Esneklik",
    ]);

    const partial = mergeOutlinePatch(units, [{ title: "Ekonomi", topics: [topic("Arz", [1])] }], gaps, 40);
    expect(partial.removed).toEqual([]);
    expect(partial.units.flatMap((unit) => unit.topics.map((item) => item.title))).toContain("Arz ve Talep");
  });

  it("harita yazarının kuralı aynı şeyi söyler", () => {
    expect(OUTLINE_GRANULARITY_RULE).toContain("NUMARALI KARDEŞ BÖLÜMLER AYRI KONUDUR");
    expect(read("src/lib/documents/outline-skeleton.ts")).not.toMatch(/Mitokondri|Ribozom|Golgi/i);
  });
});
