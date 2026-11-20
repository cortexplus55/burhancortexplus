import { describe, expect, it, vi } from "vitest";
import { LESSON_V3_FORMAT, readLessonV3 } from "@/lib/learning/lesson-v3";
import { parseVisualSceneCompletion } from "@/lib/learning/teacher-lesson";
import { parseVisualScene } from "@/lib/learning/visual-scenes/schema";
import { classifyAcademicDomain } from "@/lib/learning/visual-scenes/archetype";
import {
  checkSceneRelations,
  equationRelation,
  equationSigns,
} from "@/lib/learning/visual-scenes/relation-check";
import { sentenceRelation } from "@/lib/learning/relation-text";
import { VISUAL_SCENE_COMMON_RULE } from "@/lib/learning/visual-scenes/prompt";

/*
  Faz 1-B düzeltmesi (19 Kasım 2026): görsel sahne kaynağın hatasını ya da uydurulmuş bir ilişkiyi öğretmez.
  Bütün örnekler jeneriktir (X, Y, Z ve "birinci/ikinci nicelik"); gerçek konu, belge ya da ders içeriği yok.
*/

const FIRST = { key: "X", names: ["X", "Birinci nicelik"] };
const SECOND = { key: "Y", names: ["Y", "İkinci nicelik"] };

function trendScene(secondTrend: "increase" | "decrease", formula: string) {
  return parseVisualScene({
    archetype: "ENGINEERING_PHYSICS_MECHANICS",
    title: "İki niceliğin değişimi",
    setting: "trend",
    body: { label: "Örnek sistem" },
    vectors: [
      { symbol: "X", label: "Birinci nicelik", direction: "right", magnitude: 2, trend: "increase" },
      { symbol: "Y", label: "İkinci nicelik", direction: secondTrend === "increase" ? "right" : "left", magnitude: 2, trend: secondTrend },
    ],
    logic: { formula, drivers: [{ symbol: "X", label: "Birinci nicelik", effect: "up" }], distractors: [] },
  })!;
}

const DIRECT_SENTENCE = "Birinci nicelik iki katına çıkarsa ikinci nicelik de iki katına çıkar.";
const INVERSE_SENTENCE = "Birinci nicelik iki katına çıkarsa ikinci nicelik yarıya iner.";

describe("denklemden ilişki", () => {
  it("çarpım/bölüm denkleminde aynı yandaki iki büyüklük ters, karşı yandakiler doğru orantılı", () => {
    expect(Object.fromEntries(equationSigns("X·Y = k·Z")!)).toEqual({ X: 1, Y: 1, k: -1, Z: -1 });
    expect(equationRelation(["X·Y = k·Z"], "X", "Y")).toBe("inverse");
    expect(equationRelation(["X·Y = k·Z"], "X", "Z")).toBe("direct");
    expect(equationRelation(["XY = kZ"], "X", "Y")).toBe("inverse");
    expect(equationRelation(["A = B / C"], "A", "B")).toBe("direct");
    expect(equationRelation(["A = B / C"], "A", "C")).toBe("inverse");
    expect(equationRelation(["A = B / C"], "B", "C")).toBe("direct");
    expect(equationRelation(["A = B²·C"], "A", "B")).toBe("direct");
  });

  it("toplama içeren, değişkeni olmayan ya da birbiriyle çelişen denklemlerden ilişki çıkmaz", () => {
    expect(equationSigns("A = B + C")).toBeNull();
    expect(equationRelation(["A = B + C"], "A", "B")).toBeNull();
    expect(equationRelation(["X·Y = Z", "X = Y·Z"], "X", "Y")).toBeNull();
    expect(equationRelation(["X·Y = Z"], "X", "W")).toBeNull();
  });
});

