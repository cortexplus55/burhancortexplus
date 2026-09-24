import { describe, expect, it } from "vitest";
import { STUDY_PATH_SKELETON } from "@/lib/learning/exam-plan-phases";
import {
  CORE_ORDER,
  buildExamPlan,
  mergeStudyPathTemplate,
  type PlanNodeDraft,
} from "@/lib/learning/exam-prep-plan";

describe("study path skeleton", () => {
  it("keeps the same activity kinds for a short and a long calendar", () => {
    const kinds = (days: number) => buildExamPlan(days).map((node) => node.kind);
    expect(kinds(3)).toEqual(kinds(40));
    expect(kinds(3)).toEqual(CORE_ORDER);
    expect(new Set(kinds(3)).size).toBe(CORE_ORDER.length);
  });

  it("names the phases the student sees on the plan", () => {
    expect(STUDY_PATH_SKELETON.map((phase) => phase.title)).toEqual([
      "Bugün başla",
      "Öğren ve Pratik Yap",
      "Aralıklı Tekrar",
      "Bilgi boşluklarını kapat",
      "Yazılı Deneme",
      "Sınav günü",
    ]);
    const labels = STUDY_PATH_SKELETON.flatMap((phase) =>
      phase.items.map((item) => item.label),
    );
    expect(labels).toEqual(
      expect.arrayContaining([
        "Giriş Dersi",
        "Tanı Testi",
        "Podcast Dinle",
        "AI öğretmenle Soru-Cevap",
        "Testler ve Doğru/Yanlış",
        "AI ile Sözlü Deneme",
        "Zayıf nokta",
        "Yazılı deneme",
        "Kartlarla son tekrar",
      ]),
    );
  });

  it("inserts missing activity kinds without dropping scheduled nodes", () => {
    const scheduled: PlanNodeDraft[] = [
      { kind: "lesson", title: "A · Ders", dayIndex: 1, sortOrder: 0 },
      { kind: "quiz", title: "A · Test", dayIndex: 1, sortOrder: 1 },
      { kind: "spaced", title: "A · Tekrar", dayIndex: 2, sortOrder: 2 },
      { kind: "written_exam", title: "Yazılı", dayIndex: 3, sortOrder: 3 },
    ];
    const merged = mergeStudyPathTemplate(scheduled);
    expect(merged.map((node) => node.kind)).toEqual(CORE_ORDER);
    expect(merged[0]).toMatchObject({ kind: "lesson", title: "A · Ders" });
    expect(merged.map((node) => node.sortOrder)).toEqual(
      merged.map((_, index) => index),
    );
    expect(merged.some((node) => node.kind === "podcast" && node.title === "Podcast Dinle")).toBe(
      true,
    );
    expect(merged.some((node) => node.kind === "oral")).toBe(true);
    expect(merged.filter((node) => node.kind === "lesson")).toHaveLength(1);
  });
});
