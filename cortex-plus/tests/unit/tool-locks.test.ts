import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STUDY_TOOL_LOCK_COPY, studyToolLock } from "@/lib/learning/study-tools";
import { lockedToolPayload } from "@/lib/learning/exam-local-session";

/* Astra gibi kilitli araçlar (1 Ekim 2026). */
describe("Bilgi boşlukları ve Tekrar kilidi", () => {
  const fresh = [
    { kind: "lesson", status: "ready" },
    { kind: "gaps", status: "locked" },
    { kind: "spaced", status: "locked" },
  ];

  it("yanlış yokken Bilgi boşlukları, hiçbir şey bitmemişken Tekrar kilitli", () => {
    expect(studyToolLock("gaps", { nodes: fresh, openMisconceptions: 0 })).toBe(STUDY_TOOL_LOCK_COPY.gaps);
    expect(studyToolLock("spaced", { nodes: fresh, openMisconceptions: 0 })).toBe(STUDY_TOOL_LOCK_COPY.spaced);
    expect(studyToolLock("lesson", { nodes: fresh, openMisconceptions: 0 })).toBeNull();
  });

  it("açık yanılgı ya da bitmiş adım kilidi açar; bitmiş düğüm hep açık", () => {
    expect(studyToolLock("gaps", { nodes: fresh, openMisconceptions: 1 })).toBeNull();
    const learned = [{ kind: "lesson", status: "done" }, ...fresh.slice(1)];
    expect(studyToolLock("spaced", { nodes: learned, openMisconceptions: 0 })).toBeNull();
    const gapsDone = [{ kind: "gaps", status: "done" }];
    expect(studyToolLock("gaps", { nodes: gapsDone, openMisconceptions: 0 })).toBeNull();
  });

  it("sunucu kilitli cevabı kayıt açmadan ve ücretsiz döner", () => {
    const plan = lockedToolPayload("gaps");
    expect(plan.action).toBe("serve");
    expect(plan.action === "serve" && plan.payload).toMatchObject({ type: "practice_empty", locked: true });
    const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8").replace(/\r\n/g, "\n");
    expect(route).toContain('const lockable = (kind === "gaps" || kind === "spaced") && node.status !== "done";');
    expect(route).toContain("local.payload.locked === true");
    // Kilitli cevap, kayıt ekleyen dalın ÖNÜNDE döner.
    expect(route.indexOf("local.payload.locked === true")).toBeLessThan(route.indexOf('.from("exam_prep_node_attempts")\n        .insert(row)'));
  });
});
