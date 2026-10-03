import { describe, expect, it } from "vitest";
import { planLine, publicLessonV2Schema } from "@/lib/learning/lesson-play";
import { lessonV2Schema } from "@/lib/learning/teaching-standards";
import { TEACHER_SYSTEM, TOPIC_TEACHER_SYSTEM } from "@/lib/learning/teacher-lesson";

/**
 * "Bu derste neler var" listesinde her başlığın altında tek satır (Astra,
 * 3 Ekim 2026). Satırı model yazar (`lead`); eski derste kısa ilk cümle.
 */
describe("içerik listesi satırı", () => {
  it("modelin lead satırı önce gelir, koyu işaretleri gösterilmez", () => {
    expect(planLine({ lead: "**Kesin** hükümsüzlüğü iptalden ayırmak", body: "Uzun gövde." })).toBe(
      "Kesin hükümsüzlüğü iptalden ayırmak",
    );
  });

  it("lead yoksa bölümün kısa ilk cümlesi", () => {
    expect(
      planLine({ body: "**Yokluk**, işlemin hiç doğmamış sayılmasıdır. Sonra başka cümle gelir." }),
    ).toBe("Yokluk, işlemin hiç doğmamış sayılmasıdır.");
  });

  it("ilk cümle uzunsa kesilmez, satır boş kalır", () => {
    expect(planLine({ body: `${"çok ".repeat(60)}uzun cümle.` })).toBe("");
  });

  it("lead dersin ve öğrenciye giden paketin şemasında kalır", () => {
    const section = { heading: "Yokluk", lead: "Hiç doğmamış işlem", body: "Yokluk işlemin hiç doğmamış sayılmasıdır." };
    expect(lessonV2Schema.shape.sections.element.shape.lead.parse(section.lead)).toBe("Hiç doğmamış işlem");
    const played = publicLessonV2Schema.parse({ title: "Hükümsüzlük", sections: [section] });
    expect(played.sections[0].lead).toBe("Hiç doğmamış işlem");
  });

  it("öğretmen istemi iki modda da lead ister", () => {
    for (const system of [TEACHER_SYSTEM, TOPIC_TEACHER_SYSTEM]) {
      expect(system).toContain('"lead"');
      expect(system).toMatch(/'lead' satırı/);
    }
  });
});
