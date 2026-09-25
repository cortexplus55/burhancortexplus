import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyStudentTopicList } from "@/lib/learning/apply-prep-topics";
import { freeMaterialLimitLine, materialDetailLine } from "@/lib/learning/prep-material-copy";
import { PHOTO_PAGE_LIMITS } from "@/lib/billing/entitlements";
import { mergeTopicDrafts } from "@/lib/learning/prep-topic-list";
import { orderedSourceDocumentIds } from "@/lib/learning/prep-source";
import { groundTopicTitle } from "@/lib/learning/topic-grounding";
import type { GroundingCorpus } from "@/lib/learning/topic-grounding";

const corpus: GroundingCorpus = {
  titles: ["Fotosentez", "Hücre zarı", "Giriş"],
  pages: [
    {
      pageNumber: 1,
      text: "Fotosentez bitkilerin ışığı besine çevirdiği süreçtir.",
      headings: ["Fotosentez"],
    },
    {
      pageNumber: 2,
      text: "Hücre zarı seçici geçirgendir.",
      headings: ["Hücre"],
    },
    {
      pageNumber: 4,
      text: "Kloroplastın içinde tilakoit zar bulunur.",
      headings: ["Kloroplast"],
    },
  ],
};

describe("groundTopicTitle", () => {
  it("keeps a title that already belongs to the material", () => {
    const match = groundTopicTitle("Hücre zarı", corpus);
    expect(match.ok).toBe(true);
    if (!match.ok) return;
    expect(match.linkedTitle).toBe("Hücre zarı");
  });

  it("accepts a heading that is written in the document", () => {
    const match = groundTopicTitle("Kloroplast", corpus);
    expect(match.ok).toBe(true);
    if (!match.ok) return;
    expect(match.pageNumbers).toEqual([4]);
  });

  it("accepts a phrase that appears in the page text", () => {
    const match = groundTopicTitle("seçici geçirgen", corpus);
    expect(match.ok).toBe(true);
    if (!match.ok) return;
    expect(match.pageNumbers).toContain(2);
  });

  it("rejects a topic that is not in the material", () => {
    const match = groundTopicTitle("Kuantum dolanıklığı", corpus);
    expect(match.ok).toBe(false);
    if (match.ok) return;
    expect(match.message).toContain("materyalde geçmiyor");
  });

  it("rejects a title made only of empty words", () => {
    expect(groundTopicTitle("ve bir", corpus).ok).toBe(false);
  });
});

describe("mergeTopicDrafts", () => {
  it("keeps every main topic from every document", () => {
    const merged = mergeTopicDrafts([
      [
        { id: "a", title: "Fotosentez", pages: [1] },
        { id: "b", title: "Hücre zarı", pages: [2] },
      ],
      [
        { id: "c", title: "Fotosentez", pages: [3] },
        { id: "d", title: "Solunum", pages: [4] },
      ],
    ]);
    expect(merged.topics).toEqual(["Fotosentez", "Hücre zarı", "Solunum"]);
    expect(merged.topicPages).toEqual([[1, 3], [2], [4]]);
    expect(merged.sources[0]?.map((source) => source.nodeId)).toEqual(["a", "c"]);
  });
});

describe("applyStudentTopicList", () => {
  const loaded = {
    titles: ["Fotosentez", "Hücre zarı"],
    nodeIds: ["node-a", "node-b"],
    scheduleTopics: [
      {
        id: "node-a",
        title: "Fotosentez",
        priority: 1,
        pageNumbers: [1],
        measuredLevel: "unknown" as const,
      },
      {
        id: "node-b",
        title: "Hücre zarı",
        priority: 5,
        pageNumbers: [2],
        measuredLevel: "unknown" as const,
      },
    ],
  };

  it("keeps a skim topic when the student did not remove it", () => {
    const applied = applyStudentTopicList({
      requested: [
        { title: "Fotosentez", linkedTitle: "Fotosentez", pageNumbers: [1] },
        { title: "Hücre zarı", linkedTitle: "Hücre zarı", pageNumbers: [2] },
      ],
      loaded,
    });
    expect(applied.titles).toEqual(["Fotosentez", "Hücre zarı"]);
    expect(applied.nodeIds).toEqual(["node-a", "node-b"]);
    expect(applied.scheduleTopics.map((topic) => topic.priority)).toEqual([1, 5]);
  });

  it("drops only the topic the student removed", () => {
    const applied = applyStudentTopicList({
      requested: [{ title: "Hücre zarı", linkedTitle: "Hücre zarı", pageNumbers: [2] }],
      loaded,
    });
    expect(applied.titles).toEqual(["Hücre zarı"]);
    expect(applied.nodeIds).toEqual(["node-b"]);
  });

  it("renames in place and adds a grounded extra without a node", () => {
    const applied = applyStudentTopicList({
      requested: [
        { title: "Fotosentezin ışık evresi", linkedTitle: "Fotosentez", pageNumbers: [1] },
        { title: "Kloroplast", linkedTitle: null, pageNumbers: [4] },
      ],
      loaded,
    });
    expect(applied.titles).toEqual(["Fotosentezin ışık evresi", "Kloroplast"]);
    expect(applied.nodeIds).toEqual(["node-a", null]);
    expect(applied.scheduleTopics[1]?.priority).toBe(3);
    expect(applied.scheduleTopics[1]?.pageNumbers).toEqual([4]);
  });
});

describe("prep create keeps stored analysis", () => {
  const create = readFileSync("src/app/api/learning/exam-prep/create/route.ts", "utf8");
  const intake = readFileSync("src/app/api/learning/exam-prep/intake/route.ts", "utf8");

  it("stores every document id and does not replace the student list with the raw map", () => {
    expect(create).toContain("source_document_ids: documentIds");
    expect(create).toContain("documentId: documentIds[0] ?? null");
    expect(create).toContain("applyStudentTopicList");
    expect(create).not.toContain("topics = loaded.titles");
    expect(create).not.toContain("runTeacherAnalysis");
    expect(intake).toContain("mergeTopicGroups");
    expect(intake).not.toContain("runTeacherAnalysis");
  });
});

describe("prep material helpers", () => {
  it("orders source documents and falls back to the single id", () => {
    expect(
      orderedSourceDocumentIds({
        documentId: "first",
        documentIds: ["second", "first", "second"],
      }),
    ).toEqual(["second", "first"]);
    expect(orderedSourceDocumentIds({ documentId: "only" })).toEqual(["only"]);
  });

  it("shows size and page count only when they are known", () => {
    expect(materialDetailLine({ sizeBytes: 1536, pageCount: 10 })).toBe("2 KB · 10 sayfa");
    expect(materialDetailLine({ sizeBytes: null, pageCount: 1 })).toBe("1 sayfa");
    expect(materialDetailLine({})).toBe("");
  });

  it("uses the same Plus page-limit sentence as the plan comparison", () => {
    expect(freeMaterialLimitLine()).toContain(`PDF sayfa: ${PHOTO_PAGE_LIMITS.free}`);
    expect(freeMaterialLimitLine()).toContain(
      `Plus ile daha yüksek fotoğraf ve PDF limiti (${PHOTO_PAGE_LIMITS.plus} sayfa)`,
    );
  });
});
