import { describe, expect, it } from "vitest";
import { diagnosticTopicSource } from "@/lib/learning/diagnostic-source";

describe("first-lesson source selection", () => {
  it("uses the active chapter's second PDF instead of the prep's first PDF", () => {
    const source = diagnosticTopicSource({
      primaryDocumentId: "first-pdf",
      sourceDocumentIds: ["first-pdf", "second-pdf"],
      documentTopicNodeId: null,
      sourceRefs: [{ documentId: "second-pdf", nodeId: "second-chapter", pages: [91, 99] }],
    });
    expect(source.documentId).toBe("second-pdf");
    expect(source.nodeId).toBe("second-chapter");
    expect(source.fromRef).toBe(true);
  });

  it("rejects a source ref not attached to this prep", () => {
    const source = diagnosticTopicSource({
      primaryDocumentId: "first-pdf",
      sourceDocumentIds: ["first-pdf"],
      documentTopicNodeId: "first-chapter",
      sourceRefs: [{ documentId: "foreign-pdf", nodeId: "foreign-chapter", pages: [1] }],
    });
    expect(source.documentId).toBe("first-pdf");
    expect(source.nodeId).toBe("first-chapter");
    expect(source.fromRef).toBe(false);
  });
});
