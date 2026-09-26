import { describe, expect, it } from "vitest";
import {
  checkSimpleMathClaims,
  checkCalculationChains,
  checkUnitConversionClaims,
  checkUncertainUnitClaims,
  isUnconfirmedMathAllegation,
  checkImpossiblePercentClaims,
  recheckAfterRepair,
  runIndependentValidation,
  validationIssueBlocks,
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
    expect(checkUnitConversionClaims("50000 Pa = 50 kPa")).toEqual([]);
    expect(checkUnitConversionClaims("1 kPa = 1000 Pa")).toEqual([]);
    expect(checkUnitConversionClaims("50000 Pa = 5 kPa")).toHaveLength(1);
    expect(checkUnitConversionClaims("50 kPa = 5000 Pa")).toHaveLength(1);
    expect(checkUnitConversionClaims("49.05 kPa = 144.1 kPa")).toEqual([]);
    expect(checkUnitConversionClaims("20 kPa = 81 kPa")).toEqual([]);
    expect(checkUncertainUnitClaims("49.05 kPa = 144.1 kPa")).toHaveLength(1);
    expect(checkUncertainUnitClaims("20 kPa = 81 kPa")).toHaveLength(1);
    expect(
      isUnconfirmedMathAllegation(
        "50000 Pa = 50 kPa dönüşümü yanlış, 50 kPa hatalıdır.",
        "Örnekte 50000 Pa = 50 kPa yazılır.",
      ),
    ).toBe(true);
    expect(
      isUnconfirmedMathAllegation(
        "Kaynakta olmayan formül PV = nRT.",
        "Örnekte 50000 Pa = 50 kPa yazılır.",
      ),
    ).toBe(false);
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

  it("rejects an unsupported absolute and a dataless calculation", () => {
    const absolute = runIndependentValidation({
      draft: "{}",
      parsed: {
        overview: "Direnç sadece gerilime bağlıdır ve başka hiçbir şeye bağlı değildir.",
        sections: [
          { heading: "Ohm bağıntısı", body: "Ohm yasası gerilimi akım ve dirençle ilişkilendirir." },
          { heading: "Direncin anlamı", body: "Direnç iletkenin kendi özelliğidir." },
        ],
      },
      sourceExcerpt: "Ohm yasası V = I R bağıntısını kurar. Direnç iletkenin özelliğidir.",
      pedagogyIssues: [],
    });
    expect(absolute.ok).toBe(false);
    expect(absolute.failedStage).toBe("source");
    expect(absolute.issues.some((issue) => issue.code === "unsupported_absolute")).toBe(true);

    const orphan = runIndependentValidation({
      draft: "yükseklik hesabı",
      parsed: {
        sections: [{ heading: "Serbest düşme", body: "Oluşan yükseklik = 5 × 4 = 20 m." }],
        example: {
          prompt: "Başlangıç verisi yok.",
          solution: "h = 5 × 4 = 20 m.",
        },
      },
      pedagogyIssues: [],
    });
    expect(orphan.ok).toBe(false);
    expect(orphan.failedStage).toBe("domain");
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

describe("pressure and temperature claims", () => {
  it("follows gage, vacuum, hydrostatic and temperature chains", () => {
    const gage = "P_abs = P_gage + P_atm = 49.05 kPa + 95 kPa = 144.1 kPa";
    const vacuum = "P_vakum = P_atm − P_abs = 101 kPa − 20 kPa = 81 kPa";
    const hydro = "ρgh = 1000 × 9.81 × 2 = 19620 Pa";
    const hydroDeep = "P = 1000 × 9,81 × 5 = 49050 Pa";
    for (const sample of [gage, vacuum, hydro, hydroDeep]) {
      expect(checkUnitConversionClaims(sample)).toEqual([]);
      expect(checkCalculationChains(sample)).toEqual([]);
      expect(checkUncertainUnitClaims(sample)).toEqual([]);
    }
    expect(checkUnitConversionClaims("25 °C = 298 K")).toEqual([]);
    expect(checkUnitConversionClaims("0 °C = 273 K")).toEqual([]);
    expect(checkUnitConversionClaims("100 °C = 373 K")).toEqual([]);
    expect(checkUnitConversionClaims("1 atm = 101.325 kPa")).toEqual([]);
    expect(checkUnitConversionClaims("1 bar = 100 kPa")).toEqual([]);
    expect(checkUnitConversionClaims("1 atm = 1.01325 bar")).toEqual([]);
    expect(checkUnitConversionClaims("101325 Pa = 1 atm")).toEqual([]);
    expect(checkUnitConversionClaims("101 kPa = 1 atm")).toEqual([]);
  });

  it("still blocks a real wrong conversion and a wrong pressure sum", () => {
    expect(checkUnitConversionClaims("50 kPa = 5000 Pa")).toEqual([
      "Birim dönüşümü tutarsız: 50 kPa = 5000 Pa",
    ]);
    expect(checkCalculationChains("49.05 kPa + 95 kPa = 200 kPa")).toHaveLength(1);
    expect(checkUnitConversionClaims("25 °C = 250 K")).toHaveLength(1);
    expect(checkUnitConversionClaims("0 °C = 0 K")).toHaveLength(1);
  });

  it("accepts temperature intervals and absolute conversions, and only warns when unsure", () => {
    const accepted = [
      "1 K = 1 °C",
      "1°C = 1 K",
      "ΔT için 1 K = 1 °C yazılır",
      "1.8 °F = 1 °C",
      "1 °C = 1.8 °F",
      "9 °F = 5 °C",
      "1 °F = 1 °R",
      "1 K = 1.8 °R",
      "25 °C = 298.15 K",
      "25 °C = 298 K",
      "0 °C = 273.15 K",
      "0 °C = 273 K",
      "100 °C = 373 K",
      "32 °F = 0 °C",
      "212 °F = 100 °C",
      "0 K = -273.15 °C",
      "0 °R = -459.67 °F",
      "491.67 °R = 0 °C",
    ];
    for (const line of accepted) {
      expect(checkUnitConversionClaims(line), line).toEqual([]);
      expect(checkUncertainUnitClaims(line), line).toEqual([]);
    }
    expect(checkUnitConversionClaims("25 °C = 300 K")).toEqual([]);
    expect(checkUncertainUnitClaims("25 °C = 300 K")).toHaveLength(1);
    expect(checkUnitConversionClaims("1 °C = 2 °F")).toEqual([]);
    expect(checkUncertainUnitClaims("1 °C = 2 °F")).toHaveLength(1);
    expect(checkUnitConversionClaims("100 °C = 212 K")).toHaveLength(1);

    const realistic = [
      "P_g = 150 kPa, P_atm = 101.325 kPa ise P_abs = 150 kPa + 101.325 kPa = 251.325 kPa",
      "P_vakum = 101.3 kPa − 40 kPa = 61.3 kPa",
      "ρgh = 1000 × 9.81 × 0.5 = 4905 Pa",
      "ρgh = 13600 × 9.81 × 0.76 = 101396 Pa",
      "1 bar = 100 kPa",
      "1 atm = 101.325 kPa",
      "1 atm = 760 mmHg",
      "1 bar = 750 mmHg",
      "760 mmHg = 101.325 kPa",
      "1 mmHg = 133.3 Pa",
      "50 kPa = 0.5 bar",
      "0.001 m³/kg = 1 L/kg",
      "1 m³/kg = 1000 cm³/g",
      "1 kJ/kg = 1000 J/kg",
      "1 kJ/kg = 1 J/g",
      "300 kJ/kg = 0.3 MJ/kg",
      "Sıcaklık farkında 1 K = 1 °C, oda sıcaklığı 25 °C = 298 K",
    ];
    for (const line of realistic) {
      expect(checkUnitConversionClaims(line), line).toEqual([]);
      expect(checkCalculationChains(line), line).toEqual([]);
    }
    expect(checkUnitConversionClaims("50 kPa = 500 mmHg")).toHaveLength(1);
    expect(checkUnitConversionClaims("1 m³/kg = 1 cm³/g")).toHaveLength(1);
    expect(checkUnitConversionClaims("300 kJ/kg = 300 J/kg")).toHaveLength(1);

    const pipeline = runIndependentValidation({
      draft: "Aralık olarak 1 K = 1 °C. 25 °C = 298.15 K.",
      parsed: { note: "Aralık olarak 1 K = 1 °C. 25 °C = 298.15 K." },
    });
    expect(pipeline.failedStage).toBeNull();
    expect(pipeline.issues.some((issue) => issue.code === "unit_mismatch")).toBe(false);
  });

  it("does not fail the pipeline on an uncertain same-unit equality", () => {
    const result = runIndependentValidation({
      draft: "P_abs = 49.05 kPa = 144.1 kPa diye yazıldı.",
      parsed: { note: "P_abs = 49.05 kPa = 144.1 kPa diye yazıldı." },
    });
    expect(result.failedStage).toBeNull();
    expect(result.ok).toBe(true);
    const warning = result.issues.find((issue) => issue.code === "unit_uncertain");
    expect(warning).toBeTruthy();
    expect(validationIssueBlocks(warning!, result.issues.join(" "))).toBe(false);
  });
});
