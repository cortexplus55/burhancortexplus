import { describe, expect, it, vi } from "vitest";
import { summaryLineProblem } from "@/lib/learning/lesson-grounding";
import { missingFormulaCoverage } from "@/lib/learning/lesson-claims";
import {
  auditLearnerLesson,
  isIncompleteExample,
  repairLearnerLesson,
} from "@/lib/learning/lesson-repair";
import type { LessonV2 } from "@/lib/learning/teaching-standards";

/**
 * Canlı ders: "İdeal Gazlarda Enerji Değişimi".
 * Tek soru, beş bozuk özet satırı ve sayı konulmamış ikinci örnek.
 */

const BAD_SUMMARY = [
  "İdeal gazlar, sıcaklık ve basınç gibi parametrelerle belirlenen sistemlerdir.",
  "Kapalı sistem: İdeal gaz enerji: Δu=c v ΔT, Δh=c p ΔT",
  "İç Enerji, Entalpi ve Özgül Isılar",
  "u ve h değişimlerini sıcaklıkla bağlayan temel malzeme bağıntılarını öğren: H = U + PV, özgül olarak h = u + Pv",
  "Entalpi özellikle akışlı sistemlerde doğal biçimde ortaya çıkar çünkü",
];

const TEACHER_ONLY =
  "Akış işi entalpiyi açık sistemde doğal biçimde ortaya çıkarır.";

const INCOMPLETE =
  "Örnek: 1 kg hava, 300 K’den 400 K’ye ısıtıldığında, W hesaplanarak ve Q = ΔU + W denklemi ile toplam ısı miktarı bulunur.";

const BODY = [
  "İdeal gazda sabit hacimde iç enerji değişimi ΔU = m c_v ΔT bağıntısıyla hesaplanır.",
  "Sabit basınçta entalpi değişimi ΔH = m c_p ΔT bağıntısıyla hesaplanır.",
  "Özgül entalpi h = u + Pv bağıntısıyla yazılır.",
  "Sınır işi W = P(V₂ − V₁) bağıntısıyla bulunur.",
  "Birinci yasa Q = ΔU + W şeklinde yazılır.",
].join(" ");

const SOURCE = [
  "İdeal gazlarda enerji değişimi sıcaklıkla yazılır.",
  BODY,
  "Özgül ısılar arasındaki fark c_p − c_v = R bağıntısına eşittir ve k = c_p / c_v olarak yazılır.",
  "c_v = 0.718 kJ/kg·K.",
  "2 kg hava 300 K sıcaklıktan 450 K sıcaklığa ısıtılır ve ΔU = 215.4 kJ olur.",
  "400 K için de aynı sabit kullanılır.",
  TEACHER_ONLY,
  ...BAD_SUMMARY,
].join("\n");

const TOPIC = "İdeal Gazlarda Enerji Değişimi";

function idealGasLesson(): LessonV2 {
  return {
    title: TOPIC,
    overview: "İdeal gazda sabit hacimde iç enerji değişimi ΔU = m c_v ΔT bağıntısıyla hesaplanır.",
    sections: [
      {
        heading: "İç enerji",
        body: `${BODY} ${INCOMPLETE}`,
        check: {
          type: "mcq",
          prompt: "İdeal gazda iç enerji değişimi ΔU nasıl hesaplanır?",
          options: ["ΔU = m c_v ΔT", "ΔU = m c_p ΔT", "ΔU = mRT", "ΔU = PV"],
          answerIndex: 0,
          explanation: "Sabit hacimde iç enerji değişimi ΔU = m c_v ΔT bağıntısıyla hesaplanır.",
        },
      },
    ],
    example: {
      prompt: "2 kg hava 300 K sıcaklıktan 450 K sıcaklığa sabit hacimde ısıtılıyor. İç enerji değişimi nedir?",
      solution: "ΔU = 2 × 0.718 × (450 − 300) = 215.4 kJ",
    },
    commonMistake: {
      claim: "İç enerji hem sıcaklığa hem hacme her zaman bağlıdır.",
      correction: "İdeal gazda iç enerji değişimi sıcaklığa bağlıdır ve ΔU = m c_v ΔT bağıntısıyla yazılır.",
    },
    summary: BAD_SUMMARY,
  };
}

