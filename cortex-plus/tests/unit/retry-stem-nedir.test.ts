import { describe, expect, it } from "vitest";
import { rewordPracticeQuestion } from "@/lib/learning/focused-practice";

/*
  20 Ekim 2026, canlı odaklı pratik: kayıtlı sorunun kökü "Bu değişimin sıcaklık dengesine katkısı nedir?"
  tekrarda "katkısı hangi addır?" oldu. Kod "nedir?"in hep bir ad sorduğunu varsayıyordu ("ne ile
  bilinir?" yedeği de aynı). "Ne denir?" gerçekten ad sorar; o eşleme kalır.
*/

const question = (text: string) => ({
  text,
  options: ["Deriden ısı kaybını azaltmak", "Kaslarda istemsiz kasılma başlatmak", "Vücutta ısı üretimini artırmak", "Deriden ısı kaybını artırmak"],
  correct: ["Deriden ısı kaybını artırmak"],
  multi: false,
  explanation: "Damarların genişlemesi deriye daha çok kan getirir ve ısı kaybını artırır; daralma tersini yapar, titreme ısı üretir.",
  topic: "Homeostazi Döngüsü ve Vücut Sıcaklığı",
});

describe("tekrar sorusu kökü: 'nedir' ad sormaz", () => {
  it("'katkısı nedir?' bozulmaz", () => {
    const next = rewordPracticeQuestion(question("Sıcak ortamda deri damarları genişliyor. Bu değişimin sıcaklık dengesine katkısı nedir?"));
    expect(next.text).not.toMatch(/hangi addır|ne ile bilinir/);
    // Doğru cevap aynı kalır; şıklar yer değiştirebilir.
    expect(next.correct).toEqual(["Deriden ısı kaybını artırmak"]);
    expect(next.options).toContain("Deriden ısı kaybını artırmak");
  });

  it("'ne denir?' ad sorar, eşleme kalır", () => {
    const next = rewordPracticeQuestion({
      ...question("Vücut sıcaklığını algılayan sinir uçlarına ne denir?"),
      options: ["Termoreseptör", "Ter bezi", "Hipotalamus", "Deri damarı"],
      correct: ["Termoreseptör"],
      explanation: "Sıcaklığı termoreseptörler algılar; karşılaştırmayı hipotalamus yapar.",
    });
    expect(next.text).not.toMatch(/hangi addır|ne ile bilinir/);
    expect(next.correct).toEqual(["Termoreseptör"]);
  });
});
