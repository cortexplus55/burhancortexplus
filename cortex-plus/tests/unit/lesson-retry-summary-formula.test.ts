import { describe, expect, it } from "vitest";
import { layoutBoard } from "@/lib/learning/lesson-board";
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

  /*
    20 Ekim 2026: bu test eski hatayı sabitliyordu. Yalnız kök tekrar ana sorunun anahtarını alıyordu: "Sıcaklık ısıl
    durumu gösteren bir özellik midir?" sorusu "Yanlış" anahtarıyla sorulacaktı, oysa kaynağa göre doğru. Yalnız kök
    artık kullanılmaz; yazarın tam öğesi kendi anahtarıyla gelir.
  */
  it("ignores a prompt-only review (its key cannot be checked) and uses the writer's full item", () => {
    const base = {
      type: "trueFalse" as const,
      prompt: LIVE_PROMPT,
      options: ["Yanlış", "Doğru"],
      answerIndex: 0,
      explanation: "Sıcaklık enerji birimi değildir.",
    };
    const promptOnly = reviewQuestionFor({ ...base, review: { prompt: "Sıcaklık ısıl durumu gösteren bir özellik midir?" } }, "tr", source);
    expect(promptOnly.prompt).not.toBe("Sıcaklık ısıl durumu gösteren bir özellik midir?");
    expect(promptOnly.options[promptOnly.answerIndex]).toBe("Doğru");

    const full = reviewQuestionFor(
      {
        ...base,
        review: {
          prompt: "Sıcaklık, bir sistemin ısıl durumunu gösteren bir özelliktir.",
          options: ["Doğru", "Yanlış"],
          answerIndex: 0,
          explanation: "Sıcaklık ısıl durumu gösterir; enerji birimi değildir.",
        },
      },
      "tr",
      source,
    );
    expect(full.prompt).toBe("Sıcaklık, bir sistemin ısıl durumunu gösteren bir özelliktir.");
    expect(full.options[full.answerIndex]).toBe("Doğru");
    expect(full.explanation).toBe("Sıcaklık ısıl durumu gösterir; enerji birimi değildir.");
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
