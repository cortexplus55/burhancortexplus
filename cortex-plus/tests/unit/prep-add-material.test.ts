import { describe, expect, it } from "vitest";
import { planAddedMaterial } from "@/lib/learning/prep-add-material";
import type { MergedTopic } from "@/lib/learning/topic-merge";

const incoming: MergedTopic[] = [
  {
    title: "Saf madde",
    pages: [1],
    sources: [{ documentId: "photo", fileName: "foto.jpg", pages: [1], nodeId: null }],
    prerequisites: [],
    nodeIds: [],
  },
  {
    title: "Hal değişimi",
    pages: [2],
    sources: [{ documentId: "photo", fileName: "foto.jpg", pages: [2], nodeId: "node-new" }],
    prerequisites: ["Saf madde"],
    nodeIds: ["node-new"],
  },
];

describe("planAddedMaterial", () => {
  it("adds sources and new topics without resetting progress", () => {
    const plan = planAddedMaterial({
      existingDocumentIds: ["pdf"],
      newDocumentId: "photo",
      readinessScore: 64,
      contradictionsByTitle: new Map(),
      existingTopics: [
        {
          id: "t1",
          label: "Saf madde",
          sortOrder: 0,
          status: "done",
          sourceRefs: [{ documentId: "pdf", fileName: "not.pdf", pages: [1], nodeId: "n1" }],
        },
        {
          id: "t2",
          label: "Karışım",
          sortOrder: 1,
          status: "in_progress",
          sourceRefs: [{ documentId: "pdf", fileName: "not.pdf", pages: [4], nodeId: "n2" }],
        },
      ],
      existingNodes: [
        { id: "node-1", title: "Saf madde", sortOrder: 0, status: "done", kind: "lesson", dayIndex: 0 },
        { id: "node-2", title: "Karışım", sortOrder: 1, status: "ready", kind: "lesson", dayIndex: 1 },
        { id: "node-3", title: "Hazırsın", sortOrder: 2, status: "locked", kind: "readiness", dayIndex: 2 },
      ],
      incoming,
    });

    expect(plan.readinessScore).toBe(64);
    expect(plan.sourceDocumentIds).toEqual(["pdf", "photo"]);
    expect(plan.keptTopicStatuses).toEqual([
      { id: "t1", status: "done" },
      { id: "t2", status: "in_progress" },
    ]);
    expect(plan.keptNodeStatuses).toEqual([
      { id: "node-1", status: "done" },
      { id: "node-2", status: "ready" },
      { id: "node-3", status: "locked" },
    ]);
    expect(plan.topicUpdates.map((topic) => topic.id)).toEqual(["t1"]);
    expect(plan.topicUpdates[0]?.sourceRefs.map((source) => source.documentId)).toEqual([
      "pdf",
      "photo",
    ]);
    expect(plan.topicInserts.map((topic) => topic.label)).toEqual(["Hal değişimi"]);
    expect(plan.topicInserts[0]?.status).toBe("ready");
    expect(plan.nodeInserts.map((node) => node.topicTitle)).toEqual(["Hal değişimi"]);
    expect(plan.nodeInserts[0]?.status).toBe("locked");
    expect(plan.nodeSortUpdates.find((node) => node.id === "node-1")).toBeUndefined();
    expect(plan.keptNodeStatuses.find((node) => node.id === "node-3")?.status).toBe("locked");
    expect(JSON.stringify(plan)).not.toContain('"status":"done","id":"t1"');
  });

  it("does not drop an old document or an old topic", () => {
    const plan = planAddedMaterial({
      existingDocumentIds: ["pdf", "slides"],
      newDocumentId: "photo",
      readinessScore: 10,
      contradictionsByTitle: new Map(),
      existingTopics: [
        {
          id: "t1",
          label: "Saf madde",
          sortOrder: 0,
          status: "done",
          sourceRefs: [],
        },
      ],
      existingNodes: [],
      incoming: [incoming[1]!],
    });
    expect(plan.sourceDocumentIds).toEqual(["pdf", "slides", "photo"]);
    expect(plan.topicUpdates).toHaveLength(0);
    expect(plan.keptTopicStatuses).toEqual([{ id: "t1", status: "done" }]);
    expect(plan.nodeInserts[0]?.status).toBe("ready");
  });
});
