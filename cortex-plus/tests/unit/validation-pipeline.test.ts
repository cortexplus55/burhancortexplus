import { describe, expect, it } from "vitest";
import {
  checkSimpleMathClaims,
  checkImpossiblePercentClaims,
  recheckAfterRepair,
  runIndependentValidation,
} from "@/lib/learning/validation-pipeline";

describe("Stage 7 validation pipeline", () => {
  it("runs stages in structural → source → domain → pedagogy order", () => {
    const result = runIndependentValidation({
      draft: "not-json",
      parsed: null,
      pedagogyIssues: ["should not be reached"],
      requireSourceSupport: true,
      sourceExcerpt: "",
    });
    expect(result.ok).toBe(false);
    expect(result.failedStage).toBe("structural");
    expect(result.issues[0]?.code).toBe("invalid_json");
    expect(result.issues.some((i) => i.stage === "pedagogy")).toBe(false);
  });

  it("fails source before domain when excerpt is required but missing", () => {
    const result = runIndependentValidation({
      draft: "{}",
      parsed: { questions: [{ text: "Soru metni yeterince uzun", options: ["a", "b"] }] },
      requireSourceSupport: true,
      sourceExcerpt: "   ",
      pedagogyIssues: [],
    });
    expect(result.failedStage).toBe("source");
    expect(result.issues[0]?.code).toBe("source_missing");
  });

  it("detects simple math mismatches independently of the LLM", () => {
    expect(checkSimpleMathClaims("2+2=5 ve devam")).toContain(
      "Hesap uyuşmazlığı: 2+2≠5",
    );
    expect(checkSimpleMathClaims("3×4=12")).toEqual([]);
  });

  it("accepts a result rounded to the decimals it shows", () => {
    // Canlıda bu yüzden doğru bir zemin dersi reddedildi: 0,54/1,54 =
    // 0,35064… ve ders üç basamağa yuvarlayıp 0,351 yazmıştı. Ders kitabı
    // da yuvarlar; denetim 1e-6 mutlak fark istiyordu.
    expect(checkSimpleMathClaims("n = 0,54 / 1,54 = 0,351")).toEqual([]);
    expect(checkSimpleMathClaims("1 / 3 = 0,33")).toEqual([]);
    // Yuvarlamaya izin vermek, yanlışa izin vermek değil.
    expect(checkSimpleMathClaims("0,54 / 1,54 = 0,451")).toHaveLength(1);
  });

  it("does not grade the middle of a chained calculation", () => {
    // "3,24 × 9,81 / 1,54 = 20,64" doğru. Denetim zincirin son iki terimini
    // koparıp "9,81 / 1,54 = 20,64" diye okuyor ve hata sanıyordu.
    expect(
      checkSimpleMathClaims("γ sat = 3,24 × 9,81 / 1,54 = 20,64 kN/m³"),
    ).toEqual([]);
    // Zincirin BAŞI hâlâ denetlenir.
    expect(checkSimpleMathClaims("2 + 2 = 5 ve sonra devam")).toHaveLength(1);
  });

  it("flags impossible percents and mol/g unit clashes", () => {
    expect(checkImpossiblePercentClaims("yüzde 150 başarı oranı")).toContain(
      "İmkânsız yüzde: 150",
    );
    const unit = runIndependentValidation({
      draft: "1 mol = 1 g",
      parsed: {
        questions: [
          { text: "Soru bir yeterince uzun", options: ["a", "b"] },
          { text: "Soru iki yeterince uzun", options: ["a", "b"] },
          { text: "Soru üç yeterince uzun", options: ["a", "b"] },
        ],
      },
      minItems: 3,
      pedagogyIssues: [],
    });
    expect(unit.failedStage).toBe("domain");
    expect(unit.issues.some((i) => i.code === "unit_mismatch")).toBe(true);
  });

  it("flags duplicate options in domain stage", () => {
    const result = runIndependentValidation({
      draft: "{}",
      parsed: {
        questions: [
          {
            text: "Hangisi doğrudur?",
            options: ["Aynı", "Aynı", "Farklı"],
          },
        ],
      },
      pedagogyIssues: [],
    });
    expect(result.failedStage).toBe("domain");
    expect(result.issues.some((i) => i.code === "duplicate_options")).toBe(true);
  });

  it("never auto-accepts repaired content without recheck", () => {
    const repaired = recheckAfterRepair({
      draft: '{"questions":[]}',
      parsed: { questions: [] },
      minItems: 3,
      pedagogyIssues: [],
    });
    expect(repaired.ok).toBe(false);
    expect(repaired.failedStage).toBe("structural");
  });

  it("accepts a structurally sound draft with source support", () => {
    const result = runIndependentValidation({
      draft: '{"questions":[{"text":"Birim çember nedir?","options":["A","B"]}]}',
      parsed: {
        questions: [
          { text: "Birim çember nedir?", options: ["Yarıçap 1", "Yarıçap 2"] },
          { text: "sin 90° kaçtır?", options: ["0", "1"] },
          { text: "cos 0° kaçtır?", options: ["0", "1"] },
        ],
      },
      minItems: 3,
      requireSourceSupport: true,
      sourceExcerpt: "Birim çember yarıçapı 1 olan çemberdir.",
      pedagogyIssues: [],
    });
    expect(result.ok).toBe(true);
    expect(result.failedStage).toBeNull();
  });

  it("surfaces pedagogy only after earlier stages pass", () => {
    const result = runIndependentValidation({
      draft: "{}",
      parsed: {
        questions: [
          { text: "Soru bir", options: ["a", "b"] },
          { text: "Soru iki", options: ["a", "b"] },
          { text: "Soru üç", options: ["a", "b"] },
        ],
      },
      minItems: 3,
      pedagogyIssues: ["Explanation eksik"],
    });
    expect(result.failedStage).toBe("pedagogy");
    expect(result.issues[0]?.message).toContain("Explanation");
  });
});