describe("cümleden ilişki", () => {
  it("artar/azalır, kat ve orantı ifadeleri okunur", () => {
    expect(sentenceRelation(DIRECT_SENTENCE, FIRST, SECOND)).toBe("direct");
    expect(sentenceRelation(INVERSE_SENTENCE, FIRST, SECOND)).toBe("inverse");
    expect(sentenceRelation("Birinci nicelik artarsa ikinci nicelik azalır.", FIRST, SECOND)).toBe("inverse");
    expect(sentenceRelation("İkinci niceliği azalırsa birinci niceliği de azalır.", FIRST, SECOND)).toBe("direct");
    expect(sentenceRelation("Birinci nicelik ile ikinci nicelik ters orantılıdır.", FIRST, SECOND)).toBe("inverse");
    expect(sentenceRelation("X artarsa Y de artar.", FIRST, SECOND)).toBe("direct");
  });

  it("iki büyüklükten biri yoksa ya da değişim söylenmiyorsa ilişki yok", () => {
    expect(sentenceRelation("Birinci nicelik artar.", FIRST, SECOND)).toBeNull();
    expect(sentenceRelation("Birinci nicelik ve ikinci nicelik birlikte ölçülür.", FIRST, SECOND)).toBeNull();
  });
});

describe("sahne denetimi", () => {
  it("ders denklemiyle çelişen eğilim (oklar ve kural cümlesi) reddedilir; tutarlısı geçer", () => {
    const lessonText = "Bağıntı: X·Y = k·Z. Diğer büyüklükler sabit tutulur.";
    const wrong = checkSceneRelations(trendScene("increase", DIRECT_SENTENCE), { lessonText });
    expect(wrong.ok).toBe(false);
    expect(checkSceneRelations(trendScene("decrease", INVERSE_SENTENCE), { lessonText }).ok).toBe(true);
    // Oklar doğru ama kural cümlesi yanlışsa da reddedilir.
    expect(checkSceneRelations(trendScene("decrease", DIRECT_SENTENCE), { lessonText }).ok).toBe(false);
  });

  it("ders metni ters ilişkiyi söylüyorsa sahne reddedilir", () => {
    const lessonText = "Birinci nicelik artarsa ikinci nicelik azalır.";
    expect(checkSceneRelations(trendScene("increase", "İki nicelik birlikte değişir."), { lessonText }).ok).toBe(false);
    expect(checkSceneRelations(trendScene("decrease", "İki nicelik birlikte değişir."), { lessonText }).ok).toBe(true);
  });

  it("kaynak düzeltmesi: sahne kaynağın yanlışını taşırsa red; yanlış denklem ölçüt olmaz, doğrusu olur", () => {
    const sourceCorrection = { documentClaim: "Q = B / CD (kaynaktaki hatalı bağıntı)", verifiedTruth: "Q = B · CD", explanation: "Jenerik açıklama." };
    const scene = (cTrend: "increase" | "decrease", formula: string) =>
      parseVisualScene({
        archetype: "ENGINEERING_PHYSICS_MECHANICS",
        title: "Bağıntı",
        setting: "trend",
        body: { label: "Örnek" },
        vectors: [
          { symbol: "Q", label: "Sonuç niceliği", direction: "right", magnitude: 2, trend: "increase" },
          { symbol: "C", label: "Etken nicelik", direction: cTrend === "increase" ? "right" : "left", magnitude: 2, trend: cTrend },
        ],
        logic: { formula, drivers: [{ symbol: "C", label: "Etken nicelik", effect: "up" }], distractors: [] },
      })!;
    expect(checkSceneRelations(scene("increase", "Q = B / CD"), { lessonText: "", sourceCorrection }).ok).toBe(false);
    // Ders metni kaynağın yanlış denklemini alıntılasa da ölçüt doğrusudur (Q = B·CD → Q ile C doğru orantılı).
    const lessonText = "Kaynakta Q = B / CD yazıyor; doğrusu Q = B · CD.";
    expect(checkSceneRelations(scene("increase", "Jenerik kural cümlesi."), { lessonText, sourceCorrection }).ok).toBe(true);
    expect(checkSceneRelations(scene("decrease", "Jenerik kural cümlesi."), { lessonText, sourceCorrection }).ok).toBe(false);
  });

  it("ilişki söylemeyen sahne (kuvvet diyagramı) etkilenmez", () => {
    const force = parseVisualScene({
      archetype: "ENGINEERING_PHYSICS_MECHANICS",
      title: "Kuvvetler",
      setting: "free_body",
      body: { label: "Cisim" },
      vectors: [
        { symbol: "F_1", label: "Birinci kuvvet", direction: "right", magnitude: 2 },
        { symbol: "F_2", label: "İkinci kuvvet", direction: "left", magnitude: 1 },
      ],
      logic: { formula: "F_net = F_1 − F_2", drivers: [{ symbol: "F_1", label: "Birinci kuvvet", effect: "up" }], distractors: [] },
    })!;
    expect(checkSceneRelations(force, { lessonText: "Bağıntı: X·Y = k·Z." }).ok).toBe(true);
  });
});

