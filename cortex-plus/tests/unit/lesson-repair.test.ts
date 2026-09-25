import { describe, expect, it, vi } from "vitest";
import { layoutBoard } from "@/lib/learning/lesson-board";
import { summaryLineProblem } from "@/lib/learning/lesson-grounding";
import {
  auditLearnerLesson,
  contradictorySentences,
  exampleIsComplete,
  repairLearnerLesson,
  stemLacksSubject,
  vacuousSentence,
} from "@/lib/learning/lesson-repair";
import { reviewQuestionFor } from "@/lib/learning/teacher-brain";
import type { LessonV2 } from "@/lib/learning/teaching-standards";

const SOURCE = [
  "İki faz bölgesinde doymuş sıvı ve doymuş buhar birlikte dengede bulunur.",
  "Bu bölgeye ıslak buhar denir.",
  "Üçlü noktada katı, sıvı ve buhar fazları dengededir.",
  "Kalite x = m_buhar / m_toplam bağıntısıyla yazılır ve 0 ≤ x ≤ 1 aralığındadır.",
  "Bir kapta m_buhar = 2 kg ve m_toplam = 4 kg ise x = 2/4 = 0,5 olur.",
  "İki faz bölgesinde basınç ve sıcaklık birbirine bağımlıdır.",
  "Sabit basınçta sıvı ısıtıldığında özgül hacim önce az değişir.",
  "Diyagramlar tablo seçimini ve proses yönünü görselleştirir.",
].join(" ");

const TOPIC = "P-v ve T-v Diyagramları";

function badLesson(): LessonV2 {
  return {
    title: TOPIC,
    overview: "P-v ve T-v diyagramı doymuş sıvı ile doymuş buhar eğrilerini birlikte gösterir.",
    sections: [
      {
        heading: "İki faz bölgesi",
        body: "Sıvı ve buhar birlikte dengede olamaz. Üçlü noktada katı, sıvı ve buhar fazları dengededir.",
        check: {
          type: "mcq",
          prompt: "T-v diyagramında bağımsız iki özellik değildir. Aşağıdakilerden hangisi doğrudur?",
          options: ["Basınç ve sıcaklık birbirine bağımlıdır.", "Basınç ve sıcaklık bağımsızdır."],
          answerIndex: 0,
          explanation: "İki faz bölgesinde basınç ve sıcaklık birbirine bağımlıdır.",
        },
      },
      {
        heading: "Hesaplama",
        body: "Kalite, doymuş buharın toplam kütleye oranıdır. Veri: m_buhar = 2 kg Adım 1: Kalite hesaplama Adım 2: Sonucu hesapla. Sonuç, iki faz arasında belirgin bir yön gösterir. Aralık 0 < x < 1.",
      },
    ],
    summary: [
      "P-v ve T-v Diyagramlarını kullanarak kalite hesaplamalarını gerçekleştirme.",
      "P-v, T-v Diyagramları - Kritik ve Üçlü Nokta",
      "iki faz bölgesi",
    ],
  };
}