describe("ideal gaz dersinin yayın kapıları", () => {
  it("rejects the five live summary bullets and keeps a real formula line", () => {
    expect(summaryLineProblem(BAD_SUMMARY[0])).toBe("vague");
    expect(summaryLineProblem(BAD_SUMMARY[1])).toBe("heading");
    expect(summaryLineProblem(BAD_SUMMARY[2])).toBe("heading");
    expect(summaryLineProblem(BAD_SUMMARY[3])).toBe("objective");
    expect(summaryLineProblem(BAD_SUMMARY[4])).toBe("truncated");
    expect(summaryLineProblem("P_mutlak = P_atm - P_vakum")).toBeNull();
    expect(summaryLineProblem("Mutlak basınç, gösterge basıncına atmosfer eklenince bulunur: P = F/A.")).toBeNull();
    expect(summaryLineProblem("0 ≤ x ≤ 1")).toBeNull();
    expect(isIncompleteExample(INCOMPLETE)).toBe(true);
    expect(isIncompleteExample("ΔU = 2 × 0.718 × (450 − 300) = 215.4 kJ")).toBe(false);
  });

  it("does not publish one question, the junk summary, or the unfinished example", async () => {
    const verify = vi.fn(async () => ({ bad: [] }));
    const complete = vi.fn(async () => ({}));
    const result = await repairLearnerLesson(
      idealGasLesson(),
      { source: SOURCE, topicLabel: TOPIC },
      complete,
      verify,
    );
    expect(verify).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledTimes(1);
    const lesson = result.lesson;
    expect(lesson.sections.filter((section) => section.check).length).toBeGreaterThanOrEqual(3);
    const summary = lesson.summary ?? [];
    expect(summary.length).toBeGreaterThanOrEqual(3);
    expect(summary.length).toBeLessThanOrEqual(5);
    const published = JSON.stringify(lesson);
    for (const bullet of BAD_SUMMARY) {
      expect(published).not.toContain(bullet);
    }
    expect(published).not.toContain(TEACHER_ONLY);
    expect(published).not.toContain("1 kg hava");
    expect(published).not.toContain("hesaplanarak");
    expect(published).not.toMatch(/\böğren\b/i);
    expect(published).toMatch(/2\s*[×x]\s*0[.,]718/);
    expect(published).toContain("215.4");
    expect(published).toMatch(/c_v = 0[.,]718 kJ\/kg·K/);
    expect(published).toMatch(/c_p\s*[−-]\s*c_v\s*=\s*R/);
    expect(published).toMatch(/k\s*=\s*c_p\s*\/\s*c_v/);
    expect(lesson.commonMistake?.correction).toMatch(/ΔU = m c_v ΔT/);
    expect(summary.every((line) => /[.!?]$/.test(line) || /[=≤≥]/.test(line))).toBe(true);
    expect(auditLearnerLesson(lesson, { source: SOURCE, topicLabel: TOPIC }).map((issue) => issue.code)).not.toContain(
      "check_count",
    );
  });

  it("asks for the two heat relations only when the source contains them", () => {
    const lesson = "İdeal gazda ΔU = m c_v ΔT yazılır.";
    const withRelations = `${lesson} c_p − c_v = R ve k = c_p / c_v.`;
    expect(missingFormulaCoverage(lesson, SOURCE)).toEqual(
      expect.arrayContaining(["c_p − c_v = R", "k = c_p/c_v"]),
    );
    expect(missingFormulaCoverage(withRelations, SOURCE)).toEqual([]);
    expect(missingFormulaCoverage(lesson, "Basınç P = F/A ile tanımlanır.")).toEqual([]);
  });
});
