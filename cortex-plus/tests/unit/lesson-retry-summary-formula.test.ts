import { describe, expect, it } from "vitest";
import { layoutBoard } from "@/lib/learning/lesson-board";
import { groundLearnerLesson, upcomingTopicsAfter } from "@/lib/learning/lesson-grounding";
import { reviewQuestionFor } from "@/lib/learning/teacher-brain";
import { lessonPublishIssues, validateLessonPedagogy } from "@/lib/learning/teaching-standards";

const LIVE_PROMPT = "Sıcaklık enerji birimidir, bu nedenle ısıl durumu gösterir. DOĞRU MU YANLIŞ?";
const TEMPERATURE_FACT = "Sıcaklık, bir sistemin ısıl durumunu gösteren bir özelliktir.";

const source = [
  "Basınç, yüzeye dik kuvvetin alana oranıdır. P = F/A.",
  "Basınç SI birimi Pascal (Pa) olarak tanımlanır. Genelde kPa veya MPa cinsinden ifade edilir.",
  "Mutlak basınç, atmosfer basıncına göre ölçülür: P_mutlak = P_atm + P_man.",
  "Vakum durumunda P_mutlak = P_atm - P_vakum.",
  TEMPERATURE_FACT,
].join(" ");

const thinPressure = "Basınç, kuvvet ve alan oranıdır.";
const thinAbsolute = "Mutlak basınç, manometrik basınç ile hesaplanır.";

describe("missed questions change angle", () => {
  it("turns the live temperature true/false into the source fact", () => {
    const retry = reviewQuestionFor(
      {
        type: "trueFalse",
        prompt: LIVE_PROMPT,
        options: ["Yanlış", "Doğru"],
        answerIndex: 0,
        explanation: "Sıcaklık enerji birimi değildir.",
      },
      "tr",
      source,
    );
    expect(retry.prompt).not.toBe(LIVE_PROMPT);
    expect(retry.prompt).toContain("ısıl durumunu gösteren bir özelliktir");
    expect(retry.prompt).toMatch(/Doğru mu, yanlış mı\?$/);
    expect(retry.prompt).not.toMatch(/\*\*/);
    expect(retry.prompt).not.toContain("enerji birimidir");
    expect(retry.options[retry.answerIndex]).toBe("Doğru");
    expect(retry.prompt).not.toContain("başka sözcüklerle");
  });

  it("keeps a stored rephrase ahead of the source sentence", () => {
    const retry = reviewQuestionFor(
      {
        type: "trueFalse",
        prompt: LIVE_PROMPT,
        options: ["Yanlış", "Doğru"],
        answerIndex: 0,
        explanation: "Sıcaklık enerji birimi değildir.",
        review: { prompt: "Sıcaklık ısıl durumu gösteren bir özellik midir?" },
      },
      "tr",
      source,
    );
    expect(retry.prompt).toBe("Sıcaklık ısıl durumu gösteren bir özellik midir?");
    expect(retry.options[retry.answerIndex]).toBe("Yanlış");
  });

  it("asks a fill-style multiple choice from the source sentence", () => {
    const retry = reviewQuestionFor(
      {
        type: "mcq",
        prompt: "Sıcaklığın birimi için hangisi yazılır?",
        options: ["Pascal", "Enerji", TEMPERATURE_FACT],
        answerIndex: 2,
        explanation: "Sıcaklık ısıl durumu gösterir.",
      },
      "tr",
      source,
    );
    expect(retry.type).toBe("trueFalse");
    expect(retry.prompt).toContain("ısıl durumunu gösteren bir özelliktir");
    expect(retry.prompt).not.toBe("Sıcaklığın birimi için hangisi yazılır?");
    expect(retry.options[retry.answerIndex]).toBe("Doğru");
  });
});

describe("summary keeps the full relation", () => {
  it("replaces the live thin lines and the invented next step", () => {
    const topics = [
      "Termodinamiğe Giriş",
      "Basınç ve Sıcaklık Kavramları",
      "Saf Maddenin Özellikleri",
      "Enerji Geçişi",
    ];
    expect(upcomingTopicsAfter("Basınç ve Sıcaklık Kavramları", topics)).toEqual([
      "Saf Maddenin Özellikleri",
      "Enerji Geçişi",
    ]);
    expect(upcomingTopicsAfter("Basınç ve Sıcaklık", topics)).toEqual([
      "Saf Maddenin Özellikleri",
      "Enerji Geçişi",
    ]);
    expect(upcomingTopicsAfter("Enerji Geçişi", topics)).toEqual([]);
    expect(upcomingTopicsAfter("Hidrostatik", topics)).toBeNull();

    const grounded = groundLearnerLesson(
      {
        title: "Basınç ve Sıcaklık Kavramları",
        sections: [{ heading: "Basınç", body: source }],
        summary: [thinPressure, thinAbsolute, "Sıcaklık, ısıl durumu gösteren bir özelliktir."],
        nextFocus: ["Basınç ve sıcaklık arasındaki ilişki.", "Hidrostatik basıncın hesaplanması."],
      },
      source,
      { upcomingTopics: upcomingTopicsAfter("Basınç ve Sıcaklık Kavramları", topics) ?? [] },
    );
    const lesson = grounded.lesson as { summary?: string[]; nextFocus?: string[] };
    const summary = lesson.summary?.join(" ") ?? "";
    expect(grounded.removed.join(" ")).toMatch(/summary:replaced/);
    expect(summary).not.toContain(thinPressure);
    expect(summary).not.toContain(thinAbsolute);
    expect(summary).toMatch(/yüzeye dik/);
    expect(summary).toContain("P = F/A");
    expect(summary).toContain("P_mutlak = P_atm + P_man");
    expect(summary).toContain("P_mutlak = P_atm - P_vakum");
    expect(summary).toContain("Sıcaklık, ısıl durumu gösteren bir özelliktir.");
    expect(lesson.nextFocus).toEqual(["Saf Maddenin Özellikleri", "Enerji Geçişi"]);

    const again = groundLearnerLesson(lesson, source, {
      upcomingTopics: ["Saf Maddenin Özellikleri", "Enerji Geçişi"],
    });
    expect(again.removed).toEqual([]);
  });
});

