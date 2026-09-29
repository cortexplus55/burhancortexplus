import { describe, expect, it } from "vitest";
import { finishTaughtLesson, teachingFailures } from "@/lib/learning/lesson-teach";
import type { LessonV2 } from "@/lib/learning/teaching-standards";

/*
  29 Eylül 2026: belgesiz ("Belgem yok, konudan çalışayım") bir "Üslü sayılar"
  dersinde kaynak boş olduğu için her sayı "uydurma" sayıldı; kritik hata dersi
  kurtarma yoluna soktu, kurtarma çözümlü örneği sildi ve soruları derste başka
  yerde geçen cümlelerin "hep doğru" kopyalarıyla doldurdu. Belgesiz derste
  karşılaştırılacak kaynak yok; sayı kuralı yalnızca kaynak varken çalışır.
*/

const TOPIC = "Üslü sayılar";

function exponentLesson(): LessonV2 {
  return {
    title: TOPIC,
    overview: "Üslü sayılar, aynı sayının tekrar tekrar çarpımını kısa yazmanın yoludur ve sınavda işlem hızını belirler.",
    sections: [
      {
        heading: "Üslü ifadenin parçaları",
        body: "Üslü ifadenin iki parçası vardır: aⁿ ifadesinde a taban, n üstür. Örneğin 2 sayısının 5 kez çarpımı 2⁵ olarak yazılır ve değeri 32 olur.",
        check: {
          type: "mcq",
          prompt: "2⁵ ifadesinin değeri kaçtır?",
          options: ["32", "10", "25", "7"],
          answerIndex: 0,
          explanation: "2 sayısı 5 kez çarpılır; taban ile üs çarpılmaz, toplanmaz.",
          optionWhy: [
            "2 · 2 · 2 · 2 · 2 = 32 eder.",
            "Taban ile üs çarpılmış.",
            "Üs taban gibi okunmuş.",
            "Taban ile üs toplanmış.",
          ],
        },
      },
      {
        heading: "Aynı tabanda çarpma",
        body: "Tabanları aynı iki üslü ifade çarpılırken üsler toplanır. Örneğin 3² · 3³ = 3⁵ olur ve değeri 243 eder.",
        check: {
          type: "mcq",
          prompt: "3² · 3³ işleminin sonucu hangi üslü ifadeye eşittir?",
          options: ["3⁵", "3⁶", "9⁵", "6⁵"],
          answerIndex: 0,
          explanation: "Aynı tabanda çarpmada üsler toplanır, taban değişmez.",
          optionWhy: [
            "Üsler toplanır: 2 + 3 = 5.",
            "Üsler çarpılmış.",
            "Tabanlar çarpılmış.",
            "Tabanlar toplanmış.",
          ],
        },
      },
    ],
    example: {
      prompt: "2³ · 2⁴ işleminin sonucunu bul.",
      solution: "Tabanlar aynı olduğu için üsler toplanır: 3 + 4 = 7. Sonuç 2⁷ olur. 2⁷ = 128.",
    },
    commonMistake: {
      claim: "3² · 3³ = 9⁵",
      correction: "Aynı tabanda çarpmada tabanlar çarpılmaz; taban aynı kalır ve üsler toplanır.",
    },
  };
}

describe("belgesiz ders (topic_only) kaynak kuralına takılmıyor", () => {
  it("keeps the model's numeric checks and worked example when there is no document", async () => {
    const lesson = exponentLesson();
    expect(teachingFailures(exponentLesson(), "", TOPIC).map((f) => f.problem)).not.toContain("invented_number");
    const finished = await finishTaughtLesson(lesson, { source: "", topicLabel: TOPIC });
    const problems = finished.failures.map((f) => `${f.unit}:${f.problem}`);
    expect(problems).not.toContain("lesson:invented_number");
    expect(problems).not.toContain("example:invented_number");
    expect(finished.salvaged).toBe(false);
    expect(finished.lesson.example?.solution).toContain("128");
    expect(finished.lesson.sections[0]?.check?.prompt).toBe("2⁵ ifadesinin değeri kaçtır?");
    expect(finished.lesson.sections[1]?.check?.prompt).toContain("3² · 3³");
  });

  it("still flags numbers the document does not contain when there is a document", async () => {
    const lesson = exponentLesson();
    const finished = await finishTaughtLesson(lesson, {
      source: "[s.1] notlar.pdf: Üslü sayılarda taban ve üs kavramları tanımlanır.",
      topicLabel: TOPIC,
    });
    // Belge varken 32, 243 ve 128 belgede yok: o cümleler ve örnek eskisi
    // gibi düşüyor. Değişiklik yalnızca belgesiz dersi etkiliyor.
    const prose = finished.lesson.sections.map((s) => s.body).join(" ");
    expect(prose).not.toContain("243");
    expect(prose).not.toContain("32");
    expect(finished.lesson.example).toBeUndefined();
  });
});
