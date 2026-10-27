// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FreeActivityPicker } from "@/components/parity/free-activity-picker";
import { freeActivityPick, nodeNeedsStudentUnlock, studentMayStartNode } from "@/lib/learning/study-tools";

const onOpen = vi.fn();

afterEach(() => {
  cleanup();
  onOpen.mockReset();
});

const nodes = [
  {
    id: "lesson-2",
    kind: "lesson",
    sortOrder: 4,
    status: "locked",
    sessionMeta: { topicTitle: "Konu 2", topicId: "t2" },
  },
  {
    id: "quiz-2",
    kind: "quiz",
    sortOrder: 5,
    status: "locked",
    sessionMeta: { topicTitle: "Konu 2", topicId: "t2" },
  },
];

describe("paket 1 serbest seçim", () => {
  it("kilitli düğümü açar, gizli düğümü açmaz, rota kilidi öğrenciye kapatmaz", () => {
    expect(studentMayStartNode("locked", "lesson")).toBe(true);
    expect(studentMayStartNode("hidden", "lesson")).toBe(false);
    expect(nodeNeedsStudentUnlock("locked")).toBe(true);
    expect(nodeNeedsStudentUnlock("ready")).toBe(false);
    const page = readFileSync("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx", "utf8");
    const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
    expect(page).toContain("studentMayStartNode");
    expect(page).toContain("nodeNeedsStudentUnlock");
    expect(page).not.toContain("studyNodeOpenable");
    expect(route).toContain("if (!prefetch && nodeNeedsStudentUnlock(node.status))");
    expect(route).not.toContain('if (!openable && !prefetch) return errorResponse(403, "node_locked")');
  });

  it("seçici kilitli giriş dersini açar, konunun olmayan düğümünü ekletir (başka konuya düşmez)", () => {
    const lesson = freeActivityPick(nodes, "prep-1", { id: "t2", label: "Konu 2" }, "lesson", [
      { id: "t2", label: "Konu 2" },
    ]);
    expect(lesson.ok).toBe(true);
    if (lesson.ok && lesson.kind === "node") expect(lesson.nodeId).toBe("lesson-2");
    const oral = freeActivityPick(nodes, "prep-1", { id: "t2", label: "Konu 2" }, "oral");
    expect(oral).toEqual({
      ok: true,
      kind: "create",
      tool: "oral",
      nodeKind: "oral",
      topicId: "t2",
      topicLabel: "Konu 2",
    });

    render(
      <FreeActivityPicker
        prepId="prep-1"
        nodes={nodes}
        topics={[{ id: "t2", label: "Konu 2" }]}
        onClose={() => undefined}
        onOpen={onOpen}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Giriş dersi/ }));
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: "lesson-2", href: "/deneme-sinavlari/prep-1/dugum/lesson-2" }),
    );
  });
});
