import { describe, expect, it } from "vitest";
import { planPathBackfill } from "@/lib/learning/exam-path-backfill";
import { groupNodesByPhase } from "@/lib/learning/exam-plan-phases";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";

describe("path backfill", () => {
  it("inserts focused practice after the weak-point step and the exam-day pair at the end", () => {
    const plan = planPathBackfill([
      { id: "g", kind: "gaps", title: "Zayıf nokta", dayIndex: 4, sortOrder: 4, status: "done" },
      {
        id: "w",
        kind: "written_exam",
        title: "Yazılı deneme",
        dayIndex: 5,
        sortOrder: 5,
        status: "ready",
        sessionMeta: { topicTitle: "Basınç", sourcePages: [2] },
      },
      { id: "f", kind: "flashcards", title: "Kartlar", dayIndex: 6, sortOrder: 6, status: "locked" },
    ]);
    const kinds = [
      ...plan.sortUpdates.map((row) => row.id),
      ...plan.inserts.map((row) => row.kind),
    ];
    expect(plan.inserts.map((row) => row.kind)).toEqual(["focused", "final_check", "readiness"]);
    expect(plan.inserts.find((row) => row.kind === "focused")?.status).toBe("ready");
    expect(plan.inserts.find((row) => row.kind === "focused")?.sessionMeta).toMatchObject({
      topicTitle: "Basınç",
    });
    expect(plan.inserts.find((row) => row.kind === "readiness")?.sortOrder).toBeGreaterThan(
      plan.inserts.find((row) => row.kind === "final_check")!.sortOrder,
    );
    const groups = groupNodesByPhase(
      plan.inserts.map((row) => ({ kind: row.kind as PlanNodeKind })),
    );
    expect(groups.find((group) => group.phase.id === "gaps")?.nodes.map((node) => node.kind)).toEqual([
      "focused",
    ]);
    expect(groups.find((group) => group.phase.id === "exam_day")?.nodes.map((node) => node.kind)).toEqual([
      "final_check",
      "readiness",
    ]);
    expect(kinds).toContain("w");
  });

  it("does not insert a second copy", () => {
    const plan = planPathBackfill([
      { id: "a", kind: "focused", title: "Odaklı pratik", dayIndex: 1, sortOrder: 0, status: "ready" },
      { id: "b", kind: "final_check", title: "Son kontrol", dayIndex: 1, sortOrder: 1, status: "locked" },
      { id: "c", kind: "readiness", title: "Hazırsın", dayIndex: 1, sortOrder: 2, status: "locked" },
    ]);
    expect(plan.inserts).toEqual([]);
    expect(plan.sortUpdates).toEqual([]);
  });
});
