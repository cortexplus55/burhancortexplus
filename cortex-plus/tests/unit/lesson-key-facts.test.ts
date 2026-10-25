import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  lessonKeyFacts,
  lessonReadyToFinish,
  lessonScreenCap,
  signaturePresent,
  sourceHasWorkedProblem,
  sourceStructures,
  uncoveredKeyFacts,
  type KeyFact,
  type SourceStructure,
} from "@/lib/learning/lesson-key-facts";

/**
 * Kilit bilgi kapısı ders bağımsızdır. Dört ders dışı metin ve bir kabul örneği
 * aynı fonksiyonlardan geçer. Kabul örneğindeki sözcükler ürün kodunda durmaz.
 */

const FORBIDDEN = /mitoz|mayoz|kalıtım|kalitim|punnett|soy ağacı|soy agaci|kan grubu|9:3:3:1/i;

function pages(text: string) {
  return [{ text }];
}

function covered(text: string, structures: readonly SourceStructure[], worked: boolean) {
  return [
    {
      heading: "Konu",
      concept: "Konu",
      blocks: [
        { type: "text", text },
        ...structures.map((layout) => ({ type: "diagram", diagram: { layout } })),
        ...(worked ? [{ type: "example" }] : []),
      ],
    },
  ];
}

function expectGate(source: string, must: (facts: KeyFact[], structures: SourceStructure[]) => void) {
  const facts = lessonKeyFacts(pages(source));
  const structures = sourceStructures(pages(source));
  const worked = sourceHasWorkedProblem(source);
  must(facts, structures);
  expect(lessonReadyToFinish([{ heading: "Boş", blocks: [{ type: "text", text: "eksik özet" }] }], { facts, structures, worked })).toBe(false);
  expect(uncoveredKeyFacts(covered(source, structures, worked), facts)).toEqual([]);
  expect(lessonReadyToFinish(covered(source, structures, worked), { facts, structures, worked })).toBe(true);
}

describe("sayı imzası ve saat / tarih ayrımı", () => {
  it("oran daha uzun sayının içine gizlenmez; saat ve tarih oran ya da kesir değildir", () => {
    expect(signaturePresent("oran 3:12 yazıldı", "3:1")).toBe(false);
    expect(signaturePresent("oran 3:1 yazıldı", "3:1")).toBe(true);
    expect(signaturePresent("bileşik H2O", "H2")).toBe(false);
    expect(signaturePresent("ayrı H2 ve O2", "H2")).toBe(true);
    expect(signaturePresent("yıl 19240", "1924")).toBe(false);
    expect(signaturePresent("yıl 1924", "1924")).toBe(true);

    const clock = lessonKeyFacts(pages("Ders 12:30'da biter ve kayıt 09:15:00'te kapanır."));
    expect(clock.some((fact) => fact.kind === "ratio")).toBe(false);

    const dated = lessonKeyFacts(pages("Kuruluş 29/10/1923 tarihindedir."));
    expect(dated.some((fact) => fact.kind === "fraction")).toBe(false);
    expect(dated.some((fact) => fact.kind === "date" && fact.signatures.includes("29/10/1923"))).toBe(true);

    const ratio = lessonKeyFacts(pages("Dağılım 9:3:3:1 olarak kalır."));
    expect(ratio.some((fact) => fact.kind === "ratio" && fact.signatures.includes("9:3:3:1"))).toBe(true);
  });

  it("sıralı adımlar aynı sırada aranır; iki satırlık liste sıra değildir", () => {
    const source = "1. Alfa\n2. Beta\n3. Gama";
    const facts = lessonKeyFacts(pages(source));
    const sequence = facts.find((fact) => fact.kind === "sequence");
    expect(sequence?.steps).toEqual(["Alfa", "Beta", "Gama"]);
    const reversed = [{ blocks: [{ type: "text", text: "Gama, sonra Alfa, sonra Beta." }] }];
    expect(uncoveredKeyFacts(reversed, facts).some((fact) => fact.kind === "sequence")).toBe(true);
    const forward = [{ blocks: [{ type: "text", text: "Önce Alfa, sonra Beta, en son Gama." }] }];
    expect(uncoveredKeyFacts(forward, facts)).toEqual([]);
    expect(lessonKeyFacts(pages("1. Tek\n2. Çift")).some((fact) => fact.kind === "sequence")).toBe(false);
  });

  it("ekran tavanı bilgi yokken 12, bilgi varken en çok 16", () => {
    expect(lessonScreenCap(0)).toBe(12);
    expect(lessonScreenCap(8)).toBe(14);
    expect(lessonScreenCap(40)).toBe(16);
  });
});

