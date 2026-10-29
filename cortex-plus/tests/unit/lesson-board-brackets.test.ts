import { describe, expect, it } from "vitest";
import { layoutBoard } from "@/lib/learning/lesson-board";

/*
  Tahta bölücüleri ayraç içine bakmaz (29 Ekim 2026, canlı karşılaştırma B7).

  Matematik dersinde "A = {1, 2, 3} kümesinden B = {a, b} kümesine 1 → a, 1 → b, 2 → a
  eşlemesinde…" cümlesi küme virgüllerinden satırlara kırıldı; "(0, 2)" koordinatındaki "2)"
  liste imi sanılıp silindi; harfsiz "2" parçasına iki nokta eklenip "2:" çıktı. Bölücüler
  artık yalnız derinlik 0'da keser; eşitlik listesi ("1 kPa = 1000 Pa, 1 MPa = 1000 kPa") yine
  iki satırdır çünkü kesmenin iki yanı da bağıntı taşır.
*/

const texts = (input: string) => layoutBoard(input).map((line) => line.text);

describe("tahta: ayraç içindeki ayırıcı kesmez", () => {
  it("küme ve eşleme cümlesi (canlı B7) tek satırdır ve düz yazıdır", () => {
    const sentence =
      "A = {1, 2, 3} kümesinden B = {a, b} kümesine 1 → a, 1 → b, 2 → a eşlemesinde her elemanın tek görüntüsü yoktur.";
    const lines = layoutBoard(sentence);
    expect(lines).toEqual([{ kind: "prose", text: sentence }]);
    expect(lines.map((line) => line.text).join("\n")).not.toMatch(/^\d+:?$/m);
  });

  it("'{1, 2, 3, 4}' kümesi elemanlarına bölünmez", () => {
    const shown = texts("{1, 2, 3, 4} kümesinin alt küme sayısı 2⁴ = 16 olur.");
    expect(shown).toHaveLength(1);
    expect(shown[0]).toContain("{1, 2, 3, 4}");
  });

  it("koordinat '(−1, 4), (0, 2)' liste imi değildir; '2' silinmez", () => {
    const shown = texts("Doğru (−1, 4), (0, 2) noktalarından geçer. Eğimi m = −2 olur.");
    expect(shown[0]).toBe("Doğru (−1, 4), (0, 2) noktalarından geçer.");
    expect(shown.join(" ")).toContain("(0, 2)");
  });

  it("yarı açık aralık '[−1, 2)' bölünmez", () => {
    const shown = texts("Fonksiyon [−1, 2) aralığında tanımlıdır. Bu aralıkta f(x) = x² olur.");
    expect(shown[0]).toBe("Fonksiyon [−1, 2) aralığında tanımlıdır.");
    expect(shown.some((line) => line.includes("f(x) = x²"))).toBe(true);
  });

  it("kimya: 'Ca(OH)₂, H₂SO₄ ve NaCl' tek satırda kalır", () => {
    const shown = texts("Bileşikler Ca(OH)₂, H₂SO₄ ve NaCl olarak yazılır. Çözeltide pH = 7 ise nötrdür.");
    expect(shown[0]).toBe("Bileşikler Ca(OH)₂, H₂SO₄ ve NaCl olarak yazılır.");
  });

  it("hukuk: 'TBK m. 27/1, 2, 3' kısaltma noktasında cümle bölünmez", () => {
    const shown = texts(
      "Sözleşme özgürlüğünün sınırları TBK m. 27/1, 2, 3 hükümlerinde sayılır. Kaynak s. 12'de geçen tanım esastır.",
    );
    expect(shown).toEqual([
      "Sözleşme özgürlüğünün sınırları TBK m. 27/1, 2, 3 hükümlerinde sayılır.",
      "Kaynak s. 12'de geçen tanım esastır.",
    ]);
  });

  it("tıp: 'Na⁺ 135–145 mmol/L, K⁺ 3,5–5,0 mmol/L' tek satırdır", () => {
    const shown = texts("Na⁺ 135–145 mmol/L, K⁺ 3,5–5,0 mmol/L aralığı normaldir. Hiponatremi Na⁺ < 135 mmol/L ise söz konusudur.");
    expect(shown[0]).toBe("Na⁺ 135–145 mmol/L, K⁺ 3,5–5,0 mmol/L aralığı normaldir.");
    expect(shown).toHaveLength(2);
  });

  it("fizik: '1 kPa = 1000 Pa, 1 MPa = 1000 kPa' yine iki formül satırıdır", () => {
    const lines = layoutBoard("1 kPa = 1000 Pa, 1 MPa = 1000 kPa.");
    expect(lines).toEqual([
      { kind: "formula", text: "1 kPa = 1000 Pa" },
      { kind: "formula", text: "1 MPa = 1000 kPa" },
    ]);
  });

  it("gerçek '1. … 2. …' listesi koordinat içerse de liste kalır", () => {
    const shown = texts("1. P = F/A (0, 2) noktası 2. W = F · d");
    expect(shown).toEqual(["P = F/A (0, 2) noktası", "W = F · d"]);
    expect(shown.some((line) => /^\d[.)]\s/.test(line))).toBe(false);
  });

  it("sıralı değerler 'n = 1, 2, 3' eşitlik listesi değildir", () => {
    expect(texts("n = 1, 2, 3 için a_n = 2n olur.")).toEqual(["n = 1, 2, 3 için aₙ = 2n olur"]);
  });
});
