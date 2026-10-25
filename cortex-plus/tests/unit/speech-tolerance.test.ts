import { describe, expect, it } from "vitest";
import { normalizeSpeech, speechNear } from "@/lib/learning/speech-tolerance";
import { answerCoversPoint, gradeOralAnswer } from "@/lib/learning/oral-exam";

describe("konuşma tanıması toleransı", () => {
  it("formülü, kısaltmayı ve bitişik yazımı aynı noktaya çeker", () => {
    expect(normalizeSpeech("x kare artı 1")).toBe("x2 + 1");
    expect(normalizeSpeech("x² + 1")).toBe("x2 + 1");
    expect(speechNear("a te pe mitokondiride üretilir", "ATP mitokondride")).toBe(true);
    expect(speechNear("karbon dioksit", "karbondioksit")).toBe(true);
    expect(speechNear("iki mol su", "2 mol")).toBe(true);
  });

  it("başka kavramı ve başka sayıyı geçirmez", () => {
    expect(speechNear("fruktoz", "glukoz")).toBe(false);
    expect(speechNear("sınırlayıcı bileşen ilk tükenen maddedir", "katsayıya bölünür")).toBe(false);
    expect(speechNear("belge meşrutiyet döneminde çıktı", "1876'da ilan")).toBe(false);
    expect(answerCoversPoint("mitokondiri enerji üretir", "mitokondri enerji üretir")).toBe(true);
  });

  it("alıntı sesçe yakınsa sözlü not düşmez", () => {
    const grade = gradeOralAnswer(
      {
        prompt: "ATP nerede sentezlenir?",
        expectedPoints: ["mitokondride ATP sentezlenir"],
        modelAnswer: "mitokondride ATP sentezlenir",
      },
      "mitokondiride a te pe sentezlenir",
      "Mitokondride ATP sentezlenir.",
      0,
      [],
      [
        {
          point: "mitokondride ATP sentezlenir",
          status: "covered",
          quote: "mitokondride ATP sentezlenir",
        },
      ],
    );
    expect(grade.verdict).toBe("dogru");
  });
});
