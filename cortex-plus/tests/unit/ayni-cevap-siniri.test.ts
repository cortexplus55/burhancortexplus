import { describe, expect, it } from "vitest";
import { MAX_SAME_ANSWER, appendWithoutConflicts, quizSetIssues, salvageRejected } from "@/lib/learning/teacher-quiz";
import { TEST_SET_RULE } from "@/lib/learning/teaching-rubric";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";

/*
  30 Ekim 2026, canlı "İkinci test" (Makroekonomi): 5 sorudan 4'ünün doğru cevabı "Kıtlık". Çift çift bakan
  denetim her birini "aynı sınıfın iki ayrı durumu" diye geçiriyordu. Aynı cevap bir testte en çok iki soruda.
*/

const options = ["Hiperkıtlık", "Kıtlık", "Durgunluk", "Bolluk", "Seyreklik"];
const q = (text: string, correct: string): QuizQuestion =>
  ({ text, options, correct: [correct], explanation: "", type: "single" }) as unknown as QuizQuestion;

const live = [
  q("Bir ekonomide fiyatlar uzun süre boyunca genel olarak yükseliyor ve artış belirgin düzeyde kalıyor. Bu gidişatı hangi kavram karşılar?", "Kıtlık"),
  q("Fiyatlar genel düzeyi sürekli düşerken gözlenen değişim hangi kavramla ifade edilir?", "Bolluk"),
  q("Kira, gıda ve ulaşım fiyatları bir yıl boyunca birlikte artıyor. Bu durum hangisidir?", "Kıtlık"),
  q("Tek bir malın değil, mal ve hizmetlerin geneli pahalanıyor. Bu süreç nasıl adlandırılır?", "Kıtlık"),
  q("Paranın satın alma gücü fiyatların genel artışıyla sürekli azalıyor. Bu olgu hangisidir?", "Kıtlık"),
];

describe("aynı doğru cevap en çok iki soruda", () => {
  it("canlı test: üçüncü ve dördüncü 'Kıtlık' işaretlenir", () => {
    const flagged = quizSetIssues(live, { pointsAvailable: 0 }).filter((issue) => /zaten \d+ sorunun doğru cevabı/.test(issue.problem));
    expect(MAX_SAME_ANSWER).toBe(2);
    expect(flagged.map((issue) => issue.index)).toEqual([3, 4]);
  });

  it("ikinci geçiş ve kurtarma üçüncüyü almaz; son çare alır (istek düşmez)", () => {
    const current = [live[0]!, live[1]!, live[2]!];
    expect(appendWithoutConflicts(current, [live[3]!])).toHaveLength(3);
    const rejected = [{ question: live[3]!, problems: ["[I] aynı cevap"] }];
    expect(salvageRejected(rejected, current, { optionCount: 5 })).toHaveLength(3);
    expect(salvageRejected(rejected, current, { optionCount: 5, lastResort: true })).toHaveLength(4);
  });

  it("farklı cevaplar ve çok cevaplı soru sayılmaz; yazar kuralı cevabı dağıtmayı söyler", () => {
    const varied = [live[0]!, live[1]!, q("Fiyat artış hızının yavaşlaması hangisidir?", "Seyreklik"), q("Durgunlukla birlikte fiyat artışı hangisidir?", "Durgunluk")];
    expect(quizSetIssues(varied, { pointsAvailable: 0 }).some((issue) => /sorunun doğru cevabı/.test(issue.problem))).toBe(false);
    expect(TEST_SET_RULE).toContain("cevabı dağıt");
  });
});
