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

describe("kaynak düzeltme denetimi yazımdan önce sınırlı beklenir", () => {
  it("süre içinde gelen uyarı döner, gelmeyen ya da düşen denetim yazımı durdurmaz", async () => {
    const { settleWithin, SOURCE_CORRECTION_WAIT_MS } = await import("@/lib/learning/source-correction");
    expect(SOURCE_CORRECTION_WAIT_MS).toBeGreaterThan(0);
    await expect(settleWithin(Promise.resolve(raw.correction), 50)).resolves.toEqual(raw.correction);
    await expect(settleWithin(new Promise(() => undefined), 10)).resolves.toBeUndefined();
    await expect(settleWithin(Promise.reject(new Error("düştü")), 50)).resolves.toBeUndefined();
  });
});

describe("bekçi gösterim farkını ve cümle içindeki formülü yakalar (§2.1)", () => {
  const sentence = {
    documentClaim: "Kaldırma kuvveti F = V · d_cisim · g bağıntısıyla hesaplanır.",
    verifiedTruth: "Kaldırma kuvveti F = V · d_sıvı · g bağıntısıyla hesaplanır.",
    explanation: "Kaldırma kuvvetindeki yoğunluk sıvının yoğunluğudur.",
  };

  it("formül cümleden çıkar ve gösterim farkı aynı biçime iner", async () => {
    const { formulaKeys, correctionKey } = await import("@/lib/learning/source-correction");
    expect(formulaKeys(sentence.documentClaim)).toEqual([correctionKey("F = V * dcisim * g")]);
    expect(correctionKey("F = V × d_cisim × g")).toBe(correctionKey("F=V·dcisim·g"));
    expect(formulaKeys("Formül yok.")).toEqual([]);
  });

  it("cümle iddiası × ile yazılmış yanlışı yakalar, doğrusunu geçirir", async () => {
    const { repeatsSourceError, quizKeyRepeatsSourceError, trueFalseKeyRepeatsSourceError } = await import(
      "@/lib/learning/source-correction"
    );
    expect(repeatsSourceError("F = V × d_cisim × g", sentence)).toBe(true);
    expect(repeatsSourceError("Kuvvet F=V∙d cisim∙g ile bulunur.", sentence)).toBe(true);
    expect(repeatsSourceError("F = V × d_sıvı × g", sentence)).toBe(false);
    expect(repeatsSourceError("Batan hacim artınca kuvvet artar.", sentence)).toBe(false);
    expect(quizKeyRepeatsSourceError({ correct: ["F = V × d_cisim × g"] }, sentence)).not.toBeNull();
    expect(trueFalseKeyRepeatsSourceError({ text: "Kaldırma kuvveti F = V × d_cisim × g ile bulunur.", correct: true }, sentence)).toBe(true);
    expect(trueFalseKeyRepeatsSourceError({ text: "Kaldırma kuvveti F = V × d_cisim × g ile bulunur.", correct: false }, sentence)).toBe(false);
  });
});
