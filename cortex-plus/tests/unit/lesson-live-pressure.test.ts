import { describe, expect, it } from "vitest";
import {
  checkCalculationChains,
  checkUncertainCalculationClaims,
  runIndependentValidation,
} from "@/lib/learning/validation-pipeline";
import {
  definitionalInversionIssues,
  inversionIssuesInValue,
  mistakeTeachesInversion,
} from "@/lib/learning/unit-inversions";
import {
  collectLearnerVisibleText,
  groundLearnerLesson,
  groundLessonDraft,
} from "@/lib/learning/lesson-grounding";
import { layoutBoard, overviewDuplicatesSection } from "@/lib/learning/lesson-board";
import { reviewQuestionFor } from "@/lib/learning/teacher-brain";
import { publishLessonDraft } from "@/lib/learning/teaching-standards";

const INVERTED =
  "Yaygın bir hata; sorularda “kJ/kg” verildiğinde toplam enerjinin, “kJ” verildiğinde özgül enerjinin kullanılması gerektiğini unutmak. Modelleme yaparken bu hatalar sıklıkla puan kaybettirir.";

const PRESSURE_BODY =
  "Basınç, yüzeye dik kuvvetin alana oranıdır: P = F/A. Basınç SI birimi Pascal (Pa) olarak tanımlanır; genelde kPa veya MPa cinsinden ifade edilir. 1 kPa = 1000 Pa, 1 MPa = 1000 kPa. Mutlak basınç, atmosfer basıncına göre ölçülür: P_mutlak = P_atm + P_man; Vakum durumunda ise: P_mutlak = P_atm - P_vakum. Örnek olarak, 50 kg kütleli bir pistonun alanı 0.010 m² ve atmosfer basıncı 95 kPa ise denge için hesaplama yapılır: P_gaz = P_atm + (mg/A) = 95 + (50×9.81/0.010)/1000 = 144.1 kPa.";

const TEMPERATURE_BODY =
  "Sıcaklık, bir sistemin ısıl durumunu gösteren bir özelliktir. Sıfırıncı yasa iki sistem ısıl dengedeyse üçüncüyle de denge sağlar. Mutlak sıcaklık için T(K) = T(°C) + 273.15. Sıcaklık farkında 1 K = 1 °C. Bir gaz 20 °C'den 120 °C'ye ısıtılırsa artış 100 °C = 100 K olur.";

const source = [
  "Basınç, yüzeye dik kuvvetin alana oranıdır. P = F/A.",
  "1 kPa = 1000 Pa. 1 MPa = 1000 kPa.",
  "P_mutlak = P_atm + P_man. P_mutlak = P_atm - P_vakum.",
  "50 kg piston, alan 0.010 m2, atmosfer basıncı 95 kPa.",
  "P_gaz = 95 + (50×9.81/0.010)/1000 = 144.1 kPa.",
  "T(K) = T(°C) + 273.15. 1 K = 1 °C.",
  "20 °C'den 120 °C'ye, artış 100 °C = 100 K.",
].join(" ");

const check = {
  type: "trueFalse" as const,
  prompt: "Dönüşüm için 25 °C = 298.15 K kullanılmalıdır. DOĞRU MU YANLIŞ?",
  options: ["Yanlış", "Doğru"],
  answerIndex: 1,
  explanation: "Mutlak sıcaklığın doğru kullanımı şu dönüşümle sağlanır: T(K) = T(°C) + 273.15.",
};

function liveLesson() {
  return {
    title: "Basınç ve Sıcaklık Kavramları",
    objective: "Basıncı ve mutlak sıcaklığı kaynak sayfadaki bağıntıyla okuyabileceksin.",
    overview: "Basınç, yüzeye dik kuvvetin alana oranıdır: P = F/A.",
    sections: [
      { heading: "Basınç Tanımı ve Hesaplaması", body: PRESSURE_BODY },
      {
        heading: "Sıcaklık Ölçekleri ve Dönüşümleri",
        body: TEMPERATURE_BODY,
        check,
      },
      { heading: "Yaygın Hatalar", body: INVERTED },
    ],
    commonMistake: {
      claim: INVERTED,
      correction: "kJ/kg toplam enerjidir ve kJ özgül enerjidir.",
    },
    summary: ["Basınç kuvvet bölü alandır.", INVERTED],
  };
}