const patch = {
  sections: [
    {
      index: 0,
      body: "İki faz bölgesinde doymuş sıvı ve doymuş buhar birlikte dengede bulunur. Üçlü noktada katı, sıvı ve buhar fazları dengededir.",
      check: {
        type: "mcq",
        prompt: "İki faz bölgesinde basınç ve sıcaklık birbirine bağımlı mıdır?",
        options: ["Basınç ve sıcaklık birbirine bağımlıdır.", "Basınç ve sıcaklık bağımsızdır."],
        answerIndex: 0,
        explanation: "İki faz bölgesinde basınç ve sıcaklık birbirine bağımlıdır.",
      },
    },
    {
      index: 1,
      body: "Kalite, doymuş buharın toplam kütleye oranıdır ve 0 ≤ x ≤ 1 aralığında okunur.",
      check: {
        type: "trueFalse",
        prompt: "Doymuş sıvı ile doymuş buhar iki faz bölgesinde birlikte dengede bulunur.",
        options: ["Doğru", "Yanlış"],
        answerIndex: 0,
        explanation: "Islak buhar bölgesinde doymuş sıvı ve doymuş buhar birlikte dengede bulunur.",
      },
    },
  ],
  addedSections: [
    {
      heading: "Üçlü nokta",
      body: "Üçlü noktada katı, sıvı ve buhar fazları dengededir ve üç faz bir arada durur.",
      check: {
        type: "mcq",
        prompt: "Üçlü noktada katı, sıvı ve buhar bir arada dengede midir?",
        options: ["Üç faz bir arada dengededir.", "Yalnızca buhar bulunur."],
        answerIndex: 0,
        explanation: "Üçlü noktada katı, sıvı ve buhar fazları dengededir.",
      },
    },
  ],
  example: {
    prompt: "Bir kapta buhar kütlesi 2 kg ve toplam kütle 4 kg ise kalite kaçtır?",
    solution: "Veri: m_buhar = 2 kg ve m_toplam = 4 kg. Adım 1: x = 2/4 yazılır. Adım 2: x = 0,5 olur.",
  },
  summary: [
    "İki faz bölgesinde doymuş sıvı ve doymuş buhar birlikte dengede bulunur.",
    "Kalite, doymuş buhar kütlesinin toplam kütleye oranıdır ve 0 ≤ x ≤ 1 aralığındadır.",
    "Üçlü noktada katı, sıvı ve buhar fazları dengededir.",
    "İki faz bölgesinde basınç ve sıcaklık birbirine bağımlıdır.",
  ],
  diagram: {
    caption: "P-v diyagramındaki eğriler",
    shapes: [
      { kind: "line", x1: 40, y1: 160, x2: 150, y2: 40 },
      { kind: "line", x1: 150, y1: 40, x2: 280, y2: 160 },
      { kind: "text", x: 70, y: 120, text: "Sıvı eğrisi" },
      { kind: "text", x: 190, y: 120, text: "Buhar eğrisi" },
    ],
  },
};