const LIVE_FORMULA_INDEX =
  "Bu sayfadaki formüller: Kalite tanımı | İki fazlı karışımda kalite, buhar kütle oranıdır: x = m g /m. 0 ile 1 arasındadır. x = 0 doymuş sıvı, x = 1 | Bir doymuş karışımda h f =500 kJ/kg, h fg =2200 kJ/kg ve x=0.80 ise h = 500 + 0.80×2200 =";

const QUALITY_BODY = [
  "[s.4] Doymuş Su Tabloları: İki fazlı karışımda kalite, buhar kütle oranıdır: x = m g / m.",
  "Kalite 0 ile 1 arasındadır; 0 ≤ x ≤ 1.",
  "x = 0 doymuş sıvı, x = 1 doymuş buhardır.",
  "Bir özellik y = y f + x * y fg şeklinde hesaplanabilir.",
  LIVE_FORMULA_INDEX,
].join("\n");

describe("summary ignores the formula index", () => {
  it("drops the live dump and the objective filler, then keeps clean relations", () => {
    const grounded = groundLearnerLesson(
      {
        title: "Doymuş Su Tabloları ve Kalite",
        sections: [{ heading: "Kalite", body: QUALITY_BODY }],
        summary: [LIVE_FORMULA_INDEX, "Doymuş Su Tabloları ve Kalite konusunu anlayarak uygulayabilmek."],
      },
      QUALITY_BODY,
    );
    const lesson = grounded.lesson as { summary?: string[] };
    const summary = lesson.summary ?? [];
    const text = summary.join(" ");
    expect(summary.length).toBeGreaterThanOrEqual(3);
    expect(summary.length).toBeLessThanOrEqual(5);
    expect(text).not.toContain("Bu sayfadaki formüller");
    expect(text).not.toContain("|");
    expect(text).not.toMatch(/[=+×]\s*$/);
    expect(text).not.toContain("anlayarak uygulayabilmek");
    expect(text).not.toContain("2200");
    expect(text).not.toMatch(/\bm g\b/);
    expect(text).not.toMatch(/\bh f\b/);
    expect(text).not.toMatch(/\bh fg\b/);
    expect(text).toContain("m_g/m");
    expect(text).toContain("0 ≤ x ≤ 1");
    expect(text).toMatch(/x = 0 doymuş sıvı/);
    expect(text).toMatch(/x = 1 doymuş buhar/);
    expect(text).toContain("y_f");
    expect(text).toContain("y_fg");
    expect(text).toContain("·");
    expect(text).not.toContain("*");

    const again = groundLearnerLesson(lesson, QUALITY_BODY);
    expect(again.removed).toEqual([]);
  });
});

