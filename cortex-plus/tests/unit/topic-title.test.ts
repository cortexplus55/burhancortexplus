import { describe, expect, it } from "vitest";
import {
  chapterHeadings,
  normalizeTopicTitle,
  sectionHeadings,
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

describe("unrepresentedHeadings — words must land in one title", () => {
  it("does not let two other topics vouch for a missing chapter", () => {
    // Canlıda olan: "6. Yük Altında Gerilme Dağılımı" haritadan düştü ama
    // "gerilme" Efektif Gerilme'de, "dağılımı" Dane Boyu Dağılımı'nda
    // geçtiği için bekçi bölümü temsil edilmiş saydı. İki farklı konunun
    // kelimeleri üçüncü bir konuyu var etmez.
    const shipped = [
      "Zeminin Oluşumu ve Üç Fazlı Sistem",
      "Faz Bağıntıları ve İndeks Özellikler",
      "Dane Boyu Dağılımı ve Zemin Sınıflandırması",
      "Zeminde Su Akışı ve Permeabilite",
      "Efektif Gerilme İlkesi ve Sızma Kuvvetleri",
      "Konsolidasyon ve Oturma Analizi",
      "Kayma Mukavemeti ve Mohr-Coulomb Kırılma Ölçütü",
    ];
    expect(unrepresentedHeadings(["6. Yük Altında Gerilme Dağılımı"], shipped)).toEqual([
      "6. Yük Altında Gerilme Dağılımı",
    ]);
  });

  it("accepts the chapter once one title actually carries it", () => {
    expect(
      unrepresentedHeadings(
        ["6. Yük Altında Gerilme Dağılımı"],
        ["Dane Boyu Dağılımı", "Zeminlerde Yük Altında Gerilme Dağılımı"],
      ),
    ).toEqual([]);
  });
});

describe("chapterHeadings — real document shape", () => {
  // Zemin belgesinin gerçek sayfa başlıkları. Sayfaların ilk başlığı
  // çoğunlukla bölüm adı değil; bölüm adı listenin içinde bir yerde.
  const pages = [
    { headings: ["temel faz özdeşliği", "2. Faz Bağıntıları ve İndeks Özellikler"] },
    { headings: ["ÖRNEK 1", "1. n = 0,40 ise e kaçtır?"] },
    { headings: ["i = Δh / L (hidrolik eğim)", "4. Zeminde Su Akışı ve Permeabilite"] },
    { headings: ["6. Yük Altında Gerilme Dağılımı"] },
    // İçindekiler sayfası: aynı başlıklar, sonunda sayfa numarasıyla.
    {
      headings: [
        "2. Faz Bağıntıları ve İndeks Özellikler 5",
        "6. Yük Altında Gerilme Dağılımı 14",
      ],
    },
  ];

  it("finds chapters that are not the page's first heading", () => {
    const found = chapterHeadings(pages);
    expect(found).toContain("6. Yük Altında Gerilme Dağılımı");
    expect(found).toContain("2. Faz Bağıntıları ve İndeks Özellikler");
    expect(found).toContain("4. Zeminde Su Akışı ve Permeabilite");
  });

  it("treats the contents-page line as the same chapter", () => {
    // "… 14" ayrı bir bölüm değil; aynı bölümün içindekiler satırı.
    expect(chapterHeadings(pages)).not.toContain("6. Yük Altında Gerilme Dağılımı 14");
  });

  it("keeps the document's numbered quiz questions out of the backbone", () => {
    // Bunlar omurgaya girseydi bekçi otuz sahte bölüm arardı.
    const noisy = [
      { headings: ["1. Boussinesq çözümü hangi malzeme varsayımlarını yapar?"] },
      { headings: ["2. S r e = w G s özdeşliğini bir faz diyagramıyla doğrula."] },
      { headings: ["3. C c ile C r : yük ön konsolidasyon basıncını aşana kadar C r , sonrasında C c ."] },
    ];
    expect(chapterHeadings(noisy)).toEqual([]);
  });
});

describe("sectionHeadings", () => {
  // Zemin PDF'inin gerçek sayfa başlıkları (document_pages.headings).
  const daneBoyuSayfasi = {
    headings: [
      "3. Dane Boyu, Kıvam Limitleri ve Sınıflandırma (USCS)",
      "3.1. Dane Boyu Dağılımı",
      "C u = D 60 / D 10 | C c = (D 30 ) 2 / (D 10 · D 60 )",
      "3.2. Atterberg (Kıvam) Limitleri",
      "3.3. Birleştirilmiş Zemin Sınıflandırması (USCS)",
      "6 / 18",
    ],
  };

  it("takes the source's own sub-headings as the lesson's sections", () => {
    // Canlıda üretilen ders bu üç bölümün ikisini yazdı; USCS
    // sınıflandırmasını hiç anlatmadı ve öğrenci bunu göremedi.
    expect(sectionHeadings([daneBoyuSayfasi])).toEqual([
      "Dane Boyu Dağılımı",
      "Atterberg (Kıvam) Limitleri",
      "Birleştirilmiş Zemin Sınıflandırması",
    ]);
  });

  it("leaves the chapter title itself out", () => {
    // "3." bölümün adı, dersin konusu; bölüm değil.
    expect(sectionHeadings([daneBoyuSayfasi])).not.toContain(
      "Dane Boyu, Kıvam Limitleri ve Sınıflandırma",
    );
  });

  it("spans the topic's pages in order", () => {
    // Efektif gerilme konusu iki sayfaya yayılıyor (s.10 ve s.11).
    const pages = [
      {
        headings: [
          "efektif = toplam − boşluk suyu basıncı",
          "5. Efektif Gerilme İlkesi",
          "5.1. Hidrostatik Durum",
          "ÖRNEK 4",
          "5.2. Sızmanın Etkisi",
        ],
      },
      {
        headings: [
          "BÖLÜM 5 — KENDİNİ SINA",
          "1. σ' = σ − u ilkesini bir cümleyle açıkla.",
          "11 / 18",
        ],
      },
    ];
    expect(sectionHeadings(pages)).toEqual([
      "Hidrostatik Durum",
      "Sızmanın Etkisi",
    ]);
  });

  it("returns nothing when the document has no numbered sub-headings", () => {
    // Slayt destesi ya da taranmış not: omurga yoksa bölümü model seçer.
    const slides = [{ headings: ["Giriş", "Zemin nedir", "Teşekkürler"] }];
    expect(sectionHeadings(slides)).toEqual([]);
  });

  it("stops at six, the most a lesson can hold", () => {
    const adlar = [
      "Temel Tanımlar",
      "Birim Hacim Ağırlıkları",
      "Rölatif Sıkılık",
      "Kıvam Limitleri",
      "Permeabilite Deneyleri",
      "Akış Ağı Kuralları",
      "Konsolidasyon Süresi",
      "İkincil Sıkışma",
      "Drenaj Yolu",
    ];
    const many = { headings: adlar.map((ad, i) => `2.${i + 1}. ${ad}`) };
    expect(sectionHeadings([many])).toHaveLength(6);
  });
});
