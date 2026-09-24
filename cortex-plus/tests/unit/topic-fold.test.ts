import { describe, expect, it } from "vitest";
import {
  areNearDuplicateTitles,
  consolidateTopics,
  headingsToGuard,
  outlineSections,
  type FoldPage,
  type LooseTopic,
} from "@/lib/documents/topic-fold";

/**
 * Canlıda 10 ve 20 sayfalık termodinamik notlarının ikisi de 23 konu
 * üretiyordu. Kutu etiketleri, örneğin adımları ve aynı başlığın kısa
 * hâli listeye çıkmıştı. Buradaki liste o çıktının başlıkları.
 */

const BANNER = "TERMODİNAMİK I | VİZE NOTLARI | BÖLÜM 2";

const PDF_A_PAGES: FoldPage[] = [
  ["20. Açık Sistemlere Geçiş: Kütle Korunumu", "VİZEDE DİKKAT", "KENDİNİ TEST ET", "ÇÖZÜMLÜ ÖRNEK"],
  ["21. Sürekli Akış Enerji Denklemi (SFEE)", "FORMÜL KUTUSU", "BİRİM KONTROLÜ"],
  ["22. Nozul ve Difüzörler", "ÇÖZÜMLÜ ÖRNEK", "VİZEDE DİKKAT"],
  ["23. Türbinler: Akıştan İş Üretimi", "ÇÖZÜMLÜ ÖRNEK", "GÜÇ ÖRNEĞİ"],
  ["24. Kompresör ve Pompa", "KOMPRESÖR ÖRNEĞİ", "POMPA ÖRNEĞİ"],
  ["25. Kısılma Vanası ve Isı Değiştirici", "FORMÜL KUTUSU"],
  ["26. Geçici Kontrol Hacmi: Tank Dolumu ve Boşalması", "VİZEDE DİKKAT"],
  [
    "27. Bütünleşik Çözümlü Örnek I - Nozul + Kütle Debisi",
    "1) Enerji dengesi",
    "2) Çıkış hızı",
    "3) Çıkış yoğunluğu ve debi",
    "ÇÖZÜM MANTIĞI",
  ],
  ["28. Bütünleşik Çözümlü Örnek II - Türbin Gücü", "1) SFEE", "SIK HATA"],
  [
    "29. Vize Öncesi Son Tekrar - Denklem Seçme Rehberi",
    "1) Sistemi seç",
    "2) Özellik modelini seç",
    "3) Cihaza göre sadeleştir",
    "SON FORMÜL ŞERİDİ",
  ],
].map((headings, index) => ({
  pageNumber: index + 1,
  headings: [BANNER, ...headings],
  textContent: headings.join("\n"),
}));

const CONCEPTS = [
  "Açık Sistemlere Geçiş: Kütle Korunumu",
  "Sürekli Akış Enerji Denklemi",
  "Nozul ve Difüzörler",
  "Türbinler: Akıştan İş Üretimi",
  "Kompresör ve Pompa",
  "Kısılma Vanası ve Isı Değiştirici",
  "Geçici Kontrol Hacmi: Tank Dolumu ve Boşalması",
];

function topic(title: string, pageNumbers: number[]): LooseTopic {
  return { title, learningObjective: "Bu kavramı kendi cümlesiyle uygular", pageNumbers };
}

describe("outline of a note that repeats callout boxes", () => {
  it("keeps the numbered concepts and drops boxes, steps, and the review", () => {
    expect(outlineSections(PDF_A_PAGES).map((section) => section.title)).toEqual(CONCEPTS);
    expect(headingsToGuard(PDF_A_PAGES)).toEqual([
      "20. Açık Sistemlere Geçiş: Kütle Korunumu",
      "21. Sürekli Akış Enerji Denklemi (SFEE)",
      "22. Nozul ve Difüzörler",
      "23. Türbinler: Akıştan İş Üretimi",
      "24. Kompresör ve Pompa",
      "25. Kısılma Vanası ve Isı Değiştirici",
      "26. Geçici Kontrol Hacmi: Tank Dolumu ve Boşalması",
    ]);
  });
});

