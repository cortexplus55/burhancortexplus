import { describe, expect, it } from "vitest";
import { analyzePages } from "@/lib/documents/page-analysis";
import { draftFromLlmTopic } from "@/lib/documents/topic-map";
import { buildCoverageReport } from "@/lib/documents/coverage";

/** ~20 instructional pages modeled on a trigonometry workbook slice. */
function trigWorkbookPages(): string[] {
  return [
    "KAPAK\nTrigonometri Ders Notları\nYazar: Cortex Plus\nISBN 978-0-000000-00-0",
    "İÇİNDEKİLER\n1. Derece ve radyan\n2. Birim çember\n3. İşaretler\n4. Kimlikler\n5. Grafikler\n6. Denklemler",
    "1. Derece ve radyan\nTanım: Bir tam tur 360 derece veya 2π radyandır.\n180 derece = π radyan.\nÖrnek: 90 derece = π/2 radyan.",
    "Derece-radyan dönüşümü\nFormül: radyan = derece × π / 180\nderece = radyan × 180 / π\nSoru 1) 60 derece kaç radyandır?\nSoru 2) π/3 radyan kaç derecedir?",
    "2. Birim çember\nBirim çember üzerinde sin(θ) = y ve cos(θ) = x.\ntan(θ) = y / x (x ≠ 0).\nsin²θ + cos²θ = 1.",
    "Birim çember özel açıları\n30°: (√3/2, 1/2)\n45°: (√2/2, √2/2)\n60°: (1/2, √3/2)\nÖrnek: cos(60°) = 1/2",
    "3. İşaretler ve bölgeler\nI. bölge: sin +, cos +, tan +\nII. bölge: sin +, cos -, tan -\nIII. bölge: sin -, cos -, tan +\nIV. bölge: sin -, cos +, tan -",
    "Referans açı\n120° II. bölgededir; referans açı 60°.\nDikkat: İşaret bölgeye göre seçilir, mutlak değer referans açıdan gelir.\nÖrnek: sin(120°) = sin(60°) = √3/2",
    "4. Trigonometrik kimlikler\nsin²θ + cos²θ = 1\n1 + tan²θ = sec²θ\n1 + cot²θ = csc²θ\nÖrnek: cos²θ = 1 − sin²θ",
    "Kimlik uygulamaları\nSoru 1) sinθ = 3/5 ise cosθ bulunur mu?\nYanlış: İşareti unutmak sık hatadır.\nÇözüm: Bölge bilgisi gerekir.",
    "5. Trigonometrik grafikler\ny = sin x periyodu 2π, genlik 1.\ny = cos x aynı periyot, faz kayması π/2.\nGrafik okuma: tepe ve sıfır noktaları.",
    "Grafik dönüşümleri\ny = A sin(Bx + C) + D\nPeriyot = 2π / |B|\nÖrnek: y = 2 sin(x) genliği 2'dir.",
    "6. Trigonometrik denklemler\nsin θ = 1/2 ⇒ θ = π/6 + 2kπ veya 5π/6 + 2kπ\nÇözüm aralığı belirtilmeli.\nSoru 1) cos θ = −1/2, [0, 2π)",
    "Denklemler — devam\nÖrnek çözüm: θ = 2π/3, 4π/3\nDikkat: Extraneous kökleri kontrol et.\nSoru 2) 2 sin θ − 1 = 0",
    "Çalışılmış örnek — Mavi Üçgen\nθ = 120° ve P = (−1/2, √3/2).\nReferans açı 60°; II. bölge.\nsin(120)=√3/2, cos(120)=−1/2, tan(120)=−√3.",
    "Adım adım çözüm\n1. Konumu belirle\n2. Özel açı değerlerini aktar\n3. tan = sin/cos ile kontrol et\nKimlik: sin² + cos² = 1.",
    "Alıştırmalar A\nSoru 1) 210° hangi bölgededir?\nSoru 2) cos(210°) işaretini bul.\nSoru 3) sin(210°) değerini yaz.",
    "Alıştırmalar B\nSoru 4) π radyan kaç derecedir?\nSoru 5) Birim çemberde (0, −1) hangi açı?\nSoru 6) tan(π/4) = ?",
    "Özet\nDerece-radyan, birim çember, işaret, kimlik, grafik ve denklem ayrı izlenir.\nTanım listesi: radyan, referans açı, periyot.",
    "CEVAP ANAHTARI\n1) π/3  2) 60  3) III  4) −  5) −1/2  6) 180  7) 3π/2  8) 1",
  ];
}