describe("dört ders dışı metin ve kabul örneği aynı kapıdan geçer", () => {
  it("KPSS tarih / vatandaşlık: tarih, madde ve sıralı adım", () => {
    expectGate(
      [
        "23.04.1920 tarihinde meclis açıldı.",
        "1876 yılında ilk anayasa ilan edildi.",
        "Madde 66 temel hakları düzenler.",
        "İstisna: savaş halinde bazı haklar sınırlanır.",
        "**genel oy** 1934'te tanındı.",
        "1. Teklif",
        "2. Görüşme",
        "3. Oylama",
      ].join("\n"),
      (facts, structures) => {
        expect(facts.some((fact) => fact.signatures.includes("1876"))).toBe(true);
        expect(facts.some((fact) => fact.signatures.includes("23.04.1920"))).toBe(true);
        expect(facts.some((fact) => fact.kind === "article" && /66/.test(fact.text))).toBe(true);
        expect(facts.some((fact) => fact.kind === "callout")).toBe(true);
        expect(facts.some((fact) => fact.kind === "sequence" && fact.steps?.[0] === "Teklif")).toBe(true);
        expect(structures).toContain("flow");
      },
    );
  });

  it("kimya: formül, oran ve yüzde", () => {
    expectGate(
      ["Su H2O formülüyle anılır.", "Karışım 1 : 2 oranındadır.", "n = m/M", "%21 oksijen payı."].join("\n"),
      (facts) => {
        expect(facts.some((fact) => fact.kind === "ratio" && fact.signatures.includes("1:2"))).toBe(true);
        expect(facts.some((fact) => fact.kind === "formula" && fact.signatures.some((item) => item.includes("n=m/M")))).toBe(true);
        expect(facts.some((fact) => fact.kind === "percent")).toBe(true);
        expect(facts.some((fact) => fact.signatures.includes("H2") && !fact.signatures.includes("H2O"))).toBe(false);
      },
    );
  });

  it("matematik: çözümlü problem example ister", () => {
    const source = ["Çözümlü örnek", "Kütle ve kuvvet verilir.", "Çözüm: F = 12"].join("\n");
    expect(sourceHasWorkedProblem(source)).toBe(true);
    expectGate(source, (facts) => {
      expect(facts.some((fact) => fact.kind === "formula")).toBe(true);
      expect(facts.some((fact) => fact.signatures.includes("12") || fact.text.includes("12"))).toBe(true);
    });
    const facts = lessonKeyFacts(pages(source));
    const structures = sourceStructures(pages(source));
    const withoutExample = covered(source, structures, false);
    expect(lessonReadyToFinish(withoutExample, { facts, structures, worked: true })).toBe(false);
  });

  it("İngilizce dilbilgisi: kural, istisna ve vurgu", () => {
    expectGate(
      ["Exception: do not add an ending after a modal.", "**must** stays bare.", "There are 3 rules for this pattern."].join("\n"),
      (facts) => {
        expect(facts.some((fact) => fact.kind === "callout")).toBe(true);
        expect(facts.some((fact) => fact.kind === "emphasis" && /must/.test(fact.text))).toBe(true);
        expect(facts.some((fact) => fact.kind === "count_rule" && fact.signatures.includes("3"))).toBe(true);
      },
    );
  });

  it("kabul örneği: oran, kesir, üs, sıra, kısa tablo ve ilişki ağacı", () => {
    const source = [
      "9 : 3 : 3 : 1",
      "A_bb = 3/16",
      "Pay 1/4",
      "Üstel 2^n",
      "1. Profaz",
      "2. Metafaz",
      "3. Anafaz",
      "4. Telofaz",
      "| 0 | A | B |",
      "| --- | --- | --- |",
      "| A | 0 | AB |",
      "| B | AB | 0 |",
      "□ Anne",
      "● Çocuk",
      "Çözüm: pay 1/4",
    ].join("\n");
    expectGate(source, (facts, structures) => {
      expect(facts.some((fact) => fact.signatures.includes("9:3:3:1"))).toBe(true);
      expect(facts.some((fact) => fact.signatures.includes("3/16"))).toBe(true);
      expect(facts.some((fact) => fact.signatures.includes("1/4"))).toBe(true);
      expect(facts.some((fact) => fact.signatures.some((item) => item.includes("2^n")))).toBe(true);
      expect(facts.some((fact) => fact.kind === "sequence" && fact.steps?.[0] === "Profaz" && fact.steps.at(-1) === "Telofaz")).toBe(true);
      expect(structures).toEqual(expect.arrayContaining(["flow", "matrix", "tree"]));
    });
    const longCells = "| Belirti | Açıklama |\n| --- | --- |\n| Uzun bir hücre metni burada | Daha da uzun bir açıklama hücresi |";
    expect(sourceStructures(pages(longCells))).not.toContain("matrix");
    expect(sourceStructures(pages("anne ve çocuk yan yana durur"))).not.toContain("tree");
    expect(sourceStructures(pages("1. Hazırlık\n2. Uygulama\n3. Kontrol\nBu bir döngüdür ve başa döner."))).toEqual(["cycle"]);
  });
});

describe("ürün kodunda ders adı ya da tek derse ait sözcük yok", () => {
  it("kilit bilgi ve kısa dosya kapısı genel kalır", () => {
    const keyFacts = readFileSync(new URL("../../src/lib/learning/lesson-key-facts.ts", import.meta.url), "utf8");
    const oversize = readFileSync(new URL("../../src/lib/documents/outline-oversize.ts", import.meta.url), "utf8");
    expect(keyFacts).not.toMatch(FORBIDDEN);
    expect(oversize).not.toMatch(FORBIDDEN);
  });
});
