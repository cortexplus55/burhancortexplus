import { describe, expect, it } from "vitest";
import {
  quizKeyRepeatsSourceError,
  readModelSourceCorrection,
  sourceCorrectionPromptBlock,
  trueFalseKeyRepeatsSourceError,
} from "@/lib/learning/source-correction";
import { misconceptionFirstLine, presentsPremise } from "@/lib/learning/tutor-answer";

/* Faz 1-A §2 (19 Kasım 2026): bariz bilimsel hata uyarısı ve /ogretmen yanılgı düzeltmesi. Şartname örnekleri. */

const SOURCE = "Kaldırma kuvveti F = V · d_cisim · g bağıntısıyla bulunur. Cisim batarsa kuvvet büyür.";
const raw = {
  correction: {
    documentClaim: "F = V · d_cisim · g",
    verifiedTruth: "F = V · d_sıvı · g",
    explanation: "Kaldırma kuvvetindeki yoğunluk sıvının yoğunluğudur.",
    domain: "fizik",
    confidence: "yuksek",
  },
};

describe("kaynak düzeltme uyarısı", () => {
  it("yalnız yüksek güvenli, doğa bilimi alanındaki ve kaynakta harfi harfine geçen hata uyarı olur", () => {
    expect(readModelSourceCorrection(raw, SOURCE)?.verifiedTruth).toBe("F = V · d_sıvı · g");
    expect(readModelSourceCorrection({ correction: { ...raw.correction, confidence: "orta" } }, SOURCE)).toBeNull();
    expect(readModelSourceCorrection({ correction: { ...raw.correction, domain: "hukuk" } }, SOURCE)).toBeNull();
    expect(readModelSourceCorrection(raw, "Avogadro sayısı 6,02 x 10^23'tür.")).toBeNull();
  });

  it("cevap anahtarı kaynağın yanlışını taşıyamaz; yazarlar doğrusunu okur", () => {
    const warning = readModelSourceCorrection(raw, SOURCE)!;
    expect(quizKeyRepeatsSourceError({ correct: ["F = V · d_cisim · g"] }, warning)).not.toBeNull();
    expect(quizKeyRepeatsSourceError({ correct: ["F = V · d_sıvı · g"] }, warning)).toBeNull();
    expect(trueFalseKeyRepeatsSourceError({ text: "Kaldırma kuvveti F = V · d_cisim · g ile bulunur.", correct: true }, warning)).toBe(true);
    expect(sourceCorrectionPromptBlock(warning)).toContain("«F = V · d_sıvı · g»");
  });
});

describe("/ogretmen: yanılgı ilk cümlede düzeltilir", () => {
  it("önermeyi onaylatan mesaj ek vurgu alır", () => {
    const message = "Dünya Güneş'e yaklaşınca yaz olur değil mi?";
    expect(presentsPremise(message)).toBe(true);
    expect(misconceptionFirstLine(message)).toContain("İLK CÜMLEDE");
    expect(misconceptionFirstLine(message)).toContain("ilk cümle düzeltmedir");
  });
});
