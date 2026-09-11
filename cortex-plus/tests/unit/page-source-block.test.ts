import { describe, expect, it } from "vitest";
import { pageSourceBlock } from "@/lib/learning/source-context";

/**
 * Dersin kaynağı, konunun KENDİ sayfaları.
 *
 * Ders üretimi kaynağı benzerlik aramasıyla seçiyordu: sorgu konu adından
 * kuruluyor, en yakın dört parça alınıyordu. Bu, konunun işlendiği
 * sayfaların prompta girdiğini garanti etmiyordu.
 *
 * Canlıda bedeli görüldü: ders "Boussinesq — Tekil Yük" başlıklı bir bölüm
 * yazdı ve formülü σ = (Q/π)(1/(1+(z/R)²)) diye verdi. Bu Boussinesq
 * değil. Formülün durduğu 12. sayfa modelin önüne hiç gitmemiş olabilirdi.
 *
 * Planın her düğümü hangi sayfaları işlediğini zaten biliyor.
 */
describe("pageSourceBlock", () => {
  const pages = [
    {
      pageNumber: 12,
      text: "6. Yük Altında Gerilme Dağılımı\n6.1. Boussinesq — Tekil Yük\nTekil yük altında derinlikteki gerilme artışı.",
      formulas: ["Δσ z = 3Q / (2π z²) · [1 + (r/z)²]^(-5/2)"],
    },
    {
      pageNumber: 13,
      text: "6.2. 2:1 (Yaklaşık) Yöntem\nYük derinlikle 2 düşey 1 yatay oranında yayılır.",
      formulas: [],
    },
  ];

  it("puts the page's own formula in front of the model", () => {
    const block = pageSourceBlock("zemin.pdf", pages, true);
    expect(block).toContain("Δσ z = 3Q / (2π z²)");
    expect(block).toContain("Bu sayfadaki formüller:");
  });

  it("labels every page so the lesson can cite it", () => {
    const block = pageSourceBlock("zemin.pdf", pages, true);
    expect(block).toContain("[s.12] zemin.pdf");
    expect(block).toContain("[s.13] zemin.pdf");
  });

  it("tells the model to copy the formula, not recall it", () => {
    expect(pageSourceBlock("zemin.pdf", pages, true)).toContain(
      "FORMÜLLERİ SAYFADAKİ HÂLİYLE YAZ",
    );
  });

  it("closes the source when the student asked for documents only", () => {
    const strict = pageSourceBlock("zemin.pdf", pages, true);
    const open = pageSourceBlock("zemin.pdf", pages, false);
    expect(strict).toContain("olmayan bilgiyi ekleme");
    expect(open).toContain("genel bilgiyle tamamlayabilirsin");
  });

  it("returns nothing when the topic has no readable page", () => {
    // Çağıran taraf benzerlik aramasına düşer; kaynaksız ders üretilmez.
    expect(pageSourceBlock("zemin.pdf", [], true)).toBe("");
  });

  it("keeps a long page from eating the whole prompt", () => {
    const long = [{ pageNumber: 1, text: "a".repeat(9000), formulas: [] }];
    expect(pageSourceBlock("uzun.pdf", long, true).length).toBeLessThan(3000);
  });
});

describe("çok sayfalı konu prompt'u taşırmıyor", () => {
  // "Yük Altında Gerilme Dağılımı" beş sayfaya yayılıyor. Sayfa başına
  // sınır vardı, toplama sınır yoktu: blok 11 bin karaktere çıktı ve ders
  // üretimi 503 ile düştü. Çok sayfalı konu istisna değil.
  const fivePages = Array.from({ length: 5 }, (_, i) => ({
    pageNumber: i + 1,
    text: "x".repeat(4000),
    formulas: [`F${i} = m a`],
  }));

  it("keeps the whole block inside the budget", () => {
    expect(pageSourceBlock("kitap.pdf", fivePages, true).length).toBeLessThan(7000);
  });

  it("still shows every page and every formula", () => {
    const block = pageSourceBlock("kitap.pdf", fivePages, true);
    for (let i = 0; i < 5; i += 1) {
      expect(block).toContain(`[s.${i + 1}]`);
      expect(block).toContain(`F${i} = m a`);
    }
  });
});
