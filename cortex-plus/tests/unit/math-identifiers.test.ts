import { describe, expect, it } from "vitest";
import { normalizeMathIdentifiers, mathIdentifierIssues, isProgrammingContext } from "@/lib/learning/math-identifiers";

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
    expect(normalizeMathIdentifiers("item_list ve created_at", { programming: true })).toContain("item_list");
    expect(normalizeMathIdentifiers("max_value", { topicHint: "Python programlama" })).toContain("max_value");
  });

  it("a_1 dizi notasyonunu a₁ yapar", () => {
    expect(normalizeMathIdentifiers("a_1 dizisi")).toBe("a₁ dizisi");
  });

  it("URL, inline code ve \\ce{H2O} korunur", () => {
    expect(normalizeMathIdentifiers("bak https://ornek.com/a_b ve \\ce{H2O}")).toContain("https://ornek.com/a_b");
    expect(normalizeMathIdentifiers("su \\ce{H2O} formülü")).toContain("\\ce{H2O}");
    expect(normalizeMathIdentifiers("kodda `hız_son` kalır")).toContain("`hız_son`");
  });

  it("Türkçe gövde ortasında kırılmaz (Unicode sınır)", () => {
    // Eski ASCII \\w lookbehind: "hız_son" → "hı$z_…", "sıcaklık_son" → "sıcaklı$k_…"
    expect(normalizeMathIdentifiers("hız_son")).toBe("hız (son)");
    expect(normalizeMathIdentifiers("sıcaklık_son")).toBe("sıcaklık (son)");
    expect(normalizeMathIdentifiers("Işık_hızı")).toBe("Işık (hızı)");
    expect(normalizeMathIdentifiers("kütle_toplam")).toBe("kütle (toplam)");
    for (const s of ["hız_son", "sıcaklık_son", "Işık_hızı", "kütle_toplam"]) {
      expect(normalizeMathIdentifiers(s)).not.toMatch(/\$[a-z]_/i);
    }
    expect(normalizeMathIdentifiers("v_son")).toBe("$v_{\\text{son}}$");
    expect(normalizeMathIdentifiers("n_toplam")).toBe("$n_{\\text{toplam}}$");
    expect(normalizeMathIdentifiers("açı_radyan")).toBe("açı (radyan)");
    expect(normalizeMathIdentifiers("α_r")).toBe("αᵣ");
    expect(normalizeMathIdentifiers("a_1")).toBe("a₁");
  });

  it("note gövdesindeki α_r layoutBoard/render yolunda alt simge olur", () => {
    const out = normalizeMathIdentifiers("Dereceden radyana: α_r = α_d × π ÷ 180");
    expect(out).not.toContain("α_r");
    expect(mathIdentifierIssues("α_r = α_d")).toHaveLength(1);
    expect(mathIdentifierIssues(out)).toHaveLength(0);
  });

  it("mathIdentifierIssues user_id gibi tutulanları bayraklamaz", () => {
    expect(mathIdentifierIssues("user_id alanı")).toEqual([]);
    expect(mathIdentifierIssues("açı_radyan burada")).toHaveLength(1);
  });
});