describe("consolidateTopics", () => {
  it("folds the 23-title oversplit back into the real concepts", () => {
    const oversplit = [
      topic("VİZEDE DİKKAT", [1, 2, 3, 4, 5, 6, 7]),
      topic("KENDİNİ TEST ET", [1]),
      topic("FORMÜL KUTUSU", [2, 6]),
      topic("ÇÖZÜMLÜ ÖRNEK", [1, 3, 4]),
      topic("Açık Sistemlere Geçiş: Kütle Korunumu", [1]),
      topic("Kütle Korunumu", [1]),
      topic("Sürekli Akış Enerji Denklemi", [2]),
      topic("Nozul ve Difüzörler", [3]),
      topic("Bütünleşik Çözümlü Örnek I - Nozul + Kütle Debisi", [8]),
      topic("Enerji dengesi", [8]),
      topic("Çıkış hızı", [8]),
      topic("Çıkış yoğunluğu ve debi", [8]),
      topic("Türbinler: Akıştan İş Üretimi", [4]),
      topic("Kompresör ve Pompa", [5]),
      topic("Kısılma Vanası ve Isı Değiştirici", [6]),
      topic("Geçici Kontrol Hacmi: Tank Dolumu ve Boşalması", [7]),
      topic("Vize Öncesi Son Tekrar", [10]),
      topic("Vize Öncesi Son Tekrar - Denklem Seçme Rehberi", [10]),
      topic("Sistemi seç", [10]),
      topic("Özellik modelini seç", [10]),
      topic("Cihaza göre sadeleştir", [10]),
      topic("Bütünleşik Çözümlü Örnek II - Türbin Gücü", [9]),
      topic("SIK HATA", [9]),
    ];

    const { topics } = consolidateTopics(oversplit, PDF_A_PAGES, PDF_A_PAGES.length);
    const titles = topics.map((item) => item.title);

    expect(titles).toEqual(CONCEPTS);
    expect(titles).not.toContain("VİZEDE DİKKAT");
    expect(titles).not.toContain("KENDİNİ TEST ET");
    expect(titles).not.toContain("FORMÜL KUTUSU");
    expect(titles).not.toContain("ÇÖZÜMLÜ ÖRNEK");
    expect(titles).not.toContain("Kütle Korunumu");
    expect(titles).not.toContain("Enerji dengesi");
    expect(titles).not.toContain("Çıkış hızı");
    expect(titles).not.toContain("Çıkış yoğunluğu ve debi");
    expect(titles).not.toContain("Sistemi seç");
    expect(titles).not.toContain("Vize Öncesi Son Tekrar");
    expect(titles.some((title) => /çözümlü örnek/i.test(title))).toBe(false);

    const nozzle = topics.find((item) => item.title === "Nozul ve Difüzörler");
    const turbine = topics.find((item) => item.title === "Türbinler: Akıştan İş Üretimi");
    expect(nozzle?.pageNumbers).toContain(8);
    expect(turbine?.pageNumbers).toContain(9);
    expect(topics.flatMap((item) => item.pageNumbers)).toEqual(
      expect.arrayContaining([1, 2, 3, 4, 5, 6, 7, 8, 9]),
    );
  });

  it("treats a short title and the document heading as one topic", () => {
    expect(
      areNearDuplicateTitles(
        "Kütle Korunumu",
        "Açık Sistemlere Geçiş: Kütle Korunumu",
      ),
    ).toBe(true);
    expect(
      areNearDuplicateTitles(
        "Vize Öncesi Son Tekrar",
        "Vize Öncesi Son Tekrar - Denklem Seçme Rehberi",
      ),
    ).toBe(true);
    expect(
      areNearDuplicateTitles("Efektif Gerilme İlkesi", "Yük Altında Gerilme Dağılımı"),
    ).toBe(false);
  });

  it("does not merge a multi-chapter textbook down to the ceiling", () => {
    const chapters = [
      "Zeminin Oluşumu ve Üç Fazlı Sistem",
      "Faz Bağıntıları ve İndeks Özellikler",
      "Dane Boyu, Kıvam Limitleri ve Sınıflandırma",
      "Zeminde Su Akışı ve Permeabilite",
      "Efektif Gerilme İlkesi",
      "Yük Altında Gerilme Dağılımı",
      "Konsolidasyon ve Oturma",
      "Kayma Mukavemeti",
    ];
    const pages: FoldPage[] = chapters.map((title, index) => ({
      pageNumber: index * 2 + 1,
      headings: [`${index + 1}. ${title}`],
    }));
    // 20 sayfalık not, 8 gerçek bölüm. Tavan 12; bölümler durur.
    const padded: FoldPage[] = [
      ...pages,
      ...Array.from({ length: 12 }, (_, index) => ({
        pageNumber: index + 9,
        headings: [] as string[],
      })),
    ];
    const { topics } = consolidateTopics(
      chapters.map((title, index) => topic(title, [index * 2 + 1])),
      padded,
      20,
    );
    expect(topics.map((item) => item.title)).toEqual(chapters);
    expect(headingsToGuard(padded)).toHaveLength(8);
  });

  it("packs a one-section-per-page note down to the ceiling", () => {
    const names = [
      "Sistem ve Sınır",
      "Kapalı ve Açık Sistem",
      "Hal ve Proses",
      "Yoğun Özellikler",
      "Basınç Tanımı",
      "Sıcaklık Ölçeği",
      "Saf Madde Fazları",
      "Faz Diyagramları",
      "Doymuş Tablolar",
      "Doğrusal Enterpolasyon",
      "İdeal Gaz Yasası",
      "Sıkıştırılabilirlik Faktörü",
      "Sınır İşi Hesabı",
      "Politropik Prosesler",
      "Isı ve İş Geçişi",
      "Kapalı Sistem Enerjisi",
      "Özgül Isı Bağıntıları",
      "Sabit Hacimde Isıtma",
    ];
    const sections = names.map((name, index) => `${index + 1}. ${name}`);
    const pages: FoldPage[] = [
      { pageNumber: 1, headings: ["Kapak notu"] },
      ...sections.map((heading, index) => ({
        pageNumber: index + 2,
        headings: [heading, "VİZEDE DİKKAT", "KENDİNİ TEST ET"],
      })),
      {
        pageNumber: 20,
        headings: ["19. Bölüm 1 Tekrarı - Mini Vize ve Formül Haritası"],
      },
    ];
    // 18 kavram + tekrar. Tekrar konu değil; 18 kavram tavana (12) iner.
    expect(headingsToGuard(pages)).toEqual([]);
    const oversplit = [
      ...sections.map((heading, index) =>
        topic(heading.replace(/^\d+\.\s+/, ""), [index + 2]),
      ),
      topic("VİZEDE DİKKAT", [2, 3, 4]),
      topic("Mini Vize ve Formül Haritası", [20]),
    ];
    const { topics } = consolidateTopics(oversplit, pages, 20);
    expect(topics.length).toBeGreaterThanOrEqual(8);
    expect(topics.length).toBeLessThanOrEqual(12);
    expect(topics.map((item) => item.title).join(" ")).not.toMatch(/vizede dikkat/i);
    expect(topics.map((item) => item.title).join(" ")).not.toMatch(/mini vize/i);
    const covered = new Set(topics.flatMap((item) => item.pageNumbers));
    for (let page = 2; page <= 19; page += 1) expect(covered.has(page)).toBe(true);
  });

  it("does not attach a chapter review via the running header or a quiz step", () => {
    const banner = "TERMODİNAMİK I | VİZE NOTLARI | BÖLÜM 1 Sayfa 20/30";
    const review = "19. Bölüm 1 Tekrarı - Mini Vize ve Formül Haritası";
    const pressureStep = "1) Manometrik 40 kPa ve atmosfer 98 kPa ise mutlak basınç? 138 kPa.";
    const pages: FoldPage[] = [
      { pageNumber: 2, headings: [banner, "1. Termodinamiğe Giriş: Sistem ve Sınır"] },
      { pageNumber: 6, headings: [banner, "5. Basınç, Mutlak Basınç ve Manometre Basıncı"] },
      { pageNumber: 11, headings: [banner, "10. Termodinamik Tablolarda Enterpolasyon"] },
      { pageNumber: 19, headings: [banner, "18. İdeal Gazlarda Enerji Değişimi"] },
      { pageNumber: 20, headings: [banner, review, pressureStep] },
    ];
    const { topics } = consolidateTopics(
      [
        topic("Termodinamiğe Giriş: Sistem ve Sınır", [2]),
        topic("Basınç, Mutlak Basınç ve Manometre Basıncı", [6]),
        topic("Termodinamik Tablolarda Enterpolasyon", [11]),
        topic("İdeal Gazlarda Enerji Değişimi", [19]),
        topic(banner, [20]),
        topic(review, [20]),
        topic(pressureStep, [20]),
      ],
      pages,
      20,
    );
    expect(topics.find((item) => item.title.includes("Enterpolasyon"))?.pageNumbers).toEqual([11]);
    expect(topics.find((item) => item.title.startsWith("Basınç"))?.pageNumbers).toEqual([6]);
    expect(topics.flatMap((item) => item.pageNumbers)).not.toContain(20);
    expect(topics.map((item) => item.title).join(" ")).not.toMatch(/tekrar|manometrik|vize notları/i);
  });
});
