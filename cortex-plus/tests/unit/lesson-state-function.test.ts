import { describe, expect, it } from "vitest";
import {
  definitionalInversionIssues,
  inversionIssuesInValue,
  mistakeTeachesInversion,
} from "@/lib/learning/unit-inversions";

const LIVE_PROMPT =
  "Bir sistem yalnızca başlangıç ve son haline göre tanımlanıyorsa, değişim hal fonksiyonu olarak adlandırılır.";
const LIVE_EXPLANATION = "Değişim hal fonksiyonu, başlangıç ve son halden bağımsızdır.";
const LIVE_CLAIM = "Bir proses sırasında net enerji değişimi sıfırdır.";
const LIVE_CORRECTION =
  "Bir proses sırasında enerji değişimi hal özelliklerine bağlıdır, net değişim ortam koşullarına göre değişebilir.";

const STATE_SENTENCE =
  "Hal fonksiyonunun değişimi yalnızca başlangıç ve son hale bağlıdır ve yoldan bağımsızdır.";

describe("thermodynamic concept pairs", () => {
  it("keeps textbook sentences and flags the inverted live strings", () => {
    const clean = [
      STATE_SENTENCE,
      "Isı ve iş yol fonksiyonudur; yola bağlıdır.",
      "Isı bir yol fonksiyonudur, hal fonksiyonu değildir.",
      "Hal fonksiyonu yola bağlı değildir.",
      "Bir çevrimde net enerji değişimi sıfırdır.",
      "Bir çevrimde ΔU = ΔH = ΔE = 0.",
      "Kapalı sistemde kütle geçişi olmaz. Açık sistemde kütle geçişi olur.",
      "Adyabatik süreçte ısı geçişi yoktur. İzotermal süreçte sıcaklık sabittir.",
      "Yarı dengeli süreç ara hallerin her birinde dengeye yakındır.",
      "Yarı dengeli süreç dengeden uzaklaşmadan ilerler.",
      "Sıcaklık yeğin bir özelliktir.",
      "Kütle yaygın bir özelliktir.",
      "Özgül hacim yeğin bir özelliktir.",
    ];
    for (const sentence of clean) {
      expect(definitionalInversionIssues(sentence), sentence).toEqual([]);
    }

    const wrong = [
      LIVE_EXPLANATION,
      LIVE_PROMPT,
      LIVE_CORRECTION,
      LIVE_CLAIM,
      "Hal fonksiyonu yola bağlıdır.",
      "Isı bir hal fonksiyonudur.",
      "Adyabatik süreçte sıcaklık sabittir.",
      "İzotermal süreçte ısı geçişi yoktur.",
      "Kapalı sistem kütle geçirir.",
      "Açık sistemde kütle geçişi olmaz.",
      "Sıcaklık yaygın bir özelliktir.",
      "Kütle yeğin bir özelliktir.",
      "Yarı dengeli süreç dengeden uzaktır.",
      "Bir çevrimde net enerji değişimi sıfır değildir.",
    ];
    for (const sentence of wrong) {
      expect(definitionalInversionIssues(sentence).length, sentence).toBeGreaterThan(0);
    }
    expect(definitionalInversionIssues(LIVE_CORRECTION).join(" ")).toMatch(/Belirsiz fizik/);
    expect(definitionalInversionIssues(LIVE_EXPLANATION).join(" ")).toMatch(/hal fonksiyonu/);
  });

  it("keeps a process-zero claim when the correction names the cycle", () => {
    const repair = "Bir çevrimde net enerji değişimi sıfırdır; bir proseste değişim uç hallere bağlıdır.";
    expect(mistakeTeachesInversion(LIVE_CLAIM, repair)).toBe(false);
    expect(
      inversionIssuesInValue({
        claim: LIVE_CLAIM,
        correction: repair,
      }),
    ).toEqual([]);
    expect(mistakeTeachesInversion(LIVE_CLAIM, LIVE_CORRECTION)).toBe(true);
  });

  it("treats a Doğru-keyed prompt as the lesson and a Yanlış-keyed prompt as the misconception", () => {
    const taught = inversionIssuesInValue({
      prompt: LIVE_PROMPT,
      options: ["Yanlış", "Doğru"],
      answerIndex: 1,
      explanation: STATE_SENTENCE,
    });
    expect(taught.length).toBeGreaterThan(0);

    const misconception = inversionIssuesInValue({
      prompt: LIVE_PROMPT,
      options: ["Doğru", "Yanlış"],
      answerIndex: 1,
      explanation: STATE_SENTENCE,
    });
    expect(misconception).toEqual([]);
  });
});
