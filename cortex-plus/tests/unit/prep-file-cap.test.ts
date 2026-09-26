import { describe, expect, it } from "vitest";
import { PREP_SOURCE_DOCUMENT_CAP } from "@/lib/learning/prep-topic-list";
import { filesAcceptedFromSelection } from "@/lib/learning/prep-file-cap";

describe("prep file cap", () => {
  it("accepts a selection that lands exactly on the cap", () => {
    expect(
      filesAcceptedFromSelection({
        committedCount: 0,
        selectedCount: PREP_SOURCE_DOCUMENT_CAP,
        cap: PREP_SOURCE_DOCUMENT_CAP,
      }),
    ).toEqual({ accepted: 8, overflow: 0 });
  });

  it("counts only committed files, not a file that is still in flight", () => {
    expect(
      filesAcceptedFromSelection({
        committedCount: 7,
        selectedCount: 2,
        cap: 8,
      }),
    ).toEqual({ accepted: 1, overflow: 1 });
    expect(
      filesAcceptedFromSelection({
        committedCount: 8,
        selectedCount: 1,
        cap: 8,
      }),
    ).toEqual({ accepted: 0, overflow: 1 });
  });
});
