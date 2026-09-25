import { describe, expect, it } from "vitest";
import {
  applyEquivalenceVerdicts,
  assignContradictions,
  formatContradiction,
  parseEquivalenceVerdicts,
  relateClaims,
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

  it("does not call equivalent mol definitions a conflict", () => {
    const { byTitle, candidates } = assignContradictions(
      [{ title: "Mol kavramı", sources: [] }],
      [
        {
          documentId: "pdf",
          fileName: "pdf-12-sayfa.pdf",
          definitions: [
            {
              term: "mol",
              definition:
                "Bir madde miktarının, 12 gram karbon-12 izotopundaki tanecik sayısına eşit olan miktar.",
              pageNumbers: [1],
            },
          ],
          formulas: [],
        },
        {
          documentId: "docx",
          fileName: "ders-konulari.docx",
          definitions: [
            {
              term: "mol",
              definition: "6,02×10²³ tanecik içeren miktar birimidir.",
              pageNumbers: [1],
            },
          ],
          formulas: [],
        },
      ],
    );
    expect(byTitle.size).toBe(0);
    expect(candidates).toHaveLength(0);
    expect(relateClaims(
      "Bir madde miktarının, 12 gram karbon-12 izotopundaki tanecik sayısına eşit olan miktar.",
      "6,02×10²³ tanecik içeren miktar birimidir.",
    )).toBe("same");
  });

  it("does not call the same molar volume at standard conditions a conflict", () => {
    const left = "1 mol ideal gaz normal koşullarda 22,4 L hacim kaplar.";
    const right = "Normal koşullarda (0 °C ve 1 atm) 1 mol gazın kapladığı hacim yaklaşık 22,4 L'dir.";
    expect(relateClaims(left, right)).toBe("same");
    const { byTitle, candidates } = assignContradictions(
      [{ title: "Gazlar", sources: [] }],
      [
        {
          documentId: "photo",
          fileName: "foto-2.jpg",
          definitions: [{ term: "molar hacim", definition: left, pageNumbers: [1] }],
          formulas: [],
        },
        {
          documentId: "pdf",
          fileName: "pdf-12-sayfa.pdf",
          definitions: [{ term: "molar hacim", definition: right, pageNumbers: [2] }],
          formulas: [],
        },
      ],
    );
    expect(byTitle.size).toBe(0);
    expect(candidates).toHaveLength(0);
  });

  it("flags a real temperature conflict and says which value to use on the exam", () => {
    const { byTitle } = assignContradictions(topics, [
      {
        documentId: "pdf",
        fileName: "not.pdf",
        definitions: [
          { term: "kaynama noktası", definition: "Saf su 100 °C'de kaynar.", pageNumbers: [1] },
        ],
        formulas: [],
      },
      {
        documentId: "syllabus",
        fileName: "ders-konulari.docx",
        definitions: [
          { term: "kaynama noktası", definition: "Saf su 98 °C'de kaynar.", pageNumbers: [1] },
        ],
        formulas: [],
      },
    ]);
    const text = formatContradiction(byTitle.get("Saf madde")![0]!);
    expect(text).toContain("100");
    expect(text).toContain("98");
    expect(text).toContain("ders-konulari.docx");
    expect(text).toMatch(/Sınavda ders-konulari\.docx/);
  });

  it("flags different years for the same event", () => {
    expect(relateClaims(
      "İstanbul'un fethi 1453 yılında oldu.",
      "İstanbul'un fethi 1454 yılında oldu.",
    )).toBe("conflict");
    const { byTitle } = assignContradictions(
      [{ title: "İstanbul'un fethi", sources: [] }],
      [
        {
          documentId: "a",
          fileName: "ders.pdf",
          definitions: [
            { term: "İstanbul'un fethi", definition: "İstanbul'un fethi 1453 yılında oldu.", pageNumbers: [1] },
          ],
          formulas: [],
        },
        {
          documentId: "b",
          fileName: "not.docx",
          definitions: [
            { term: "İstanbul'un fethi", definition: "İstanbul'un fethi 1454 yılında oldu.", pageNumbers: [1] },
          ],
          formulas: [],
        },
      ],
    );
    const text = formatContradiction(byTitle.get("İstanbul'un fethi")![0]!);
    expect(text).toContain("1453");
    expect(text).toContain("1454");
    expect(text).toContain("sessizce seçmedik");
  });

  it("flags two g values with no stated reason and keeps an approximate match", () => {
    expect(relateClaims(
      "Yerçekimi ivmesi 9,8 m/s²'dir.",
      "Yerçekimi ivmesi 10 m/s²'dir.",
    )).toBe("conflict");
    expect(relateClaims(
      "Yerçekimi ivmesi yaklaşık 10 m/s² alınır.",
      "Yerçekimi ivmesi 9,81 m/s²'dir.",
    )).toBe("same");
  });

  it("does not flag the same quantity at explicitly different conditions", () => {
    expect(relateClaims(
      "1 mol ideal gaz normal koşullarda 22,4 L hacim kaplar.",
      "1 mol ideal gaz 25 °C'de yaklaşık 24,5 L hacim kaplar.",
    )).toBe("same");
  });

  it("hides a wording candidate unless the model calls it a conflict", () => {
    const assignment = assignContradictions(
      [{ title: "Başkent", sources: [] }],
      [
        {
          documentId: "a",
          fileName: "tarih.pdf",
          definitions: [
            { term: "başkent", definition: "Cumhuriyetin başkenti Ankara'dır.", pageNumbers: [1] },
          ],
          formulas: [],
        },
        {
          documentId: "b",
          fileName: "not.docx",
          definitions: [
            { term: "başkent", definition: "Cumhuriyetin başkenti İstanbul'dur.", pageNumbers: [1] },
          ],
          formulas: [],
        },
      ],
    );
    expect(assignment.byTitle.size).toBe(0);
    expect(assignment.candidates).toHaveLength(1);
    const shown = applyEquivalenceVerdicts(assignment, ["conflict"]);
    expect(shown.byTitle.get("Başkent")).toHaveLength(1);
    const hidden = applyEquivalenceVerdicts(assignment, ["unsure"]);
    expect(hidden.byTitle.size).toBe(0);
    expect(parseEquivalenceVerdicts({ verdicts: ["conflict", "maybe"] }, 2)).toEqual([
      "conflict",
      "unsure",
    ]);
    expect(parseEquivalenceVerdicts(null, 1)).toEqual(["unsure"]);
  });
});
