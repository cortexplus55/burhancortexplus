import { describe, expect, it } from "vitest";
import { normalizeMathIdentifiers, mathIdentifierIssues, isProgrammingContext } from "@/lib/learning/math-identifiers";
import { layoutBoard } from "@/lib/learning/lesson-board";

describe("normalizeMathIdentifiers", () => {
  it("α_r ve α_d alt çizgisini temizler", () => {
    const out = normalizeMathIdentifiers("α_r = α_d × π ÷ 180");
    expect(out).not.toMatch(/α_r|α_d/);
    expect(out).toMatch(/αᵣ|\\text\{d\}/);
  });

  it("açı_radyan snake_case'ini okunur yapar", () => {
    const out = normalizeMathIdentifiers("(açı_radyan × 180) ÷ π");
    expect(out).not.toMatch(/açı_radyan/);
    expect(out).toMatch(/açı \(radyan\)/);
  });

  it("fizik ve kimya kimliklerini temizler", () => {
    expect(normalizeMathIdentifiers("v_son = v_ilk + a·t")).not.toMatch(/v_son|v_ilk/);
    expect(normalizeMathIdentifiers("n_toplam")).not.toMatch(/n_toplam/);
  });

  it("programlama dersinde user_id'ye dokunmaz", () => {
    const text = "const user_id = 1;";
    expect(normalizeMathIdentifiers(text, { topicHint: "JavaScript fonksiyon" })).toContain("user_id");
    expect(isProgrammingContext(text, "kod yazma")).toBe(true);
  });

  it("a_1 dizi notasyonunu a₁ yapar (digit yolu layoutBoard ile)", () => {
    const board = layoutBoard("a_1 dizisi");
    const joined = board.map((line) => line.text).join(" ");
    expect(joined).not.toMatch(/a_1/);
  });

  it("URL ve \\ce{H2O} korunur", () => {
    expect(normalizeMathIdentifiers("bak https://ornek.com/a_b ve \\ce{H2O}")).toContain("https://ornek.com/a_b");
    expect(normalizeMathIdentifiers("su \\ce{H2O} formülü")).toContain("\\ce{H2O}");
  });

  it("note gövdesindeki α_r layoutBoard/render yolunda alt simge olur", () => {
    const out = normalizeMathIdentifiers("Dereceden radyana: α_r = α_d × π ÷ 180");
    expect(out).not.toContain("α_r");
    expect(mathIdentifierIssues("α_r = α_d")).toHaveLength(1);
    expect(mathIdentifierIssues(out)).toHaveLength(0);
  });
});
