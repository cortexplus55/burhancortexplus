// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { OralResults } from "@/components/parity/oral-exam-flow";
import { sameOptionSet, selectedOptions } from "@/lib/learning/exam-quiz";
import { gradeOralAnswer, gradeOralExam, oralMisconceptionDrafts } from "@/lib/learning/oral-exam";
import { oralVoicePercent } from "@/lib/learning/oral-exam-chrome";
import {
  optionWhyQualityIssues,
  verifyChoiceQuestion,
  type VerifiedChoice,
} from "@/lib/learning/question-verifier";
import { quantityClaimGrounded } from "@/lib/learning/teacher-brain";

afterEach(cleanup);

const CHEM_SOURCE = [
  "[s.4] kimya.pdf: 88 g CO2 için mol kütlesi 44 g/mol'dür. Mol sayısı 88 / 44 ile bulunur.",
  "[s.5] kimya.pdf: 1,5 mol O2 ve mol kütlesi 32 g/mol. Kütle m = n × M bağıntısıyla bulunur.",
  "[s.6] kimya.pdf: 2Al + 3Cl₂ → 2AlCl₃. Sınırlayıcı bileşen, tepkimede ilk tükenen maddedir; mol / katsayı ile bulunur.",
].join("\n");

const HISTORY_SOURCE =
  "[s.2] tarih.pdf: Kurtuluş Savaşı 1919'da başlayıp 1923'te bitti. Süreç dört yıl sürdü.";

const BIO_SOURCE =
  "[s.1] hucre.pdf: 2 hücre 3 kez mitozla bölünürse 16 hücre oluşur. Mitozda kromozom sayısı korunur.";

const LAW_SOURCE =
  "[s.3] anayasa.pdf: Kanun-i Esasi 1876'da ilan edildi. Meşrutiyet padişahın yetkisini bir anayasa ile sınırladı.";

/** Unique trap bodies — never the banned filler. */
function optionWhyFor(options: string[], correct: string[]): string[] {
  return options.map((option, index) => {
    if (correct.includes(option)) {
      return `${option} doğru seçenektir; kaynakla uyumludur.`;
    }
    return `${option} yanlıştır; tuzak: ${["oran", "yıl", "birim", "ürün"][index % 4]} karıştırmak.`;
  });
}

function choice(
  partial: Omit<VerifiedChoice, "multi" | "optionWhy"> & { multi?: boolean; optionWhy?: string[] },
): VerifiedChoice {
  const multi = partial.multi ?? false;
  return {
    ...partial,
    multi,
    optionWhy: partial.optionWhy ?? optionWhyFor(partial.options, partial.correct),
  };
}

describe("S4: gradeOralAnswer respects semantic quotes", () => {
  const question = {
    prompt: "Sınırlayıcı bileşen nedir?",
    expectedPoints: ["mol sayısı katsayıya bölünür"],
    modelAnswer: "mol sayısı katsayıya bölünür",
  };

  it("scores covered + valid quote as dogru", () => {
    const answer = "Mol sayısı stokiyometrik katsayıya bölünür.";
    const grade = gradeOralAnswer(
      question,
      answer,
      CHEM_SOURCE,
      0,
      [],
      [
        {
          point: "mol sayısı katsayıya bölünür",
          status: "covered",
          quote: "katsayıya bölünür",
        },
      ],
    );
    expect(grade.verdict).toBe("dogru");
    expect(grade.ratio).toBe(1);
  });

  it("treats covered status as missing when quote is not in the answer", () => {
    const answer = "Sınırlayıcı bileşen ilk tükenen maddedir.";
    const grade = gradeOralAnswer(
      question,
      answer,
      CHEM_SOURCE,
      0,
      [],
      [
        {
          point: "mol sayısı katsayıya bölünür",
          status: "covered",
          quote: "katsayıya bölünür",
        },
      ],
    );
    expect(grade.ratio).toBe(0);
    expect(grade.missing).toContain("mol sayısı katsayıya bölünür");
    expect(grade.verdict).not.toBe("dogru");
  });

  it("uses the same quote rule for a non-chemistry answer", () => {
    const lawQ = {
      prompt: "Kanun-i Esasi hangi yılda ilan edildi?",
      expectedPoints: ["1876'da ilan edildi"],
      modelAnswer: "1876'da ilan edildi",
    };
    const ok = gradeOralAnswer(
      lawQ,
      "Kanun-i Esasi 1876'da ilan edildi.",
      LAW_SOURCE,
      0,
      [],
      [{ point: "1876'da ilan edildi", status: "covered", quote: "1876'da ilan" }],
    );
    expect(ok.verdict).toBe("dogru");
    const missing = gradeOralAnswer(
      lawQ,
      "Belge Meşrutiyet döneminde çıktı.",
      LAW_SOURCE,
      0,
      [],
      [{ point: "1876'da ilan edildi", status: "covered", quote: "1876'da ilan" }],
    );
    expect(missing.ratio).toBe(0);
  });
});

