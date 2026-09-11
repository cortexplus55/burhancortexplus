import { describe, expect, it } from "vitest";
import { topicForHeadings } from "@/lib/documents/topic-map-llm";

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
