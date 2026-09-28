import { describe, expect, it } from "vitest";
import { buildStudyOutlineFromNodes } from "@/lib/learning/study-outline";
import live111 from "../fixtures/scanned-outline/cortex-live-111.json";

const QUESTION_STEM =
  /\b(hangisi|hangisidir|aşağıdakilerden|asagidakilerden|which of the following)\b/i;

describe("buildStudyOutlineFromNodes on cortex-live-111 flat map", () => {
  const titles = live111 as string[];
  const nodes = titles.map((title, index) => ({
    id: `node-${index}`,
    title,
    parentId: null as string | null,
    sortOrder: index,
  }));
  const pagesByTopic = new Map<string, number[]>();
  for (const node of nodes) {
    const base = node.sortOrder * 2 + 1;
    pagesByTopic.set(node.id, [base, base + 1]);
  }

  it("cleans flat pollution, keeps real node ids, and produces units", () => {
    const outline = buildStudyOutlineFromNodes({
      nodes,
      pagesByTopic,
      seriesLabels: ["KPSS"],
      contentPageCount: 200,
    });

    expect(outline.topics.length).toBeLessThanOrEqual(40);
    expect(outline.topics.length).toBeGreaterThan(0);
    expect(outline.units.length).toBeGreaterThanOrEqual(1);

    for (const topic of outline.topics) {
      expect(topic.id).toMatch(/^node-/);
      expect(topic.id).not.toMatch(/^outline-/);
      expect(topic.title).not.toMatch(QUESTION_STEM);
      expect(topic.sourceNodeIds.length).toBeGreaterThan(0);
      expect(topic.pages.length).toBeGreaterThan(0);
    }

    for (const unit of outline.units) {
      expect(unit.title.trim().length).toBeGreaterThan(0);
      expect(unit.topicIndexes.length).toBeGreaterThan(0);
      for (const index of unit.topicIndexes) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(outline.topics.length);
      }
    }

    expect(outline.topics.length).toBeLessThan(titles.length);
  });
});
