import { describe, expect, it } from "vitest";
import { layoutBoard } from "@/lib/learning/lesson-board";

/*
  Paket H — ders tahtası metin bölücü, ders-bağımsız bekçi (29 Ekim 2026).

  Bütün bölücüler (liste imi, cümle sonu, bağıntı, ":" ";" ",", sıra sayısı, lead/bağıntı ayrımı)
  yalnız ayraç dışında keser; virgül kesmesi komşuluk kuralına bağlı; "m. 27" / "s. 12" biçimli
  kısaltma cümle sonu değil; harfsiz parçaya iki nokta eklenmez. Senaryolar farklı disiplinlerden,
  hiçbiri derse özel sabit kelimeye dayanmaz.
*/

const texts = (input: string) => layoutBoard(input).map((line) => line.text);

describe("Paket H · derinlik 0 bölme — disiplinler", () => {
  it("iktisat: sıralı değerler 'P = 10, 20, 30' satırlara kırılmaz (komşuluk kuralı)", () => {
    const sentence = "Talep fonksiyonu Q = 100 − 2P için P = 10, 20, 30 değerlerinde Q sırasıyla 80, 60, 40 olur.";
    expect(layoutBoard(sentence)).toEqual([{ kind: "prose", text: sentence }]);
  });

  it("iktisat: iki tam eşitlik yine ayrı satırdır (kesmenin iki yanı da bağıntı taşır)", () => {
    const lines = layoutBoard("Dengede MR = MC, 2 firmalı piyasada P = MC + m olur.");
    expect(lines.map((line) => line.text)).toEqual(["Dengede MR = MC", "2 firmalı piyasada P = MC + m olur"]);
    expect(lines.every((line) => line.kind === "formula")).toBe(true);
  });

  it("tarih: parantez içindeki 'bkz. 1934' noktası cümle sonu değildir", () => {
    const shown = texts(
      "Kadınlara seçme ve seçilme hakkı (bkz. 1934 Anayasa değişikliği) genel oy ilkesini genişletti. Seçmen yaşı 18 oldu.",
    );
    expect(shown).toEqual([
      "Kadınlara seçme ve seçilme hakkı (bkz. 1934 Anayasa değişikliği) genel oy ilkesini genişletti.",
      "Seçmen yaşı 18 oldu.",
    ]);
  });

  it("matematik: oran '1:3' ve küme kurucu '{x : x > 0}' iki noktadan bölünmez", () => {
    expect(texts("Karışım oranı 1:3 ise m = 3n olur.")).toEqual(["Karışım oranı 1:3 ise m = 3n olur"]);
    const set = "Pozitif reel sayılar kümesi {x : x > 0} biçiminde yazılır.";
    expect(layoutBoard(set)).toEqual([{ kind: "prose", text: set }]);
    // Formülü tanıtan iki nokta hâlâ kendi satırını açar.
    const lines = layoutBoard("Merkez açı şöyle bulunur: θ = s/r. Burada s yay uzunluğudur.");
    expect(lines.some((line) => line.kind === "formula" && line.text.includes("θ = s/r"))).toBe(true);
  });

  it("matematik: noktalı virgül yalnız ayraç dışında ayırır", () => {
    expect(texts("(1,5; 2) noktası için y = 2x − 1 sağlanır.")).toEqual(["(1,5; 2) noktası için y = 2x − 1 sağlanır"]);
    expect(texts("x ∈ [0; 1] için f(x) = x² olur; g(x) = 2x")).toEqual(["x ∈ [0; 1] için f(x) = x² olur", "g(x) = 2x"]);
  });

  it("matematik: sol işlenen ayraçla bütündür; küme içindeki eşitlik kümeyi taşır", () => {
    expect(texts("Küme {x | x = 2k} şeklinde yazılır")).toEqual(["Küme şu şekilde yazılır:", "{x | x = 2k}"]);
    expect(texts("Alan f(x) = 2x ile bulunur")).toEqual(["Alan ile bulunur:", "f(x) = 2x"]);
    const square = layoutBoard("Kare (a + b)² = a² + 2ab + b² olarak yazılır");
    expect(square.find((line) => line.kind === "formula")?.text).toBe("(a + b)² = a² + 2ab + b²");
    expect(square.find((line) => line.kind === "prose")?.text).toMatch(/^Kare /);
  });

  it("fizik: parantez içindeki doygunluk bağıntısı dışarı çekilmez; dıştaki çekilir", () => {
    const inside = texts("Sıkıştırılmış sıvı (T < T_sat(P) koşulu) soğuk bölgededir.");
    expect(inside).toHaveLength(1);
    expect(inside[0]).toContain("(T < T_sat(P) koşulu)");
    const outside = layoutBoard("Sıkıştırılmış sıvı T < T_sat(P) ve kızgın buhar T > T_sat(P) koşuluyla tanımlanır.");
    expect(outside.filter((line) => line.kind === "formula").map((line) => line.text)).toEqual(["T < T_sat(P)", "T > T_sat(P)"]);
  });

  it("hukuk: 'md. 5' ve 's. 12' kısaltmaları cümleyi bölmez, 'vb. Bunlar' böler", () => {
    expect(texts("Yetki md. 5 ve s. 12 uyarınca kullanılır. Sınır md. 6'dadır.")).toEqual([
      "Yetki md. 5 ve s. 12 uyarınca kullanılır.",
      "Sınır md. 6'dadır.",
    ]);
    expect(texts("Satış, kira vb. Bunlar tipik sözleşmelerdir.")).toEqual(["Satış, kira vb.", "Bunlar tipik sözleşmelerdir."]);
  });

  it("tıp: referans aralıkları ve virgüllü ondalık tek satırdır", () => {
    const sentence = "Glukoz 70–100 mg/dL, HbA1c < %5,7 ve kreatinin 0,6–1,2 mg/dL normal kabul edilir.";
    expect(layoutBoard(sentence).map((line) => line.text)).toEqual([sentence]);
  });

  it("kimya: formül listesi içinde parantez ve alt simge bölünmez; eşitlik satırı ayrılır", () => {
    const lines = layoutBoard("Tuzlar NaCl, Ca(OH)₂ ve Al₂(SO₄)₃ suda çözünür. Molar kütle M = 58,5 g/mol alınır.");
    expect(lines[0]).toEqual({ kind: "prose", text: "Tuzlar NaCl, Ca(OH)₂ ve Al₂(SO₄)₃ suda çözünür." });
    expect(lines.some((line) => line.kind === "formula" && line.text.includes("M = 58,5 g/mol"))).toBe(true);
  });
});

describe("Paket H · savunma katmanı", () => {
  it("harfsiz parçaya iki nokta eklenmez: '2:' doğmaz", () => {
    expect(texts("2\nP = F/A")).toEqual(["2", "P = F/A"]);
    expect(texts("Basınç\nP = F/A")).toEqual(["Basınç:", "P = F/A"]);
  });

  it("gerçek liste imleri ayraç dışında yine düşer, sıra sayıları kalır", () => {
    expect(texts("1) P = F/A (0, 2) 2) W = F · d")).toEqual(["P = F/A (0, 2)", "W = F · d"]);
    const ages = texts("2. ay: sosyal gülümseme (bkz. 6. ay) başlar.\n9. ay: desteksiz oturur.");
    expect(ages.join(" ")).toContain("2. ay");
    expect(ages.join(" ")).toContain("9. ay");
    expect(ages.join(" ")).toContain("(bkz. 6. ay)");
  });
});
