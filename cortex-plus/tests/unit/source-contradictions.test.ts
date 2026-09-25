import { describe, expect, it } from "vitest";
import {
  assignContradictions,
  formatContradiction,
} from "@/lib/learning/source-contradictions";

const topics = [
  {
    title: "Saf madde",
    sources: [
      { documentId: "pdf", pages: [1] },
      { documentId: "photo", pages: [1] },
    ],
  },
];

describe("contradictions", () => {
  it("warns when two files give different values for the same concept", () => {
    const { byTitle, unassigned } = assignContradictions(topics, [
      {
        documentId: "pdf",
        fileName: "not.pdf",
        definitions: [
          {
            term: "kaynama noktası",
            definition: "Saf suyun kaynama noktası 100 °C'dir.",
            pageNumbers: [1],
          },
        ],
        formulas: [],
      },
      {
        documentId: "photo",
        fileName: "foto.jpg",
        definitions: [
          {
            term: "kaynama noktası",
            definition: "Suyun kaynama noktası 98 °C'dir.",
            pageNumbers: [1],
          },
        ],
        formulas: [],
      },
    ]);

    const warning = byTitle.get("Saf madde") ?? [];
    expect(unassigned).toHaveLength(0);
    expect(warning).toHaveLength(1);
    expect(warning[0]?.claims.map((claim) => claim.fileName)).toEqual(["not.pdf", "foto.jpg"]);
    const text = formatContradiction(warning[0]!);
    expect(text).toContain("not.pdf");
    expect(text).toContain("foto.jpg");
    expect(text).toContain("100");
    expect(text).toContain("98");
    expect(text).toContain("sessizce seçmedik");
  });

  it("does not warn when both files state the same number", () => {
    const { byTitle, unassigned } = assignContradictions(topics, [
      {
        documentId: "pdf",
        fileName: "not.pdf",
        definitions: [
          {
            term: "kaynama noktası",
            definition: "Kaynama noktası 100 derecedir.",
            pageNumbers: [1],
          },
        ],
        formulas: [],
      },
      {
        documentId: "photo",
        fileName: "foto.jpg",
        definitions: [
          {
            term: "kaynama noktası",
            definition: "Kaynama noktası 100 °C olarak verilir.",
            pageNumbers: [1],
          },
        ],
        formulas: [],
      },
    ]);
    expect(byTitle.size).toBe(0);
    expect(unassigned).toHaveLength(0);
  });

  it("flags formulas that do not match", () => {
    const { byTitle } = assignContradictions(topics, [
      {
        documentId: "pdf",
        fileName: "not.pdf",
        definitions: [],
        formulas: [{ expression: "d = m/V", meaning: "özkütle", pageNumbers: [1] }],
      },
      {
        documentId: "photo",
        fileName: "foto.jpg",
        definitions: [],
        formulas: [{ expression: "d = m/V * 2", meaning: "özkütle", pageNumbers: [1] }],
      },
    ]);
    expect(byTitle.get("Saf madde")?.[0]?.claims).toHaveLength(2);
  });
});
