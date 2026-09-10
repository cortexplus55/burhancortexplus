import { describe, expect, it } from "vitest";
import {
  chapterHeadings,
  normalizeTopicTitle,
  targetTopicCount,
  topicTitleIssues,
  unrepresentedHeadings,
} from "@/lib/documents/topic-title";

describe("targetTopicCount", () => {
  it("scales with the document and stays inside the readable band", () => {
    // 20 sayfalık zemin PDF'i → 7; Astra'nın aynı belgeden çıkardığı sayı.
    expect(targetTopicCount(20)).toBe(7);
    // Kısa özet notu bölünemeyecek kadar kısa olsa da plan üretebilmeli.
    expect(targetTopicCount(3)).toBe(4);
    expect(targetTopicCount(1)).toBe(4);
    // Ders kitabı: 200 sayfa 66 konuya bölünürse konu listesi gezilemez.
    expect(targetTopicCount(200)).toBe(12);
  });
});

describe("normalizeTopicTitle", () => {
  it("drops chapter numbers and trailing acronyms", () => {
    expect(normalizeTopicTitle("3. Dane Boyu, Kıvam Limitleri ve Sınıflandırma (USCS)")).toBe(
      "Dane Boyu, Kıvam Limitleri ve Sınıflandırma",
    );
    expect(normalizeTopicTitle("1.2. Üç Fazlı Model")).toBe("Üç Fazlı Model");
    expect(normalizeTopicTitle("IV) Kayma Mukavemeti")).toBe("Kayma Mukavemeti");
  });

  it("leaves a clean title untouched", () => {
    const clean = "Zeminlerin Faz Bağıntıları ve İndeks Özellikleri";
    expect(normalizeTopicTitle(clean)).toBe(clean);
  });

  it("keeps a parenthetical that is not a trailing acronym", () => {
    expect(normalizeTopicTitle("Darcy Yasası (deneysel) ve Permeabilite")).toBe(
      "Darcy Yasası (deneysel) ve Permeabilite",
    );
  });
});

describe("topicTitleIssues", () => {
  it("rejects the failure modes we actually shipped", () => {
    // Sezgisel harita bunu üretiyordu.
    expect(topicTitleIssues("Sayfa 4 içeriği")).not.toEqual([]);
    expect(topicTitleIssues("Zemin")).not.toEqual([]);
    expect(
      topicTitleIssues("Bu bölümde zeminin üç fazlı yapısı ve faz bağıntıları ayrıntılı anlatılır."),
    ).not.toEqual([]);
    expect(topicTitleIssues("Efektif Gerilme İlkesi.")).not.toEqual([]);
  });

  it("accepts a house-style title", () => {
    expect(topicTitleIssues("Efektif Gerilme İlkesi ve Sızma Kuvvetleri")).toEqual([]);
    expect(topicTitleIssues("Zeminde Su Akışı ve Permeabilite")).toEqual([]);
  });
});

describe("unrepresentedHeadings", () => {
  // Canlı denemede gerçekten olan şey: 8 bölümlük zemin PDF'inden 7 konu
  // çıktı ve "6. Yük Altında Gerilme Dağılımı" listeden düştü. Sayfalar en
  // yakın konuya bağlandığı için kapsama %100 görünüyordu.
  const chapters = [
    "1. Zeminin Oluşumu ve Üç Fazlı Sistem",
    "2. Faz Bağıntıları ve İndeks Özellikler",
    "3. Dane Boyu, Kıvam Limitleri ve Sınıflandırma (USCS)",
    "4. Zeminde Su Akışı ve Permeabilite",
    "5. Efektif Gerilme İlkesi",
    "6. Yük Altında Gerilme Dağılımı",
    "7. Konsolidasyon ve Oturma",
    "8. Kayma Mukavemeti",
  ];

  it("catches the chapter that was dropped to hit the target count", () => {
    const shipped = [
      "Zemin Oluşumu ve Üç Fazlı Sistem",
      "Faz Bağıntıları ve İndeks Özellikler",
      "Dane Boyu, Kıvam Limitleri ve Sınıflandırma",
      "Zeminde Su Akışı ve Permeabilite",
      "Efektif Gerilme İlkesi",
      "Konsolidasyon ve Oturma",
      "Kayma Mukavemeti",
    ];
    expect(unrepresentedHeadings(chapters, shipped)).toEqual([
      "6. Yük Altında Gerilme Dağılımı",
    ]);
  });

  it("accepts a merge that keeps both names in the title", () => {
    const merged = [
      "Zeminlerin Faz Bağıntıları ve İndeks Özellikleri",
      "Dane Boyu Dağılımı ve Zemin Sınıflandırması",
      "Zeminde Su Akışı ve Permeabilite",
      "Efektif Gerilme İlkesi ve Sızma Kuvvetleri",
      "Zeminlerde Yük Altında Gerilme Dağılımı",
      "Zeminlerin Konsolidasyonu ve Oturma Analizi",
      "Zeminlerin Kayma Mukavemeti ve Kırılma Ölçütleri",
      "Zeminin Oluşumu ve Üç Fazlı Sistem",
    ];
    expect(unrepresentedHeadings(chapters, merged)).toEqual([]);
  });

  it("ignores headings with nothing distinctive to match", () => {
    expect(unrepresentedHeadings(["1. Giriş", "2. Genel"], ["Kayma Mukavemeti"])).toEqual([]);
  });
});

describe("chapterHeadings", () => {
  it("keeps numbered chapters and drops their sub-headings", () => {
    const pages = [
      { headings: ["2. Faz Bağıntıları ve İndeks Özellikler"] },
      { headings: ["2.3. Birim Hacim Ağırlıkları"] },
      { headings: ["3. Dane Boyu, Kıvam Limitleri ve Sınıflandırma"] },
    ];
    expect(chapterHeadings(pages)).toEqual([
      "2. Faz Bağıntıları ve İndeks Özellikler",
      "3. Dane Boyu, Kıvam Limitleri ve Sınıflandırma",
    ]);
  });

  it("treats an unnumbered heading as a chapter once it spans two pages", () => {
    // Slayt destesi ve taranmış ders notunda numara yok; ölçü sayfa yayılımı.
    const pages = [
      { headings: ["Kayma Mukavemeti"] },
      { headings: ["Kayma Mukavemeti"] },
      { headings: ["Şekil 4: Mohr dairesi"] },
    ];
    expect(chapterHeadings(pages)).toEqual(["Kayma Mukavemeti"]);
  });

  it("ignores pages with no heading", () => {
    expect(chapterHeadings([{ headings: [] }, { headings: [""] }])).toEqual([]);
  });
});

describe("unrepresentedHeadings — structural tails", () => {
  // Pediatri belgesi bekçiyi tetikleyip haritanın tamamını düşürmüştü.
  // "Çerçeve" başlığın en uzun kelimesi ama konuyu adlandırmıyor.
  it("does not demand a structural tail word be echoed in the title", () => {
    expect(
      unrepresentedHeadings(
        ["1. Sağlam Çocuk İzlemi: Çerçeve", "8. Dehidratasyon ve Oral Rehidratasyon"],
        ["Sağlam Çocuk İzlemi Sıklığı", "Dehidratasyon ve Oral Rehidratasyon"],
      ),
    ).toEqual([]);
  });

  it("still catches a chapter with no echo at all", () => {
    expect(
      unrepresentedHeadings(
        ["5. Bağışıklama ve Aşı Takvimi"],
        ["Yenidoğan Muayenesi", "Bebek ve Çocuk Beslenmesi"],
      ),
    ).toEqual(["5. Bağışıklama ve Aşı Takvimi"]);
  });
});