describe("live pressure lesson facts", () => {
  it("flags the inverted kJ sentence and keeps a repaired pair", () => {
    expect(definitionalInversionIssues(INVERTED).length).toBeGreaterThan(0);
    expect(definitionalInversionIssues(PRESSURE_BODY)).toEqual([]);
    expect(definitionalInversionIssues("P_mutlak = P_atm + P_man")).toEqual([]);
    expect(definitionalInversionIssues("P_mutlak = P_atm - P_vakum")).toEqual([]);
    expect(definitionalInversionIssues("P_gosterge = P_atm + P_mutlak").length).toBeGreaterThan(0);
    expect(
      mistakeTeachesInversion(
        "kJ/kg toplam enerjidir.",
        "kJ/kg özgül enerjidir; kJ toplam enerjidir.",
      ),
    ).toBe(false);
    expect(
      inversionIssuesInValue({
        claim: "kJ/kg toplam enerjidir.",
        correction: "kJ/kg özgül enerjidir; kJ toplam enerjidir.",
      }),
    ).toEqual([]);
    expect(mistakeTeachesInversion(INVERTED, "kJ/kg toplam enerjidir ve kJ özgül enerjidir.")).toBe(
      true,
    );
  });

  it("removes the off-topic inversion before the student sees it", () => {
    const raw = liveLesson();
    const blocked = runIndependentValidation({
      draft: JSON.stringify(raw),
      parsed: raw,
      pedagogyIssues: [],
    });
    expect(blocked.failedStage).toBe("domain");
    expect(blocked.issues.some((issue) => issue.code === "definition_inversion")).toBe(true);

    const grounded = groundLearnerLesson(raw, source);
    const lesson = grounded.lesson as {
      sections: { heading: string; body: string; check?: { prompt: string } }[];
      commonMistake?: unknown;
      summary?: string[];
      overview?: string;
    };
    expect(grounded.removed.join(" ")).toMatch(/commonMistake|scaffold|definition_inversion/);
    expect(lesson.sections.map((section) => section.heading)).not.toContain("Yaygın Hatalar");
    expect(JSON.stringify(lesson)).not.toContain("kJ/kg");
    expect(JSON.stringify(lesson)).toContain("P = F/A");
    expect(JSON.stringify(lesson)).toContain("144.1");
    expect(lesson.commonMistake).toBeUndefined();
    expect(lesson.summary?.some((item) => item.includes("kJ"))).toBe(false);
    expect(lesson.sections[1]?.check?.prompt).toBe("0 °C, 273.15 K eder. DOĞRU MU YANLIŞ?");
    expect(collectLearnerVisibleText(lesson)).not.toContain("298");

    const opened = runIndependentValidation({
      draft: JSON.stringify(lesson),
      parsed: lesson,
      pedagogyIssues: [],
    });
    expect(opened.issues.filter((issue) => issue.code === "definition_inversion")).toEqual([]);
    expect(opened.issues.filter((issue) => issue.code === "math_mismatch")).toEqual([]);
    expect(opened.failedStage).toBeNull();

    const again = groundLearnerLesson(lesson, source);
    expect(again.removed).toEqual([]);
    expect(groundLessonDraft(JSON.stringify(lesson), source)).toBe(JSON.stringify(lesson));
  });
});

describe("textbook calculation chains", () => {
  const piston = "P_gaz = 95 + (50×9.81/0.010)/1000 = 144.1 kPa";
  const chains = [
    piston,
    "P_abs = P_gage + P_atm = 49.05 kPa + 95 kPa = 144.1 kPa",
    "P_vakum = P_atm − P_abs = 101 kPa − 20 kPa = 81 kPa",
    "ρgh = 1000 × 9.81 × 2 = 19620 Pa",
    "P = 1000 × 9,81 × 5 = 49050 Pa",
    "P_abs = 150 kPa + 101.325 kPa = 251.325 kPa",
    "ρgh = 13600 × 9.81 × 0.76 = 101396 Pa",
    "P_g = 150 kPa + 101.3 kPa = 251.3 kPa",
  ];

  it("accepts the piston chain and does not treat mg as kilopascals", () => {
    for (const line of chains) {
      expect(checkCalculationChains(line), line).toEqual([]);
    }
    const mixed = `${piston}. 95 kPa + 490.5 kPa = 144.1`;
    expect(checkCalculationChains(mixed)).toEqual([]);
    expect(checkUncertainCalculationClaims(mixed).length).toBeGreaterThan(0);
    expect(checkCalculationChains("95 kPa + 490.5 kPa = 144.1")).toHaveLength(1);
    expect(checkCalculationChains("49.05 kPa + 95 kPa = 200 kPa")).toHaveLength(1);
  });
});

describe("short review and board", () => {
  it("rephrases a temperature true/false without the fake prefix", () => {
    const retry = reviewQuestionFor(check, "tr", TEMPERATURE_BODY);
    expect(retry.prompt).toBe("0 °C, 273.15 K eder. DOĞRU MU YANLIŞ?");
    expect(retry.prompt).not.toContain("başka sözcüklerle");
    expect(retry.options[retry.answerIndex]).toBe("Doğru");

    const noAnchor = reviewQuestionFor(
      {
        ...check,
        explanation: "Dönüşüm cümlesi bölümde geçtiği gibi doğrudur.",
        prompt: "Dönüşüm için 25 °C = 298.15 K kullanılmalıdır. DOĞRU MU YANLIŞ?",
      },
      "tr",
      "Basınç kuvvet bölü alandır.",
    );
    expect(noAnchor.prompt).toBe("Dönüşüm için 25 °C = 298.15 K kullanılmamalıdır. DOĞRU MU YANLIŞ?");
    expect(noAnchor.prompt).not.toContain("başka sözcüklerle");
    expect(noAnchor.options[noAnchor.answerIndex]).toBe("Yanlış");
  });

  it("keeps one bold term and splits the board", () => {
    const published = publishLessonDraft({
      title: "Basınç",
      objective: "Basıncı kuvvet ve alandan okuyabileceksin.",
      sections: [
        {
          heading: "Basınç",
          body: "**Basınç**, yüzeye dik kuvvettir. **Basınç** SI birimi pascaldır ve tablodan okunur.",
          check,
        },
      ],
    });
    const body = published?.sections[0]?.body ?? "";
    expect(body.split("**Basınç**").length - 1).toBe(1);

    const lines = layoutBoard(PRESSURE_BODY);
    expect(lines.some((line) => line.kind === "formula" && line.text.includes("P = F/A"))).toBe(true);
    expect(lines.some((line) => line.kind === "formula" && line.text.includes("144.1"))).toBe(true);
    expect(lines.filter((line) => line.kind === "formula").length).toBeGreaterThan(1);
    expect(
      overviewDuplicatesSection(
        "Basınç, yüzeye dik kuvvetin alana oranıdır: P = F/A.",
        PRESSURE_BODY,
      ),
    ).toBe(true);
  });
});
