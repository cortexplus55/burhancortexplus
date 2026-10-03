import { announcedExampleGap, exampleIsComplete, isIncompleteExample } from "@/lib/learning/example-completeness";
import { describe, expect, it } from "vitest";
import { summaryLineProblem } from "@/lib/learning/lesson-grounding";
import { missingFormulaCoverage } from "@/lib/learning/lesson-claims";

/**
 * Canlı ders: "İdeal Gazlarda Enerji Değişimi".
 * Tek soru, beş bozuk özet satırı ve sayı konulmamış ikinci örnek.
 */

const BAD_SUMMARY = [
  "İdeal gazlar, sıcaklık ve basınç gibi parametrelerle belirlenen sistemlerdir.",
  "Kapalı sistem: İdeal gaz enerji: Δu=c v ΔT, Δh=c p ΔT",
  "İç Enerji, Entalpi ve Özgül Isılar",
  "u ve h değişimlerini sıcaklıkla bağlayan temel malzeme bağıntılarını öğren: H = U + PV, özgül olarak h = u + Pv",
  "Entalpi özellikle akışlı sistemlerde doğal biçimde ortaya çıkar çünkü",
];

const TEACHER_ONLY =
  "Akış işi entalpiyi açık sistemde doğal biçimde ortaya çıkarır.";

const INCOMPLETE =
  "Örnek: 1 kg hava, 300 K’den 400 K’ye ısıtıldığında, W hesaplanarak ve Q = ΔU + W denklemi ile toplam ısı miktarı bulunur.";

const BODY = [
  "İdeal gazda sabit hacimde iç enerji değişimi ΔU = m c_v ΔT bağıntısıyla hesaplanır.",
  "Sabit basınçta entalpi değişimi ΔH = m c_p ΔT bağıntısıyla hesaplanır.",
  "Özgül entalpi h = u + Pv bağıntısıyla yazılır.",
  "Sınır işi W = P(V₂ − V₁) bağıntısıyla bulunur.",
  "Birinci yasa Q = ΔU + W şeklinde yazılır.",
].join(" ");

const SOURCE = [
  "İdeal gazlarda enerji değişimi sıcaklıkla yazılır.",
  BODY,
  "Özgül ısılar arasındaki fark c_p − c_v = R bağıntısına eşittir ve k = c_p / c_v olarak yazılır.",
  "c_v = 0.718 kJ/kg·K.",
  "2 kg hava 300 K sıcaklıktan 450 K sıcaklığa ısıtılır ve ΔU = 215.4 kJ olur.",
  "400 K için de aynı sabit kullanılır.",
  TEACHER_ONLY,
  ...BAD_SUMMARY,
].join("\n");

describe("ideal gaz dersinin yayın kapıları", () => {
  it("rejects the five live summary bullets and keeps a real formula line", () => {
    expect(summaryLineProblem(BAD_SUMMARY[0])).toBe("vague");
    expect(summaryLineProblem(BAD_SUMMARY[1])).toBe("heading");
    expect(summaryLineProblem(BAD_SUMMARY[2])).toBe("heading");
    expect(summaryLineProblem(BAD_SUMMARY[3])).toBe("objective");
    expect(summaryLineProblem(BAD_SUMMARY[4])).toBe("truncated");
    expect(summaryLineProblem("P_mutlak = P_atm - P_vakum")).toBeNull();
    expect(summaryLineProblem("Mutlak basınç, gösterge basıncına atmosfer eklenince bulunur: P = F/A.")).toBeNull();
    expect(summaryLineProblem("0 ≤ x ≤ 1")).toBeNull();
    expect(isIncompleteExample(INCOMPLETE)).toBe(true);
    expect(isIncompleteExample("ΔU = 2 × 0.718 × (450 − 300) = 215.4 kJ")).toBe(false);
    expect(isIncompleteExample("ΔU = m c_v ΔT bağıntısıyla hesaplanır.")).toBe(false);
    expect(exampleIsComplete("n = m/M = 36 g / 18 g/mol = 2 mol")).toBe(true);
    expect(exampleIsComplete("N = 0,25 × 6,02 × 10²³")).toBe(false);
    const hollow =
      "Uygulamalı Örnek: H₂SO₄ Hesaplaması. 0,25 mol H₂SO₄'nin gram cinsinden kütlesini bulmak için m = n × M formülünü kullanırız. H atom sayısını bulmak için önce tanecik sayısı hesaplanır: N = 0,25 × 6,02 × 10²³.";
    expect(announcedExampleGap(hollow)).toMatch(/Örnek yarım/);
    const finished =
      "Uygulamalı Örnek: H₂SO₄ Hesaplaması. 0,25 mol H₂SO₄ için kütlesini bulmak üzere m = n × M = 0,25 mol × 98 g/mol = 24,5 g. Tanecik sayısı N = 0,25 × 6,02 × 10²³ = 1,505 × 10²³. H atom sayısı 2 × 1,505 × 10²³ = 3,01 × 10²³.";
    expect(announcedExampleGap(finished)).toBeNull();
    expect(exampleIsComplete(finished)).toBe(true);
    const firstExample =
      "Sınırlayıcı Bileşen Nedir? Notlardaki örnekten: 14 g N₂ (0,5 mol) ve 4 g H₂ (2 mol) verildi. Tepkime: N₂ + 3H₂ → 2NH₃, 0,5 mol N₂ için gereken H₂ = 3 × 0,5 = 1,5 mol. H₂ 2 mol olduğundan H₂ artar, N₂ ise sınırlayıcı bileşen olur.";
    expect(announcedExampleGap(firstExample)).toMatch(/ürün miktarı/);
    const aluminum =
      "Alüminyum Klorür Tepkimesinde Sınırlayıcı Bileşen. Alüminyum klorür tepkimesinde sınırlayıcı bileşeni belirlemek için mol sayıları karşılaştırılır. Mol sayısı / katsayı oranı en küçük olan madde sınırlayıcıdır.";
    expect(announcedExampleGap(aluminum)).toMatch(/Sayı yoksa/);
    const productExample =
      "Stokiyometrik Hesaplama ve Örnek. Örneğin, 0,5 mol N₂ tepkimede yer alırsa, oluşan NH₃ molü 2 × 0,5 = 1 mol olur. NH₃ kütlesi 1 mol × 17 g/mol = 17 g.";
    expect(announcedExampleGap(productExample)).toBeNull();
    expect(announcedExampleGap("Tepkimelerde mol ilişkisi hesaplanır; örneğin oluşan ürün miktarını belirleriz.")).toBeNull();
  });

  it("asks for source equations the lesson never states", () => {
    const lesson = "İdeal gazda ΔU = m c_v ΔT yazılır.";
    const withRelations = `${lesson} c_p − c_v = R ve k = c_p / c_v.`;
    const missing = missingFormulaCoverage(lesson, SOURCE).map((item) => item.replace(/\s+/g, ""));
    expect(missing).toEqual(expect.arrayContaining(["c_p−c_v=R", "k=c_p/c_v"]));
    const covered = missingFormulaCoverage(withRelations, SOURCE).map((item) => item.replace(/\s+/g, ""));
    expect(covered).not.toEqual(expect.arrayContaining(["c_p−c_v=R", "k=c_p/c_v"]));
    expect(missingFormulaCoverage(lesson, "Basınç P = F/A bağıntısıyla tanımlanır.")).toEqual(["P = F/A"]);
    expect(
      missingFormulaCoverage("Basınç P = F/A bağıntısıyla tanımlanır.", "Basınç P = F/A bağıntısıyla tanımlanır."),
    ).toEqual([]);
  });
});
