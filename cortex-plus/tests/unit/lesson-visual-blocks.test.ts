import { describe, expect, it } from "vitest";
import {
  blockAlias,
  readLessonV3,
  v3ToV2,
  visualBlockText,
  type LessonV3,
} from "@/lib/learning/lesson-v3";
import {
  TEACHER_SYSTEM,
  TOPIC_TEACHER_SYSTEM,
  VISUAL_BLOCK_RULE,
  verifySystem,
  visualCardQuotaIssue,
} from "@/lib/learning/teacher-lesson";

const lesson: LessonV3 = {
  format: 3,
  title: "Sinüs ve kosinüs",
  screens: [
    {
      heading: "Sinüs",
      concept: "Sinüs",
      blocks: [
        { type: "text", text: "Sinüs karşı kenarın hipotenüse oranıdır." },
        {
          type: "formula",
          formula: {
            title: "Sinüs",
            expression: "sin θ = karşı / hipotenüs",
            symbols: [{ symbol: "θ", meaning: "açı" }],
          },
        },
        {
          type: "exam_trap_card",
          trap: {
            title: "Sinüs ile kosinüs",
            wrong: "Sinüs komşu kenarın hipotenüse oranıdır.",
            right: "Sinüs karşı kenarın hipotenüse oranıdır.",
            tell: "Karşı kenar açıya bakmayan değil, açının karşısındaki kenardır.",
          },
        },
        {
          type: "memory_hook_card",
          hook: { kind: "shortcut", title: "SOH", body: "Sinüs = Opposite / Hypotenuse." },
        },
        {
          type: "comparison_carousel",
          carousel: {
            title: "Sinüs ve kosinüs",
            mode: "compare",
            slides: [
              { title: "Sinüs", body: "Karşı / hipotenüs", points: ["açının karşısı"] },
              { title: "Kosinüs", body: "Komşu / hipotenüs", points: ["açının komşusu"] },
            ],
          },
        },
        {
          type: "check",
          check: {
            type: "trueFalse",
            prompt: "Sinüs komşu kenarın hipotenüse oranıdır.",
            options: ["Doğru", "Yanlış"],
            answerIndex: 1,
            explanation: "Karşı kenardır.",
          },
        },
      ],
    },
  ],
};

describe("LessonV3 görsel kartlar", () => {
  it("eski dersleri kırmadan exam_trap / hook / carousel okur", () => {
    const parsed = readLessonV3(lesson);
    expect(parsed?.screens[0]?.blocks.map((block) => block.type)).toEqual([
      "text",
      "formula",
      "exam_trap_card",
      "memory_hook_card",
      "comparison_carousel",
      "check",
    ]);
  });

  it("formula_card ve general_knowledge_box adlarını eski türlüre çevirir", () => {
    const formula = blockAlias({ type: "formula_card", formula: { title: "Alan", expression: "A = πr²" } });
    expect(formula).toEqual({ type: "formula", formula: { title: "Alan", expression: "A = πr²" } });
    const box = blockAlias({
      type: "general_knowledge_box",
      note: { title: "Genel bilgi: π", body: "Dairenin çevresinin çapa oranı.", tone: "info" },
    });
    expect(box).toMatchObject({ type: "note", note: { tone: "general" } });
  });

  it("V2 görünümünde tuzak metni yanlış inanç diye etiketlenir", () => {
    const body = v3ToV2(lesson).sections[0]!.body;
    expect(body).toContain("Sık yapılan yanlış:");
    expect(body).toContain("Hafıza çivisi");
    expect(visualBlockText(lesson.screens[0]!.blocks[2]!)).toContain("Doğrusu:");
  });

  it("yazar ve iki denetçi aynı görsel kart kuralını okur", () => {
    expect(TEACHER_SYSTEM).toContain(VISUAL_BLOCK_RULE);
    expect(TOPIC_TEACHER_SYSTEM).toContain(VISUAL_BLOCK_RULE);
    expect(verifySystem("document")).toContain(VISUAL_BLOCK_RULE);
    expect(verifySystem("topic")).toContain(VISUAL_BLOCK_RULE);
    expect(VISUAL_BLOCK_RULE).toContain("en az 2");
    expect(VISUAL_BLOCK_RULE).toContain("hedef 3");
    expect(VISUAL_BLOCK_RULE).toContain("exam_trap_card");
    expect(verifySystem("document")).toContain("Görsel kart eksik");
    expect(verifySystem("topic")).toContain("Görsel kart eksik");
    expect(verifySystem("document")).not.toContain("görsel kartın yokluğu");
    expect(verifySystem("topic")).not.toContain("görsel kartın yokluğu");
  });

  it("iki karttan azsa ya da yalnız formül varsa öğretim önemiyle ister", () => {
    const bare = { screens: [{ blocks: [{ type: "text" }, { type: "formula" }] }] } as unknown as LessonV3;
    const asked = visualCardQuotaIssue(bare);
    expect(asked?.severity).toBe("medium");
    expect(asked?.problem.startsWith("Görsel kart eksik")).toBe(true);
    const formulasOnly = { screens: [{ blocks: [{ type: "formula" }, { type: "formula" }] }] } as unknown as LessonV3;
    expect(visualCardQuotaIssue(formulasOnly)?.severity).toBe("medium");
    expect(visualCardQuotaIssue(lesson)).toBeNull();
  });
});
