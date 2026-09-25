import { describe, expect, it } from "vitest";
import { formatPageList, sourceCitation } from "@/lib/learning/path-source-label";

describe("path source labels", () => {
  it("collapses consecutive pages and keeps gaps", () => {
    expect(formatPageList([3, 1, 2, 2, 5])).toBe("1–3, 5");
  });

  it("names the file when the prep has one source", () => {
    expect(sourceCitation([{ fileName: "pdf-12-sayfa.pdf", pages: [1, 2, 3] }])).toEqual({
      label: "pdf-12-sayfa s.1–3",
      omitBarePages: true,
    });
  });

  it("omits a bare page list when several files share the prep", () => {
    expect(
      sourceCitation([
        { fileName: "pdf-12-sayfa.pdf", pages: [1, 2, 3] },
        { fileName: "foto-1.jpg", pages: [1] },
      ]),
    ).toEqual({ label: null, omitBarePages: true });
  });

  it("keeps bare pages when no file name is known", () => {
    expect(sourceCitation([], [4, 5])).toEqual({ label: null, omitBarePages: false });
  });
});