describe("lesson part repair", () => {
  it("flags the live claim that liquid and vapor cannot coexist", () => {
    const hit = contradictorySentences(
      "Sıvı ve buhar birlikte dengede olamaz.",
      "İki faz bölgesinde doymuş sıvı ve doymuş buhar birlikte dengede bulunur.",
    );
    expect(hit).toHaveLength(1);
    expect(
      contradictorySentences(
        "İki faz bölgesinde basınç ve sıcaklık bağımsız değildir.",
        SOURCE,
      ),
    ).toEqual([]);
  });

  it("rejects a subjectless stem, a vacuous sentence, and a placeholder example", () => {
    expect(
      stemLacksSubject("T-v diyagramında bağımsız iki özellik değildir. Aşağıdakilerden hangisi doğrudur?"),
    ).toBe(true);
    expect(stemLacksSubject("İki faz bölgesinde basınç ve sıcaklık bağımsız değildir.")).toBe(false);
    expect(vacuousSentence("Sonuç, iki faz arasında belirgin bir yön gösterir.")).toBe(true);
    expect(exampleIsComplete("Veri: m_buhar = 2 kg Adım 1: Kalite hesaplama Adım 2: Sonucu hesapla")).toBe(
      false,
    );
    expect(exampleIsComplete("Veri: m_buhar = 2 kg ve m_toplam = 4 kg. x = 2/4 = 0,5 olur.")).toBe(true);
    expect(summaryLineProblem("kalite hesaplamalarını gerçekleştirme.")).toBe("objective");
    expect(summaryLineProblem("P-v, T-v Diyagramları - Kritik ve Üçlü Nokta")).toBe("heading");
    expect(summaryLineProblem("iki faz bölgesi")).toBe("fragment");
    expect(summaryLineProblem("0 ≤ x ≤ 1")).toBeNull();
  });

  it("splits a glued worked example into Veri and Adım lines", () => {
    const lines = layoutBoard(
      "x = m_buhar / m_toplam Veri: m_buhar = 2 kg Adım 1: Kalite hesaplama Adım 2: Sonucu hesapla",
    );
    expect(lines.some((line) => line.text.startsWith("Veri:"))).toBe(true);
    expect(lines.some((line) => /^Adım\s*1/i.test(line.text))).toBe(true);
    expect(lines.some((line) => /^Adım\s*2/i.test(line.text))).toBe(true);
  });

  it("rephrases a missed multiple-choice stem and moves the options", () => {
    const retry = reviewQuestionFor({
      type: "mcq",
      prompt: "Sınırından kütle geçen düzeneğe ne denir?",
      options: ["Kapalı sistem", "Açık sistem", "Yalıtılmış sistem"],
      answerIndex: 1,
      explanation: "Kütle geçişi olan düzenek açık sistemdir.",
    });
    expect(retry.prompt).toBe("Kütle geçişi olan düzenek hangisi?");
    expect(retry.options[retry.answerIndex]).toBe("Açık sistem");
    expect(retry.options).not.toEqual(["Kapalı sistem", "Açık sistem", "Yalıtılmış sistem"]);
  });

  it("does not call the model when the lesson already passes", async () => {
    const complete = vi.fn(async () => patch);
    const sound: LessonV2 = {
      title: "Basınç",
      overview: "Basınç, yüzeye uygulanan kuvvetin alana oranıdır ve paskal ile ölçülür.",
      sections: [
        {
          heading: "Tanım",
          body: "Basınç, yüzeye uygulanan kuvvetin alana oranıdır ve P = F/A ile yazılır.",
          check: {
            type: "trueFalse",
            prompt: "Basınç, kuvvetin alana bölümüdür.",
            options: ["Doğru", "Yanlış"],
            answerIndex: 0,
            explanation: "Basınç, yüzeye uygulanan kuvvetin alana oranıdır.",
          },
        },
        {
          heading: "Birim",
          body: "Basıncın birimi paskaldır ve gösterge basıncına atmosfer eklenince mutlak basınç bulunur.",
          check: {
            type: "mcq",
            prompt: "Mutlak basınç gösterge basıncına ne eklenerek bulunur?",
            options: ["Atmosfer basıncı", "Sıcaklık", "Hacim"],
            answerIndex: 0,
            explanation: "Mutlak basınç, gösterge basıncına atmosfer basıncı eklenerek bulunur.",
          },
        },
        {
          heading: "Sıcaklık",
          body: "Sıcaklık farkında bir kelvin, bir santigrat dereceye eşittir ve ölçek ayrı okunur.",
          check: {
            type: "trueFalse",
            prompt: "Bir kelvinlik fark bir santigrat derecelik farka eşittir.",
            options: ["Doğru", "Yanlış"],
            answerIndex: 0,
            explanation: "Sıcaklık farkında bir kelvin, bir santigrat dereceye eşittir.",
          },
        },
      ],
      summary: [
        "Basınç, yüzeye uygulanan kuvvetin alana oranıdır.",
        "Mutlak basınç, gösterge basıncına atmosfer basıncı eklenerek bulunur.",
        "Sıcaklık farkında bir kelvin, bir santigrat dereceye eşittir.",
      ],
    };
    const result = await repairLearnerLesson(sound, { source: sound.overview ?? "", topicLabel: "Basınç" }, complete);
    expect(result.requested).toEqual([]);
    expect(complete).not.toHaveBeenCalled();
  });

  it("repairs the P-v lesson with one patch and drops the contradiction if the patch fails", async () => {
    const complete = vi.fn(async () => patch);
    const fixed = await repairLearnerLesson(badLesson(), { source: SOURCE, topicLabel: TOPIC }, complete);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(fixed.lesson)).not.toMatch(/olamaz/);
    expect(JSON.stringify(fixed.lesson)).not.toMatch(/Sonucu hesapla/);
    expect(JSON.stringify(fixed.lesson)).not.toMatch(/belirgin bir yön/);
    expect(JSON.stringify(fixed.lesson)).not.toMatch(/0\s*<\s*x\s*<\s*1/);
    expect(fixed.lesson.sections.filter((section) => section.check).length).toBeGreaterThanOrEqual(3);
    expect(fixed.lesson.example?.solution).toMatch(/0,5/);
    expect(fixed.lesson.summary?.length).toBeGreaterThanOrEqual(3);
    expect(fixed.succeeded).toContain("source_contradiction");
    expect(auditLearnerLesson(fixed.lesson, { source: SOURCE, topicLabel: TOPIC }).map((issue) => issue.code)).not.toContain(
      "source_contradiction",
    );

    const dropped = await repairLearnerLesson(badLesson(), { source: SOURCE, topicLabel: TOPIC }, async () => {
      throw new Error("upstream");
    });
    expect(JSON.stringify(dropped.lesson)).not.toMatch(/olamaz/);
    expect(JSON.stringify(dropped.lesson)).not.toMatch(/Sonucu hesapla/);
    expect(dropped.dropped).toContain("source_contradiction");
    expect(dropped.succeeded).not.toContain("source_contradiction");
  });

  it("aligns an exclusive quality bound without a model call", async () => {
    const complete = vi.fn(async () => null);
    const lesson = badLesson();
    lesson.sections[0].body = "İki faz bölgesinde doymuş sıvı ve doymuş buhar birlikte dengede bulunur.";
    lesson.sections[0].check = {
      type: "trueFalse",
      prompt: "Doymuş sıvı ile doymuş buhar iki faz bölgesinde birlikte dengede bulunur.",
      options: ["Doğru", "Yanlış"],
      answerIndex: 0,
      explanation: "Islak buhar bölgesinde doymuş sıvı ve doymuş buhar birlikte dengede bulunur.",
    };
    lesson.sections[1].body = "Kalite 0 < x < 1 aralığında okunur ve doymuş buharın toplam kütleye oranıdır.";
    lesson.sections[1].check = {
      type: "trueFalse",
      prompt: "Kalite, doymuş buhar kütlesinin toplam kütleye oranıdır.",
      options: ["Doğru", "Yanlış"],
      answerIndex: 0,
      explanation: "Kalite x = m_buhar / m_toplam bağıntısıyla yazılır ve 0 ≤ x ≤ 1 aralığındadır.",
    };
    lesson.sections.push({
      heading: "Bağımlılık",
      body: "İki faz bölgesinde basınç ve sıcaklık birbirine bağımlıdır ve ikisi ayrı seçilmez.",
      check: {
        type: "mcq",
        prompt: "İki faz bölgesinde basınç ve sıcaklık birbirine bağımlı mıdır?",
        options: ["Evet, birbirine bağımlıdır.", "Hayır, tamamen bağımsızdır."],
        answerIndex: 0,
        explanation: "İki faz bölgesinde basınç ve sıcaklık birbirine bağımlıdır.",
      },
    });
    lesson.summary = [
      "İki faz bölgesinde doymuş sıvı ve doymuş buhar birlikte dengede bulunur.",
      "Kalite 0 < x < 1 aralığında okunur.",
      "İki faz bölgesinde basınç ve sıcaklık birbirine bağımlıdır.",
    ];
    lesson.sections[1].diagram = {
      caption: "P-v diyagramındaki eğriler",
      shapes: [
        { kind: "line", x1: 40, y1: 160, x2: 150, y2: 40 },
        { kind: "line", x1: 150, y1: 40, x2: 280, y2: 160 },
        { kind: "text", x: 70, y: 120, text: "Sıvı eğrisi" },
        { kind: "text", x: 190, y: 120, text: "Buhar eğrisi" },
      ],
    };
    const result = await repairLearnerLesson(lesson, { source: SOURCE, topicLabel: TOPIC }, complete);
    expect(complete).not.toHaveBeenCalled();
    expect(JSON.stringify(result.lesson)).toMatch(/0 ≤ x ≤ 1/);
    expect(JSON.stringify(result.lesson)).not.toMatch(/0\s*<\s*x\s*<\s*1/);
  });
});
