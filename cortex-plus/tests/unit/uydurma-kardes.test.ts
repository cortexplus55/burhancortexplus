import { describe, expect, it } from "vitest";
import { inventedKindSiblings } from "@/lib/learning/distractor-kind";
import { INVENTED_SIBLING_PREFIX, quizStructureIssues, quizSystem } from "@/lib/learning/teacher-quiz";
import { SAME_KIND_DISTRACTOR_RULE } from "@/lib/learning/teaching-rubric";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";

/*
  30 Ekim 2026, canlı Araçlar testi (#426 yayındayken): kaynakta iki enflasyon maliyeti vardı; yazar türden olmayan
  çeldiricileri atınca şıkları uydurdu: "Açık piyasa maliyeti", "Zorunlu karşılık maliyeti", "Reeskont maliyeti",
  "Politika faizi maliyeti". Belgeli testte tür adını taşıyan ama kaynakta hiç geçmeyen şık işaretlenir.
*/

const economics =
  "Enflasyonun maliyetleri: Menü maliyeti, fiyat etiketlerinin sık sık yenilenmesinin yarattığı maliyettir. " +
  "Ayakkabı eskitme maliyeti, nakit tutmaktan kaçınmak için bankaya sık gidilmesinin maliyetidir. " +
  "Para politikası araçları: açık piyasa işlemleri, reeskont oranı, zorunlu karşılık oranı ve politika faizi.";

const q = (text: string, options: string[], correct: string): QuizQuestion =>
  ({ text, options, correct: [correct], explanation: "Kısa gerekçe.", type: "single" }) as unknown as QuizQuestion;

describe("uydurma kardeş terim", () => {
  it("canlı soru 4: 'Açık piyasa maliyeti', 'Zorunlu karşılık maliyeti', 'Reel faiz maliyeti'", () => {
    const stem = "Bir işletme, fiyat etiketlerini fiyat değişikliklerine uyum sağlamak için sık sık yenilemek zorunda kalıyor. Bu hangi maliyet örneğidir?";
    const options = ["Açık piyasa maliyeti", "Zorunlu karşılık maliyeti", "Reel faiz maliyeti", "Menü maliyeti", "Ayakkabı eskitme maliyeti"];
    expect(inventedKindSiblings({ stem, options, correctIndex: 3, context: economics })).toEqual([
      "Açık piyasa maliyeti",
      "Zorunlu karşılık maliyeti",
      "Reel faiz maliyeti",
    ]);
    const issues = quizStructureIssues(q(stem, options, "Menü maliyeti"), { optionCount: 5, context: economics });
    expect(issues.some((issue) => issue.startsWith(INVENTED_SIBLING_PREFIX))).toBe(true);
  });

  it("canlı soru 5: 'Politika faizi maliyeti', 'Reeskont maliyeti' (Üretim maliyeti de kaynakta yok)", () => {
    const stem = "Bir hane, nakit tutmanın etkilerinden kaçınmak için bankaya sık sık gidiyor. Bu davranışla bağlantılı enflasyon maliyeti hangisidir?";
    const options = ["Menü maliyeti", "Üretim maliyeti", "Politika faizi maliyeti", "Reeskont maliyeti", "Ayakkabı eskitme maliyeti"];
    expect(inventedKindSiblings({ stem, options, correctIndex: 4, context: economics })).toEqual([
      "Üretim maliyeti",
      "Politika faizi maliyeti",
      "Reeskont maliyeti",
    ]);
  });

  it("gerçek kardeşler kaynakta geçiyorsa susar (biyoloji, ekler farklı olsa da)", () => {
    const biology =
      "Bağ dokusu türleri: sıkı bağ dokusu kemiği kemiğe bağlar; gevşek bağ dokusu organların arasını doldurur; " +
      "yağ dokusu enerji depolar.";
    expect(
      inventedKindSiblings({
        stem: "Kemiği kemiğe bağlayan yapı hangi bağ dokusudur?",
        options: ["Sıkı bağ dokusu", "Gevşek bağ dokusu", "Yağ dokusu"],
        correctIndex: 0,
        context: biology,
      }),
    ).toEqual([]);
  });

  it("kaynak yoksa ya da doğru cevap kaynakta geçmiyorsa susar", () => {
    const stem = "Bu hangi maliyet örneğidir?";
    const options = ["Menü maliyeti", "Reeskont maliyeti", "Ayakkabı eskitme maliyeti"];
    expect(inventedKindSiblings({ stem, options, correctIndex: 0, context: "" })).toEqual([]);
    expect(inventedKindSiblings({ stem, options, correctIndex: 0, context: "Hukuk: sözleşme icap ve kabul ile kurulur." })).toEqual([]);
  });

  it("kural yazara gidiyor: kardeş terim uydurma", () => {
    expect(SAME_KIND_DISTRACTOR_RULE).toContain("Kardeş TERİM UYDURMA");
    expect(quizSystem("document")).toContain("Kardeş TERİM UYDURMA");
  });
});
