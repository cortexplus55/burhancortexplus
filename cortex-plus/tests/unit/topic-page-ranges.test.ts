import { describe, expect, it } from "vitest";
import { exclusivePageRanges } from "@/lib/documents/topic-page-ranges";

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/**
 * 3 Ekim 2026, canlı haritalardan: ana konuların sayfaları çakışıyordu ve
 * aynı sayfalar iki derste anlatılıyordu.
 */
describe("ana konular çakışmadan, belge sırasıyla", () => {
  it("trigonometri: taşan konu kendi bölümüne döner, kopya konu birleşir", () => {
    const input = [
      { title: "Açı Ölçüsü ve Radyan", pageNumbers: range(1, 9) },
      { title: "Birim Çember", pageNumbers: range(10, 18) },
      { title: "Sinüs ve Kosinüs", pageNumbers: [...range(19, 27), ...range(37, 48), ...range(82, 96)] },
      { title: "Tanjant ve Kotanjant", pageNumbers: range(28, 36) },
      { title: "Temel Trigonometrik Özdeşlikler", pageNumbers: range(37, 45) },
      { title: "İki Açının Toplam ve Fark Formülleri", pageNumbers: range(49, 54) },
      { title: "İki Kat ve Yarım Açı Formülleri", pageNumbers: range(55, 63) },
      { title: "Toplamı Çarpıma Dönüştürme Formülleri", pageNumbers: range(64, 72) },
      { title: "Dönüşüm Formülleri", pageNumbers: range(64, 72) },
      { title: "Trigonometrik Denklemler", pageNumbers: range(73, 81) },
      { title: "Trigonometrik Fonksiyon Grafikleri", pageNumbers: range(82, 90) },
      { title: "Üçgende Trigonometri", pageNumbers: range(91, 99) },
    ];
    const { topics, merged } = exclusivePageRanges(input);
    const byTitle = Object.fromEntries(topics.map((t) => [t.title, t.pageNumbers]));

    expect(byTitle["Sinüs ve Kosinüs"]).toEqual(range(19, 27));
    expect(byTitle["Temel Trigonometrik Özdeşlikler"]).toEqual(range(37, 45));
    // Bölüm giriş sayfaları (46–48) sonraki konuya.
    expect(byTitle["İki Açının Toplam ve Fark Formülleri"]).toEqual(range(46, 54));
    expect(byTitle["Trigonometrik Fonksiyon Grafikleri"]).toEqual(range(82, 90));
    expect(byTitle["Üçgende Trigonometri"]).toEqual(range(91, 99));
    expect(topics).toHaveLength(11);
    expect(merged).toEqual([{ kept: "Toplamı Çarpıma Dönüştürme Formülleri", dropped: ["Dönüşüm Formülleri"] }]);

    const all = topics.flatMap((t) => t.pageNumbers);
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort((a, b) => a - b)).toEqual(range(1, 99));
  });

  it("KPSS: geniş ilk konu sonrakilerin sayfalarını bırakır", () => {
    const { topics } = exclusivePageRanges([
      { title: "Hukukun Temel Kavramları", pageNumbers: [...range(3, 26), ...range(40, 49)] },
      { title: "Hukuk Dalları ve Kişiler Hukuku", pageNumbers: range(19, 38) },
      { title: "Türk Vatandaşlığı", pageNumbers: range(40, 54) },
    ]);
    expect(topics.map((t) => [t.title, t.pageNumbers[0], t.pageNumbers.at(-1)])).toEqual([
      ["Hukukun Temel Kavramları", 3, 18],
      ["Hukuk Dalları ve Kişiler Hukuku", 19, 38],
      ["Türk Vatandaşlığı", 40, 54],
    ]);
  });

  it("çakışma yoksa harita olduğu gibi kalır", () => {
    const input = [
      { title: "Büyüme ve Gelişme", pageNumbers: [1] },
      { title: "Yenidoğan Dönemi", pageNumbers: [2] },
      { title: "Beslenme", pageNumbers: [3, 4] },
    ];
    expect(exclusivePageRanges(input)).toEqual({ topics: input, merged: [] });
  });

  it("konunun başka alanları (soru kökü, ek alan) korunur", () => {
    const { topics } = exclusivePageRanges([
      { title: "A", pageNumbers: [1, 2, 3, 4], learningObjective: "x" },
      { title: "B", pageNumbers: [3, 4, 5, 6], learningObjective: "y" },
    ]);
    expect(topics.map((t) => t.learningObjective)).toEqual(["x", "y"]);
    expect(topics.flatMap((t) => t.pageNumbers)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
