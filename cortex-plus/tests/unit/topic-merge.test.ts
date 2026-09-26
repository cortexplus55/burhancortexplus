import { describe, expect, it } from "vitest";
import { mergeTopicDrafts } from "@/lib/learning/prep-topic-list";
import {
  applySameDecisions,
  classifyTopicPair,
  mergePairKey,
  mergeTopicGroups,
  topicMatchKey,
} from "@/lib/learning/topic-merge";
import { orderTopicsForPath } from "@/lib/learning/topic-order";

describe("topic matching", () => {
  it("treats case, plural and empty words as the same topic", () => {
    expect(topicMatchKey("Saf madde")).toBe(topicMatchKey("Saf maddeler"));
    expect(topicMatchKey("SAF MADDE konusu")).toBe(topicMatchKey("saf madde"));
    expect(classifyTopicPair("Saf madde", "Saf maddeler")).toBe("same");
  });

  it("does not merge a clearly different topic", () => {
    expect(classifyTopicPair("Saf madde", "Karışımlar")).toBe("different");
    expect(classifyTopicPair("Özkütle", "Yoğunluk")).toBe("different");
  });

  it("asks the model only for a near miss", () => {
    expect(classifyTopicPair("Hücre zarı", "Hücre zarı yapısı")).toBe("ask");
  });
});

describe("mergeTopicGroups", () => {
  it("merges the same topic across files and keeps every other topic", () => {
    const { topics } = mergeTopicGroups([
      [
        {
          id: "a",
          title: "Saf madde",
          pages: [1],
          documentId: "pdf",
          fileName: "not.pdf",
          prerequisites: [],
        },
      ],
      [
        {
          id: "b",
          title: "Saf maddeler",
          pages: [2],
          documentId: "photo",
          fileName: "foto.jpg",
          prerequisites: ["Karışımlar"],
        },
        {
          id: "c",
          title: "Karışımlar",
          pages: [3],
          documentId: "photo",
          fileName: "foto.jpg",
          prerequisites: ["Saf madde"],
        },
      ],
    ]);

    expect(topics.map((topic) => topic.title)).toEqual(["Saf madde", "Karışımlar"]);
    expect(topics[0]?.sources.map((source) => source.documentId)).toEqual(["pdf", "photo"]);
    expect(topics[0]?.pages).toEqual([1, 2]);
    expect(topics[0]?.sources[0]?.fileName).toBe("not.pdf");
    expect(topics[0]?.sources[1]?.fileName).toBe("foto.jpg");
    expect(topics[1]?.sources).toHaveLength(1);
  });

  it("keeps both titles when the model has not said they are the same", () => {
    const { topics, ambiguous } = mergeTopicGroups([
      [{ id: "a", title: "Hücre zarı", pages: [1], documentId: "pdf", fileName: "a.pdf" }],
      [{ id: "b", title: "Hücre zarı yapısı", pages: [4], documentId: "photo", fileName: "b.jpg" }],
    ]);
    expect(topics).toHaveLength(2);
    expect(ambiguous).toHaveLength(1);
    const merged = applySameDecisions(topics, new Set());
    expect(merged).toHaveLength(2);
    const same = applySameDecisions(topics, new Set([mergePairKey("Hücre zarı", "Hücre zarı yapısı")]));
    expect(same).toHaveLength(1);
    expect(same[0]?.sources).toHaveLength(2);
  });
});

describe("mergeTopicDrafts", () => {
  it("keeps every distinct topic and folds the repeated title into one", () => {
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
    expect(merged.sources[0]).toHaveLength(2);
  });
});

describe("prerequisite order", () => {
  const topics = [
    { title: "Hal değişimi", prerequisites: ["Saf madde"] },
    { title: "Saf madde", prerequisites: [] as string[] },
    { title: "Karışım", prerequisites: ["Saf madde"] },
  ];

  it("puts the foundation first when the student did not reorder", () => {
    expect(orderTopicsForPath(topics, { manualOrder: false }).map((topic) => topic.title)).toEqual([
      "Saf madde",
      "Hal değişimi",
      "Karışım",
    ]);
  });

  it("puts a heavier ready topic ahead of a lighter one", () => {
    const weighted = [
      { title: "Temel kanunlar", prerequisites: [] as string[], weightPercent: 5 },
      { title: "Stokiyometri", prerequisites: ["Mol kavramı"], examHeavy: true, weightPercent: 25 },
      { title: "Mol kavramı", prerequisites: [] as string[], examHeavy: true, weightPercent: 10 },
    ];
    expect(orderTopicsForPath(weighted, { manualOrder: false }).map((topic) => topic.title)).toEqual([
      "Mol kavramı",
      "Stokiyometri",
      "Temel kanunlar",
    ]);
  });

  it("keeps the student's order after they moved a topic", () => {
    expect(orderTopicsForPath(topics, { manualOrder: true }).map((topic) => topic.title)).toEqual([
      "Hal değişimi",
      "Saf madde",
      "Karışım",
    ]);
  });
});