describe("formula lines stay relations", () => {
  it("puts prose back, rejoins a wrapped sentence, and drops list marks", () => {
    const lines = layoutBoard(
      [
        "P = F/A. **Basınç** SI birimi Pascal (Pa) olarak tanımlanır",
        "genelde kPa veya MPa cinsinden ifade edilir.",
        "1 kPa = 1000 Pa",
        "1 MPa = 1000 kPa. Basınç hesaplamasında atmosfer basıncı ve manometre basıncının bilinmesi önemlidir.",
        "P_mutlak = P_atm + P_man;",
        "1. P_gaz = P_atm + (mg/A)",
        "= 95 + (50×9.81/0.010)/1000 = 144.1 kPa.",
        "2. P_mutlak = P_atm - P_vakum.",
      ].join("\n"),
    );
    const formulas = lines.filter((line) => line.kind === "formula").map((line) => line.text);
    const prose = lines.filter((line) => line.kind === "prose").map((line) => line.text).join(" ");
    expect(formulas).toContain("P = F/A");
    expect(formulas).toContain("1 kPa = 1000 Pa");
    expect(formulas).toContain("1 MPa = 1000 kPa");
    expect(formulas).toContain("P_mutlak = P_atm + P_man");
    expect(formulas.some((line) => line.includes("P_gaz") && line.includes("144.1"))).toBe(true);
    expect(formulas.some((line) => line.includes("P_vakum"))).toBe(true);
    expect(formulas.some((line) => line.includes(";"))).toBe(false);
    expect(formulas.some((line) => /Pascal|hesaplamasında|genelde/.test(line))).toBe(false);
    expect(formulas.some((line) => /^\d{1,2}[.)]/.test(line))).toBe(false);
    expect(prose).toMatch(/Pascal/);
    expect(prose).toMatch(/genelde kPa/);
    expect(prose).toMatch(/hesaplamasında/);
    expect(lines.some((line) => line.text.startsWith("1.") || line.text.startsWith("2."))).toBe(false);
  });

  it("moves the trailing phrase off the relation and prints a middot", () => {
    const lines = layoutBoard("y = y_f + x * y_fg şeklinde hesaplanabilir");
    const formulas = lines.filter((line) => line.kind === "formula").map((line) => line.text);
    const prose = lines.filter((line) => line.kind === "prose").map((line) => line.text);
    expect(formulas).toEqual(["y = y_f + x · y_fg"]);
    expect(prose).toEqual(["Şu şekilde hesaplanabilir:"]);

    const withSubject = layoutBoard("Özellik y = y_f + x * y_fg şeklinde hesaplanabilir");
    expect(withSubject.find((line) => line.kind === "formula")?.text).toBe("y = y_f + x · y_fg");
    expect(withSubject.find((line) => line.kind === "prose")?.text).toBe(
      "Özellik şu şekilde hesaplanabilir:",
    );
  });

  it("splits an inline numbered formula list", () => {
    const formulas = layoutBoard(
      "1. P = F/A 2. 1 kPa = 1000 Pa 3. P_mutlak = P_atm + P_man;",
    )
      .filter((line) => line.kind === "formula")
      .map((line) => line.text);
    expect(formulas).toEqual(["P = F/A", "1 kPa = 1000 Pa", "P_mutlak = P_atm + P_man"]);
  });
});

describe("true/false retry is one sentence", () => {
  const QUALITY_SOURCE = [
    "Doymuş karışım, hem sıvı hem de buhar fazlarının var olduğu bir durumu ifade eder.",
    "**Kalite** ise bu karışımda bulunduğu **buhar kütle oranı**dır ve 0 ile 1 arasında bir değere sahiptir.",
    "Kalite (x), doymuş karışımdaki buharın kütlesinin toplam kütleye oranıdır.",
  ].join(" ");

  it("asks the short source sentence without bold", () => {
    const retry = reviewQuestionFor(
      {
        type: "trueFalse",
        prompt: "Kalite sıvı kütle oranıdır. DOĞRU MU YANLIŞ?",
        options: ["Yanlış", "Doğru"],
        answerIndex: 0,
        explanation: "Kalite buhar oranıdır.",
      },
      "tr",
      QUALITY_SOURCE,
    );
    expect(retry.prompt).toBe(
      "Kalite (x), doymuş karışımdaki buharın kütlesinin toplam kütleye oranıdır. Doğru mu, yanlış mı?",
    );
    expect(retry.prompt).not.toMatch(/\*\*/);
    expect(retry.prompt).not.toContain("hem sıvı hem de");
    expect(retry.prompt).not.toContain("bulunduğu");
    expect(retry.prompt).not.toContain("DOĞRU MU YANLIŞ");
    expect(retry.options[retry.answerIndex]).toBe("Doğru");
  });
});

describe("lessons ask more than one check", () => {
  const section = (heading: string, check: boolean) => ({
    heading,
    body: `**${heading}** kaynakta ayrı bir kavram olarak durur ve sınavda sorulur.`,
    ...(check
      ? {
          check: {
            type: "trueFalse" as const,
            prompt: `${heading} kaynakta geçer. DOĞRU MU YANLIŞ?`,
            options: ["Doğru", "Yanlış"],
            answerIndex: 0,
            explanation: "Cümle bölüm metnindeki kavramı tekrar etmez, yönünü sorar.",
          },
        }
      : {}),
  });

  const lesson = (checks: boolean[]) => ({
    title: "Basınç ve sıcaklık",
    objective: "Üç kavramı birbirinden ayırt edebileceksin.",
    overview: "Basınç, mutlak basınç ve sıcaklık ayrı bağıntılardır.",
    sections: [
      section("Basınç", checks[0] ?? false),
      section("Mutlak basınç", checks[1] ?? false),
      section("Sıcaklık", checks[2] ?? false),
    ],
    summary: ["P = F/A", "P_mutlak = P_atm + P_man"],
    nextFocus: ["Saf madde"],
  });

  it("asks for three checks when the lesson has three concepts", () => {
    expect(validateLessonPedagogy(lesson([true, false, false])).join(" ")).toMatch(/3 kontrol sorusu/);
    expect(lessonPublishIssues(lesson([true, false, false])).join(" ")).not.toMatch(/kontrol sorusu/);
    expect(validateLessonPedagogy(lesson([true, true, true])).join(" ")).not.toMatch(/3 kontrol sorusu/);
  });
});
