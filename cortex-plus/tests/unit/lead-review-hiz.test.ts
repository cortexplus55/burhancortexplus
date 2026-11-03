import { describe, expect, it } from "vitest";
import { previewFromSavedLesson } from "@/lib/learning/instant-lesson";
import { prepStepsFor } from "@/lib/learning/lesson-chrome";
import { TOPIC_MIN_SCREENS, topicDepthGap } from "@/lib/learning/teacher-lesson";

describe("Tekrar İncele önizlemesi", () => {
  it("kayıtlı dersin ilk ekranının metin blokları, soru bloğu yok", () => {
    const payload = {
      lesson: {
        title: "Türk Tarihi",
        screens: [{ heading: "Giriş", blocks: [{ type: "text", text: "**İlk** metin." }, { type: "check", question: "?" }, { type: "text", text: "İkinci." }] }],
      },
    };
    expect(previewFromSavedLesson("T", payload)).toEqual({ title: "Türk Tarihi", heading: "Giriş", paragraphs: ["İlk metin.", "İkinci."] });
    expect(previewFromSavedLesson("T", { lesson: { screens: [] } })).toBeNull();
    expect(previewFromSavedLesson("T", null)).toBeNull();
  });
});

describe("Belgesiz ders", () => {
  it("bekleme adımı not taramaz", () => {
    expect(prepStepsFor(true)[0]).not.toMatch(/Notların/);
    expect(prepStepsFor(false)[0]).toMatch(/Notların/);
  });
  it("6 ekrandan kısa ders kapsam açığı sayılır", () => {
    expect(topicDepthGap(4)).toMatch(/en az 6/);
    expect(topicDepthGap(TOPIC_MIN_SCREENS)).toBeNull();
  });
});