describe("S6: oralVoicePercent from gradedRatios", () => {
  it("averages gradedRatios [1,0,0] to about 33", () => {
    expect(oralVoicePercent([], 3, [1, 0, 0])).toBe(33);
  });

  it("returns 0 without gradedRatios even when answers exist", () => {
    expect(
      oralVoicePercent([
        { role: "assistant", content: "Soru bir" },
        { role: "user", content: "Cevap bir" },
        { role: "assistant", content: "Soru iki" },
        { role: "user", content: "Cevap iki" },
      ]),
    ).toBe(0);
  });
});

describe("oralMisconceptionDrafts skips correct answers", () => {
  it("does not queue dogru chemistry or history items", () => {
    const report = gradeOralExam(
      [
        {
          prompt: "Sınırlayıcı bileşen nedir?",
          expectedPoints: ["mol sayısı katsayıya bölünür"],
          modelAnswer: "mol sayısı katsayıya bölünür",
          learningObjective: "Sınırlayıcı",
        },
        {
          prompt: "Süreç kaç yıl sürdü?",
          expectedPoints: ["1923 - 1919 = 4"],
          modelAnswer: "1923 - 1919 = 4",
          learningObjective: "Süre",
        },
      ],
      {
        "0": "Mol sayısı stokiyometrik katsayıya bölünür.",
        "1": "Bilmiyorum",
      },
      `${CHEM_SOURCE}\n${HISTORY_SOURCE}`,
    );
    const drafts = oralMisconceptionDrafts(report);
    expect(drafts.every((d) => d.claim !== "Mol sayısı stokiyometrik katsayıya bölünür.")).toBe(true);
    expect(report.items[0]?.verdict).toBe("dogru");
    expect(drafts.some((d) => /Bilmiyorum/i.test(d.claim))).toBe(true);
  });
});

describe("OralResults does not render DENEME letter grades", () => {
  it("shows percent and headline without A–F letter chips", () => {
    render(
      createElement(OralResults, {
        topicLabel: "Mol hesabı",
        pct: 0,
        onReview: () => undefined,
        onRepeat: () => undefined,
        nextHref: "/deneme-sinavlari/prep",
      }),
    );
    expect(screen.getByText("%0")).toBeTruthy();
    expect(screen.getByText("Daha fazla pratik yapmalısın")).toBeTruthy();
    expect(screen.queryByText("F")).toBeNull();
    expect(screen.queryByText("A")).toBeNull();
    expect(screen.queryByText(/^DENEME$/i)).toBeNull();
  });
});

describe("Q1: optionWhyQualityIssues rejects identical trap reasons", () => {
  it("flags three identical trap optionWhy lines", () => {
    const options = ["24,5 g", "98 g", "0,25 g", "245 g"];
    const optionWhy = [
      "24,5 g doğrudur; n×M ile uyumludur.",
      "98 g yanlıştır; tuzak: mol kütlesini kütle sanmak.",
      "0,25 g yanlıştır; tuzak: mol kütlesini kütle sanmak.",
      "245 g yanlıştır; tuzak: mol kütlesini kütle sanmak.",
    ];
    const issues = optionWhyQualityIssues(optionWhy, options);
    expect(issues.some((i) => /tuzak|tekrar/i.test(i))).toBe(true);
    const checked = verifyChoiceQuestion(
      choice({
        text: "0,25 mol H2SO4 kaç gramdır? M = 98 g/mol.",
        options,
        correct: ["24,5 g"],
        explanation: "m = 0,25 × 98 = 24,5 g.",
        misconceptionTag: "oran",
        optionWhy,
      }),
      CHEM_SOURCE,
    );
    expect(checked.status).toBe("drop");
  });

  it("accepts unique trap reasons for a history MCQ", () => {
    const options = ["1839", "1923", "1453", "1908"];
    const optionWhy = [
      "1839 doğrudur; ferman bu yılda okundu.",
      "1923 yanlıştır; tuzak: Cumhuriyet yılını karıştırmak.",
      "1453 yanlıştır; tuzak: İstanbul'un fethini karıştırmak.",
      "1908 yanlıştır; tuzak: II. Meşrutiyet yılını karıştırmak.",
    ];
    expect(optionWhyQualityIssues(optionWhy, options)).toEqual([]);
  });
});

