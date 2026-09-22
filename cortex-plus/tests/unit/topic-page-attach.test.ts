import { describe, expect, it } from "vitest";
import { completeTopicPageLinks, topicForHeadings } from "@/lib/documents/topic-map-llm";
import { analyzePage } from "@/lib/documents/page-analysis";
import { draftFromLlmTopic } from "@/lib/documents/topic-map";

/**
 * Sahipsiz sayfa hangi konuya bağlanır?
 *
 * Eskiden yalnızca "en yakın önceki konu" ölçüsü vardı ve komşu bölümü
 * sızdırıyordu: zemin belgesinin 12. sayfası "6. Yük Altında Gerilme
 * Dağılımı" başlığını taşıdığı hâlde 5. bölümün ("Efektif Gerilme")
 * konusuna eklendi. Ders de iki bölümü komşu konudan anlattı — öğrenci
 * efektif gerilme çalışırken Boussinesq okudu.
 */
const topics = [
  { title: "Efektif Gerilme İlkesi ve Sızma Etkisi" },
  { title: "Yük Altında Gerilme Dağılımı" },
  { title: "Konsolidasyon ve Oturma Analizi" },
];

describe("topicForHeadings", () => {
  it("sends the page to the topic its own heading names", () => {
    expect(
      topicForHeadings(topics, [
        "6. Yük Altında Gerilme Dağılımı",
        "6.1. Boussinesq — Tekil Yük",
      ])?.title,
    ).toBe("Yük Altında Gerilme Dağılımı");
  });

  it("does not guess when the headings say nothing", () => {
    // Karar veremiyorsa çağıran taraf eski ölçüye düşsün; uydurmasın.
    expect(topicForHeadings(topics, ["ÖRNEK 5", "11 / 18"])).toBeNull();
    expect(topicForHeadings(topics, [])).toBeNull();
  });

  it("tolerates the document's own wording", () => {
    // Konu başlığı modelin yazdığı hâli, sayfa başlığı belgenin hâli.
    expect(
      topicForHeadings(topics, ["7. Konsolidasyon ve Oturma"])?.title,
    ).toBe("Konsolidasyon ve Oturma Analizi");
  });

  it("does not attach a page to a merely similar topic", () => {
    // "Gerilme" iki başlıkta da geçiyor; tek ortak kelime yetmez.
    expect(topicForHeadings(topics, ["Gerilme"])).toBeNull();
  });
});

describe("completeTopicPageLinks", () => {
  function page(number: number, text: string) {
    return { ...analyzePage(number, text), headings: [] };
  }

  const pages = [
    page(2, "Açı ölçüsünde derece ve radyan aynı açının farklı birimleridir."),
    page(7, "Birim çember üzerindeki her noktanın yarıçapı bire eşittir."),
    page(15, "Denklemlerde çözüm aralığı kontrol edilir ve tüm kökler bulunur."),
    page(18, "Dikkat: Denklemin tanım koşulunu kontrol et.\nOran: sin θ / cos θ\n1) tan θ değerini bul.\nsin²θ + cos²θ = 1"),
  ];
  const seeded = [
    draftFromLlmTopic("Açı Ölçü Birimleri", null, [2], pages, 0),
    draftFromLlmTopic("Trigonometrik Denklemler", null, [15], pages, 1),
    // Omitted chapter restored after the model topics; array is not page ordered.
    draftFromLlmTopic("Birim Çember", null, [7], pages, 2),
  ];

  it("attaches a continuation to the nearest prior page, not the last array entry", () => {
    const result = completeTopicPageLinks(seeded, pages);
    expect(result.map((topic) => topic.title)).toEqual([
      "Açı Ölçü Birimleri", "Birim Çember", "Trigonometrik Denklemler",
    ]);
    expect(result[2].pageNumbers).toEqual([15, 18]);
    expect(result[1].pageNumbers).toEqual([7]);
    // Retrying a map must not mutate the earlier draft.
    expect(seeded[1].pageNumbers).toEqual([15]);
  });

  it("enriches the topic from newly attached pages as well as the model's original pages", () => {
    const result = completeTopicPageLinks(seeded, pages);
    const equations = result.find((topic) => topic.title === "Trigonometrik Denklemler")!;
    expect(equations.commonMistakes).toContain("Dikkat: Denklemin tanım koşulunu kontrol et.");
    expect(equations.keyDefinitions).toContain("Oran: sin θ / cos θ");
    expect(equations.keyRelations).toContain("sin²θ + cos²θ = 1");
    expect(equations.sourceExercises).toContain("1) tan θ değerini bul.");
  });

  it("prefers a matching heading over proximity and does not attach structural pages", () => {
    const extraPages = [
      ...pages,
      { ...page(19, "Birim çemberde işaretler, noktanın bulunduğu bölgeyle belirlenir."), headings: ["Birim Çember"] },
      { ...page(20, "Cevap anahtarı"), pageKind: "answer_key" as const },
    ];
    const result = completeTopicPageLinks(seeded, extraPages);
    expect(result.find((topic) => topic.title === "Birim Çember")?.pageNumbers).toEqual([7, 19]);
    expect(result.flatMap((topic) => topic.pageNumbers)).not.toContain(20);
  });
});
