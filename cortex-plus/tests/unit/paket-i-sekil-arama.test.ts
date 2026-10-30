import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHAT_PASSAGE_BUDGET,
  asksAboutFigure,
  exactSearchTokens,
  lexicalPageHit,
  takeWithinBudget,
} from "@/lib/learning/prep-corpus";

/*
  Paket I #11 (30 Ekim 2026). Stres testinde öğretmen el notundaki ve şekildeki bilgiyi bulamadı: "AVL 15, 10, 5,
  20, 25", "T(n)=3T(n/4)+n" ve "SMMM 95.000" için "notlarda yok" dedi; MST toplamını bir kenar eksik okudu. Kök
  araması 4 harften kısa kelimeyi ve sayıyı hiç aramıyordu; sohbet sabit 4 parça alıyordu; şekil sorusunda şekil
  okunmuş sayfanın tamamı gelmiyordu. Örnekler farklı derslerden: kural derse bağlı değil.
*/

describe("kesin belirteçler", () => {
  it("kısaltma, binlik sayı, sayı dizisi ve formül parçası çıkar", () => {
    const kinds = (question: string) => exactSearchTokens(question).map((token) => `${token.kind}:${token.raw}`);
    expect(kinds("AVL ağacına 15, 10, 5, 20, 25 sırayla eklenirse kök ne olur?")).toEqual(
      expect.arrayContaining(["sequence:15, 10, 5, 20, 25", "acronym:AVL"]),
    );
    expect(kinds("T(n)=3T(n/4)+n yinelemesinin çözümü notlarda var mı?")).toContain("formula:3T(n/4)");
    expect(kinds("SMMM ücreti 95.000 TL mi?")).toEqual(expect.arrayContaining(["number:95.000", "acronym:SMMM"]));
    expect(kinds("KDV oranı kaçtır?")).toContain("acronym:KDV");
    // Her sayfada geçen yazım ("T(n)") ve sıradan kelime aranmaz.
    expect(kinds("T(n) nedir?")).toEqual([]);
    expect(kinds("Bu konuyu anlatır mısın?")).toEqual([]);
  });

  it("sayı, belgede binlik ayraçsız yazılmış olsa da bulunur; kısaltma kelime içinde aranmaz", () => {
    const number = exactSearchTokens("SMMM 95.000 TL")[0]!;
    expect(number.patterns).toEqual(expect.arrayContaining(["%95.000%", "%95000%"]));
    expect(number.find("Serbest muhasebeci ücreti 95000 TL olarak alınır.")).toBeGreaterThan(0);
    const acronym = exactSearchTokens("AVL nedir?").find((token) => token.kind === "acronym")!;
    expect(acronym.find("Havlu kâğıdı")).toBe(-1);
    expect(acronym.find("AVL ağacında denge faktörü")).toBe(0);
  });

  it("sayı dizisi belgede farklı boşlukla yazılmış olsa da sırasıyla bulunur", () => {
    const sequence = exactSearchTokens("15, 10, 5, 20, 25 eklenirse")[0]!;
    expect(sequence.find("Ekleme sırası: 15,10,5,20,25 (sırayla).")).toBeGreaterThan(0);
    expect(sequence.find("Ekleme sırası: 15 10 5 20 25")).toBeGreaterThan(0);
    expect(sequence.find("Ekleme sırası: 10, 15, 5, 20, 25")).toBe(-1);
  });
});

describe("kök olmayan soruda sayfa yine bulunur", () => {
  it("yalnız kısaltma ve dizi taşıyan el notu sayfası puan alır ve alıntı o yerden gelir", () => {
    const page = `${"Giriş metni. ".repeat(80)}El notu: AVL 15, 10, 5, 20, 25 eklemesinde 10 köke çıkar.`;
    const hit = lexicalPageHit("AVL 15, 10, 5, 20, 25?", page);
    expect(hit).not.toBeNull();
    expect(hit!.score).toBeGreaterThanOrEqual(4);
    expect(hit!.excerpt).toContain("15, 10, 5, 20, 25");
  });

  it("belirteç yoksa eski davranış: eşleşme yoksa sayfa gelmez", () => {
    expect(lexicalPageHit("Fotosentez nerede olur?", "Hücre zarı seçici geçirgendir.")).toBeNull();
  });
});

describe("bağlam bütçesi ve şekil sorusu", () => {
  it("kısa parçalarda dördü aşar, uzun parçalarda bütçede durur", () => {
    const short = Array.from({ length: 12 }, (_, index) => ({ content: "x".repeat(400), index }));
    expect(takeWithinBudget(short).length).toBe(8);
    const long = Array.from({ length: 12 }, (_, index) => ({ content: "x".repeat(2400), index }));
    expect(takeWithinBudget(long).length).toBe(4);
    expect(takeWithinBudget(long, CHAT_PASSAGE_BUDGET, { min: 1, max: 3 }).length).toBe(3);
  });

  it("şekil, tablo, el notu soruları tanınır", () => {
    for (const question of ["Şekildeki MST toplamı kaç?", "Tablodaki değerleri açıkla", "El notumda ne yazıyordu?", "Grafiğe göre artış ne?"]) {
      expect(asksAboutFigure(question)).toBe(true);
    }
    expect(asksAboutFigure("Dijkstra algoritmasını anlat")).toBe(false);
  });

  it("sohbet sabit 4 parça almaz; şekil sayfası ve fotoğraf belgesi tamamıyla eklenir", () => {
    const source = readFileSync("src/lib/learning/prep-chat-grounding.ts", "utf8");
    expect(source).not.toMatch(/rerankByOverlap\(message, wide\)\.slice\(0, 4\)/);
    expect(source).toContain("takeWithinBudget(rerankByOverlap(message, wide)");
    expect(source).toContain("exactSearchTokens(message)");
    expect(source).toMatch(/asksAboutFigure\(message\)/);
    expect(source).toContain("FIGURE_APPENDIX_LABEL");
  });
});
