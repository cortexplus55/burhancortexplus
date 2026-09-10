import { describe, expect, it } from "vitest";
import {
  extractMisconceptions,
  parseSessionMeta,
  scoreFlashcardsV2,
  teachingActivityForKind,
  teachingSessionContext,
  teachingStandardConstraints,
  validateFlashcardPedagogy,
  brokenSuperscript,
  validateLessonPedagogy,
  validateOralPedagogy,
  validatePodcastPedagogy,
  validateQuizPedagogy,
  validateTrueFalsePedagogy,
} from "@/lib/learning/teaching-standards";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";

describe("teaching standards contract", () => {
  it("maps node kinds to activities", () => {
    expect(teachingActivityForKind("qa")).toBe("intro_qa");
    expect(teachingActivityForKind("spaced")).toBe("flashcards");
    expect(teachingActivityForKind("written_exam")).toBe("written");
    expect(teachingActivityForKind("quiz")).toBe("quiz");
  });

  it("builds session context from Stage 4 meta", () => {
    const meta = parseSessionMeta({
      topicTitle: "Trigonometri",
      objective: "Birim çemberi öğren",
      sourcePages: [3, 4],
      role: "learn",
      durationMinutes: 25,
    });
    const ctx = teachingSessionContext(meta, "Yedek");
    expect(ctx).toContain("Trigonometri");
    expect(ctx).toContain("Birim çemberi öğren");
    expect(ctx).toContain("3, 4");
    expect(teachingStandardConstraints("lesson")).toContain("yaygın hata");
  });

  it("validates lesson v2 structure", () => {
    const good = {
      title: "Birim çember",
      objective: "Birim çember üzerinde açıları okuyabilmek",
      overview: "Birim çember, merkezi orijinde olan ve yarıçapı 1 olan çemberdir.",
      sections: [
        { heading: "Açıklama", body: "Açı ölçüsü yay uzunluğu ile ilişkilidir ve derece veya radyan ile ifade edilir." },
        { heading: "Adımlar", body: "Önce açı yönünü belirle, sonra kesişim noktasının koordinatlarını oku." },
        { heading: "Kapanış", body: "Koordinatları (cos θ, sin θ) olarak hatırla ve sonraki alıştırmaya geç." },
      ],
      example: { prompt: "90° noktası neresi?", solution: "Nokta (0, 1) olur." },
      commonMistake: {
        claim: "sin ve cos yer değiştirir",
        correction: "x = cos θ, y = sin θ",
      },
      infoCheck: { prompt: "0° noktası neresidir?", answer: "(1, 0)" },
      summary: ["Yarıçap 1", "x=cos, y=sin"],
      nextFocus: ["Özel açılar"],
    };
    expect(validateLessonPedagogy(good)).toEqual([]);
    expect(validateLessonPedagogy({ title: "x" }).length).toBeGreaterThan(0);

    // Bölüm kontrolü isteğe bağlı; varsa cevabı seçenekler içinde olmalı ve
    // şıklar birbirinden farklı, dolgu olmayan gerçek çeldiriciler olmalı.
    const withCheck = (check: unknown) => ({
      ...good,
      sections: [{ ...good.sections[0], check }, ...good.sections.slice(1)],
    });

    expect(
      validateLessonPedagogy(
        withCheck({
          type: "mcq",
          prompt: "Birim çemberde x koordinatı neye karşılık gelir?",
          options: ["cos θ", "sin θ", "tan θ"],
          answerIndex: 0,
          explanation: "Metinde x = cos θ olduğu belirtildi.",
        }),
      ),
    ).toEqual([]);

    expect(
      validateLessonPedagogy(
        withCheck({
          type: "mcq",
          prompt: "Birim çemberde x koordinatı neye karşılık gelir?",
          options: ["cos θ", "hiçbiri"],
          answerIndex: 0,
          explanation: "Metinde x = cos θ olduğu belirtildi.",
        }),
      ).length,
    ).toBeGreaterThan(0);

    expect(
      validateLessonPedagogy(
        withCheck({
          type: "trueFalse",
          prompt: "x = sin θ mıdır?",
          options: ["Doğru", "Yanlış", "Belki"],
          answerIndex: 1,
          explanation: "x = cos θ olduğu için yanlış.",
        }),
      ).length,
    ).toBeGreaterThan(0);
  });

  it("rejects an exponent split between superscript and baseline", () => {
    // Canlıda üretilen bir derste "2³+⁴" geçti: model 2⁽³⁺⁴⁾ demek isteyip
    // üssün ortasında normal satıra düşmüş, ekranda anlam tersine dönüyor.
    expect(brokenSuperscript("2³+⁴ = 2⁷")).toBe(true);
    // Meşru olanlar bayraklanmamalı: tamamı üst simge olan üs, iki kuvvetin
    // toplamı, ve düz metin.
    expect(brokenSuperscript("aⁿ⁻¹ terimi")).toBe(false);
    expect(brokenSuperscript("2³ + 2⁴ toplamı")).toBe(false);
    expect(brokenSuperscript("2⁷ = 128")).toBe(false);
    expect(brokenSuperscript("Taban 3, üs 4")).toBe(false);
  });

  it("rejects quiz pedagogy failures", () => {
    const bad: QuizQuestion[] = [
      {
        text: "2+2?",
        options: ["4", "Hepsi doğrudur", "4", "3"],
        correct: ["4"],
        multi: true,
        explanation: "kısa",
      },
    ];
    const issues = validateQuizPedagogy(bad, { requireObjective: true });
    expect(issues.some((i) => i.includes("multi"))).toBe(true);
    expect(issues.some((i) => i.includes("hepsi") || i.includes("tekrar") || i.includes("learningObjective"))).toBe(true);

    const good: QuizQuestion[] = [
      {
        text: "Birim çemberde 90° noktasının koordinatı nedir?",
        options: ["(0, 1)", "(1, 0)", "(0, -1)", "(-1, 0)"],
        correct: ["(0, 1)"],
        multi: false,
        explanation: "90° yukarıda olduğu için x=0 ve y=1 olur.",
        learningObjective: "90° özel açısını okumak",
      },
    ];
    expect(validateQuizPedagogy(good, { requireObjective: true })).toEqual([]);
    expect(
      validateQuizPedagogy(
        [{ ...good[0], learningObjective: undefined }],
        { requireObjective: true },
      ).some((i) => i.includes("learningObjective")),
    ).toBe(true);
  });

  it("flags vague true/false and missing correction", () => {
    expect(
      validateTrueFalsePedagogy([
        {
          text: "Her zaman doğrudur.",
          correct: true,
          explanation: "Bu belirsiz bir genelleme örneğidir.",
        },
      ]).length,
    ).toBeGreaterThan(0);
    expect(
      validateTrueFalsePedagogy([
        {
          text: "180° bir tam açıdır.",
          correct: false,
          explanation: "Tam açı 360° ölçüsündedir.",
          correctedStatement: "360° bir tam açıdır.",
        },
      ]),
    ).toEqual([]);
  });

  it("rejects flashcards that leak the answer", () => {
    const issues = validateFlashcardPedagogy([
      { front: "sin 30° = 1/2", back: "1/2", difficulty: "easy" },
      { front: "cos 0°?", back: "1", difficulty: "medium" },
      { front: "tan 45°?", back: "1", difficulty: "hard" },
      { front: "Birim çember yarıçapı?", back: "1", difficulty: "easy" },
    ]);
    expect(issues.some((i) => i.includes("sızdır") || i.includes("Zor"))).toBe(true);

    expect(
      validateFlashcardPedagogy([
        { front: "sin 30° değeri nedir?", back: "1/2", difficulty: "hard" },
        { front: "cos 0°?", back: "1", difficulty: "medium" },
        { front: "tan 45°?", back: "1", difficulty: "easy" },
        { front: "Birim çember yarıçapı?", back: "1", difficulty: "easy" },
      ]),
    ).toEqual([]);
  });

  it("scores flashcards as participation not mastery", () => {
    const scored = scoreFlashcardsV2(4, { "0": true, "1": true, "2": false, "3": true });
    expect(scored).toMatchObject({ score: 1, total: 1, knownCount: 3, masteryClaim: false });
  });

  it("validates podcast phase structure and short lines", () => {
    const ok = validatePodcastPedagogy({
      title: "Birim çember",
      chapters: [
        { title: "Tanım", lines: [{ speaker: "ada", text: "Birim çemberin yarıçapı birdir." }] },
        { title: "Neden", lines: [{ speaker: "kerem", text: "Bu sayede cos ve sin doğrudan koordinat olur." }] },
        { title: "Örnek", lines: [{ speaker: "ada", text: "Doksan derecede nokta sıfır bir olur." }] },
        { title: "Yaygın hata", lines: [{ speaker: "kerem", text: "Sin ile cosu yer değiştirmek sık hatadır." }] },
        { title: "Özet", lines: [{ speaker: "ada", text: "x kosinüs, y sinüstür." }] },
      ],
    });
    expect(ok).toEqual([]);
  });

  it("requires oral rubrics under v2", () => {
    expect(
      validateOralPedagogy([{ prompt: "Birim çemberi anlat." }]).some((i) =>
        i.includes("rubric"),
      ),
    ).toBe(true);
    expect(
      validateOralPedagogy([
        {
          prompt: "Birim çemberi anlat.",
          rubricCriteria: ["Tanım", "Koordinat"],
          expectedPoints: ["yarıçap 1", "x=cos"],
        },
      ]),
    ).toEqual([]);
  });

  it("extracts misconceptions from wrong quiz/tf answers", () => {
    const drafts = extractMisconceptions({
      kind: "quiz",
      topicLabel: "Trig",
      answers: { "0": "(1, 0)" },
      payload: {
        type: "quiz",
        questions: [
          {
            text: "90° noktası?",
            options: ["(0, 1)", "(1, 0)"],
            correct: ["(0, 1)"],
            multi: false,
            misconceptionTag: "cos_sin_swap",
          },
        ],
      },
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0].wrongType).toBe("cos_sin_swap");
  });
});