describe("Q2: explanation must match correct numeric result", () => {
  it("rejects ungrounded chemistry 24 g claim; wrong result is not left as published", () => {
    expect(quantityClaimGrounded("1,5 × 32 = 24", CHEM_SOURCE)).toBe(false);
    expect(quantityClaimGrounded("1,5 × 32 = 48", CHEM_SOURCE)).toBe(true);
    const checked = verifyChoiceQuestion(
      choice({
        text: "1,5 mol O2 kaç gramdır? M = 32 g/mol.",
        options: ["24 g", "48 g", "32 g", "16 g"],
        correct: ["48 g"],
        explanation: "1,5 × 32 = 24 g",
        misconceptionTag: "çarpan",
        needsSolver: false,
      }),
      CHEM_SOURCE,
    );
    // settleExplanation either drops the question or repairs 24 → 48.
    if (checked.status === "keep") {
      expect(checked.question.explanation ?? "").not.toMatch(/=\s*24/);
      expect(checked.question.explanation ?? "").toMatch(/48/);
    } else {
      expect(checked.status).toBe("drop");
    }
  });

  it("keeps biology 16 hücre and drops 12 hücre mismatch", () => {
    const ok = verifyChoiceQuestion(
      choice({
        text: "2 hücre 3 kez mitozla bölünürse kaç hücre oluşur?",
        options: ["8 hücre", "16 hücre", "12 hücre", "6 hücre"],
        correct: ["16 hücre"],
        explanation: "2 hücre 3 kez bölünürse 16 hücre oluşur.",
        misconceptionTag: "üs",
        needsSolver: false,
      }),
      BIO_SOURCE,
    );
    expect(ok.status).toBe("keep");
    expect(ok.question.explanation ?? "").toMatch(/16 hücre/);

    const bad = verifyChoiceQuestion(
      choice({
        text: "2 hücre 3 kez mitozla bölünürse kaç hücre oluşur?",
        options: ["8 hücre", "16 hücre", "12 hücre", "6 hücre"],
        correct: ["16 hücre"],
        explanation: "2 hücre 3 kez bölünürse 12 hücre oluşur.",
        misconceptionTag: "üs",
        needsSolver: false,
      }),
      BIO_SOURCE,
    );
    expect(bad.status).toBe("drop");
  });
});

describe("stoich equal limiting via repairLimiting", () => {
  it("keeps equal-ratio limiting when options already name neither-limits", () => {
    const options = ["Al", "Cl₂", "İkisi de tamamen tükenir"];
    const checked = verifyChoiceQuestion(
      choice({
        text: "2 mol Al ve 3 mol Cl₂ kullanılarak AlCl₃ oluşturulmaktadır. Tepkime 2Al + 3Cl₂ → 2AlCl₃. Sınırlayıcı bileşen hangisidir?",
        options,
        correct: ["İkisi de tamamen tükenir"],
        explanation:
          "2 mol Al / 2 = 1 ve 3 mol Cl₂ / 3 = 1; oranlar eşit olduğundan ikisi de tamamen tükenir.",
        misconceptionTag: "oran",
        needsSolver: false,
      }),
    );
    expect(checked.status).not.toBe("drop");
    expect(checked.question.correct[0]).toMatch(/tükenir/);
    expect(checked.question.options.join(" ")).not.toMatch(/AlCl₃|H₂/);
  });
});

describe("multi: sameOptionSet and missed selections", () => {
  it("scores full multi match and flags conceptually missed options", () => {
    const correct = ["hata", "hile", "ikrah"];
    expect(sameOptionSet(selectedOptions(["hata", "hile", "ikrah"]), correct)).toBe(true);
    expect(sameOptionSet(selectedOptions(["hata", "hile"]), correct)).toBe(false);
    const selected = selectedOptions(["hata", "hile"]);
    const missed = correct.filter((item) => !selected.includes(item));
    expect(missed).toEqual(["ikrah"]);
  });
});