/**
 * Üretimdeki yol: konu başlıklarını model belgeden çıkarır, biz sayfalara
 * bağlayıp zenginleştiririz. Eskiden burada elle yazılmış bir trigonometri
 * müfredatına dayanan buildTopicMap çağrılıyordu; o kod silindi
 * (bkz. tests/unit/no-baked-in-curriculum.test.ts).
 */
function topicsFor(
  analyses: ReturnType<typeof analyzePages>,
  seeds: { title: string; pages: number[] }[],
) {
  return seeds.map((seed, i) =>
    draftFromLlmTopic(seed.title, null, seed.pages, analyses, i),
  );
}

describe("PDF learning page analysis", () => {
  it("classifies cover, toc, content, and answer key", () => {
    const pages = analyzePages(trigWorkbookPages());
    expect(pages).toHaveLength(20);
    expect(pages[0].pageKind).toBe("cover");
    expect(pages[1].pageKind).toBe("toc");
    expect(pages[2].pageKind).toBe("content");
    expect(pages[19].pageKind).toBe("answer_key");
    expect(pages[2].extractionOk).toBe(true);
    expect(pages[2].formulas.length + pages[2].headings.length).toBeGreaterThan(0);
  });

  it("does not call a content page a table of contents over one stray word", () => {
    // Zemin mekaniği notunda USCS tablosundaki "Organik içerik belirgin"
    // satırı, dolu bir öğretim sayfasını içindekiler sanıp kapsam dışına
    // atmıştı. "içerik" gündelik bir kelime; başlık olarak aranmalı.
    const [page] = analyzePages([
      [
        "3.3. Birleştirilmiş Zemin Sınıflandırması (USCS)",
        "Sembol Zemin Ölçüt (özet)",
        "CL / CH Düşük / yüksek plastisiteli kil A-hattı üzeri",
        "OL / OH, Pt Organik zeminler, turba Organik içerik belirgin",
        "ÖRNEK 2: Bir zeminin No.200 eleğinden geçeni %8; C u = 8, C c = 2.",
        "Çözüm. İnce <%50 → kaba daneli, çoğu kum → S. Sınıf: SW",
      ].join("\n"),
    ]);
    expect(page.pageKind).toBe("content");
  });

  it("flags empty pages as blank/unreadable", () => {
    const [blank, thin] = analyzePages(["", "ab"]);
    expect(blank.pageKind).toBe("blank");
    expect(thin.pageKind).toBe("unreadable");
    expect(thin.extractionOk).toBe(false);
  });
});

describe("PDF learning topic map + coverage", () => {
  it("covers every instructional page on the ~20-page fixture", () => {
    const analyses = analyzePages(trigWorkbookPages());
    // Model her öğretim sayfasını bir konuya bağladı; kapsam raporu bunu
    // doğrular — konuların adını değil.
    const contentPages = analyses
      .filter((page) => page.pageKind === "content")
      .map((page) => page.pageNumber);
    const topics = topicsFor(analyses, [
      { title: "Açı Ölçüsü ve Birim Çember", pages: contentPages.slice(0, 8) },
      { title: "Kimlikler, Grafikler ve Denklemler", pages: contentPages.slice(8) },
    ]);
    const coverage = buildCoverageReport(analyses, topics, []);

    expect(coverage.totalPages).toBe(20);
    expect(coverage.contentPages).toBeGreaterThan(10);
    expect(coverage.uncoveredContentPages).toEqual([]);
    expect(coverage.unreadablePages).toEqual([]);
    expect(coverage.skippedPages.map((p) => p.kind).sort()).toEqual(
      ["answer_key", "cover", "toc"].sort(),
    );
    expect(coverage.status).toBe("complete");
    expect(coverage.coveredPages).toBe(coverage.contentPages);
  });

  it("reports blank/unreadable pages instead of silently covering them", () => {
    const analyses = analyzePages([
      "1. Açı ölçü birimleri\n180 derece = π radyan.",
      "",
      "xx",
    ]);
    const topics = topicsFor(analyses, [
      { title: "Açı Ölçü Birimleri", pages: [1] },
    ]);
    const coverage = buildCoverageReport(analyses, topics, []);

    expect(coverage.skippedPages.map((p) => p.pageNumber)).toContain(2);
    expect(coverage.unreadablePages.map((p) => p.pageNumber)).toContain(3);
    expect(coverage.status).not.toBe("complete");
  });
});