/* ───────────── Ders akışı: üretim ve kayıt ───────────── */

function lessonWith(text: string, blocks: unknown[] = []) {
  return {
    format: LESSON_V3_FORMAT,
    title: "Jenerik bağıntı",
    objective: "İki nicelik arasındaki bağıntıyı okumak.",
    overview: "Birinci ve ikinci nicelik.",
    screens: [
      { heading: "Birinci kavram", concept: "Birinci kavram", blocks: [{ type: "text", text }] },
      {
        heading: "İkinci kavram",
        concept: "İkinci kavram",
        blocks: [
          { type: "formula", formula: { title: "Bağıntı", expression: "X·Y = k·Z" } },
          { type: "text", text: "Birinci nicelik ve ikinci nicelik bu bağıntıda yer alır; diğer büyüklükler sabit tutulur." },
          ...blocks,
        ],
      },
    ],
  };
}

describe("ders akışı", () => {
  it("üretim: denklemle çelişen sahne 'contradicts' olur ve derse girmez; tutarlısı eklenir", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const lesson = readLessonV3(lessonWith("Birinci nicelik ve ikinci nicelik ölçülebilir büyüklüklerdir."))!;
    expect(lesson).not.toBeNull();
    const classification = classifyAcademicDomain({ prepTitle: "Jenerik hazırlık", topicLabel: "Jenerik konu", pages: [], mode: "topic" });
    const raw = (scene: ReturnType<typeof trendScene>) => ({ type: "visual_scene", academicDomain: "physics", visualArchetype: scene.archetype, scene, afterConcept: "İkinci kavram" });
    const rejected = parseVisualSceneCompletion(raw(trendScene("increase", DIRECT_SENTENCE)), lesson, { pages: [], mode: "topic" }, classification);
    expect(rejected.verdict).toBe("contradicts");
    expect(rejected.lesson).toBeNull();
    const added = parseVisualSceneCompletion(raw(trendScene("decrease", INVERSE_SENTENCE)), lesson, { pages: [], mode: "topic" }, classification);
    expect(added.verdict).toBe("added");
    info.mockRestore();
  });

  it("kayıt: çelişen eski sahne okunurken düşer, tutarlısı ve dersin geri kalanı aynen kalır", () => {
    const block = (scene: ReturnType<typeof trendScene>) => ({ type: "visual_scene", academicDomain: "physics", visualArchetype: scene.archetype, scene });
    const stale = readLessonV3(lessonWith("Birinci nicelik ölçülür.", [block(trendScene("increase", DIRECT_SENTENCE))]))!;
    expect(stale.screens[1]!.blocks.map((item) => item.type)).toEqual(["formula", "text"]);
    const fine = readLessonV3(lessonWith("Birinci nicelik ölçülür.", [block(trendScene("decrease", INVERSE_SENTENCE))]))!;
    expect(fine.screens[1]!.blocks.map((item) => item.type)).toEqual(["formula", "text", "visual_scene"]);
  });

  it("istem: ilişki yalnız dersin doğrulanmış anlatımından; kaynak düzeltmesi ve ters orantı kuralı yazılı", () => {
    expect(VISUAL_SCENE_COMMON_RULE).toContain("BİLGİ DOĞRULUĞU");
    expect(VISUAL_SCENE_COMMON_RULE).toContain("ters orantılıdır");
    expect(VISUAL_SCENE_COMMON_RULE).toContain("KAYNAK DÜZELTMESİ");
  });
});
