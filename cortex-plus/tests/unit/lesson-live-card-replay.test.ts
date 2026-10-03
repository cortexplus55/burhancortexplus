import { describe, expect, it } from "vitest";
import { consolidateTopics, storedTopicsNeedRefold, type FoldPage } from "@/lib/documents/topic-fold";
import { layoutBoard, alignSymbolSubscripts, preserveSubscriptLetters } from "@/lib/learning/lesson-board";

const CHEMISTRY = "Mol Kavramı ve Kimyasal Hesaplamalar";

describe("live lesson card replay", () => {

  it("does not collapse a short numbered note into one topic", () => {
    const pages: FoldPage[] = [
      {
        pageNumber: 1,
        headings: [
          "Kimya Dersi Notları: Mol Kavramı ve Kimyasal Hesaplamalar",
          "1. Mol Kavramı",
          "2. Mol Kütlesi",
          "3. Gazlarda Mol Hacmi",
          "4. Kütlenin Korunumu Kanunu",
          "5. Sabit Oranlar Kanunu",
        ],
      },
    ];
    const stored = [{ title: CHEMISTRY, learningObjective: null, pageNumbers: [1] }];
    const { topics } = consolidateTopics(stored, pages, 1);
    expect(topics.length).toBeGreaterThan(1);
    expect(topics.map((topic) => topic.title).join(" ")).toMatch(/Kütlenin Korunumu/);
    expect(topics.map((topic) => topic.title).join(" ")).toMatch(/Sabit Oranlar/);
    expect(storedTopicsNeedRefold([{ title: CHEMISTRY }], pages, 1)).toBe(true);
    expect(alignSymbolSubscripts("Rₐ = 8.314", "Evrensel gaz sabiti R_u ile gösterilir.")).toBe("Rᵤ = 8.314");
    expect(preserveSubscriptLetters("N_A")).toBe("N_A");
    expect(preserveSubscriptLetters("R_u")).toBe("Rᵤ");
    expect(alignSymbolSubscripts("Nₐ ile gösterilir", "Avogadro sayısı N_A ile gösterilir.")).toBe("N_A ile gösterilir");
    const joined = layoutBoard("Bağıntı şöyle olarak hesaplanır\nn = V / 22,4").map((line) => line.text).join("\n");
    expect(joined).not.toMatch(/şöyle olarak/);
    expect(joined).toMatch(/şöyle hesaplanır:/);
  });
});
