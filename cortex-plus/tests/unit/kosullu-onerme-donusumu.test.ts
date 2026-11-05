import { describe, expect, it } from "vitest";
import {
  CONDITIONAL_LOGIC_RULE,
  conditionalLogicIssues,
  needsConditionalLogicRule,
  transformConditional,
} from "@/lib/learning/conditional-logic";
import { gateItem } from "@/lib/content-pool/gate";
import { singleAnswerIntegrityIssues } from "@/lib/learning/question-integrity";

/*
  Koşullu önerme dönüşüm adları (karşıtı / tersi / karşıt tersi) — 4 Kasım 2026'da kaldırılan p/q'ya özel kapının
  genel karşılığı. Örnekler farklı atom adları ve sözel biçim taşır; kural mantığın kendisidir, derse bağlı değildir.
*/

describe("dönüşüm cebiri", () => {
  const base = { from: { name: "a", neg: false }, to: { name: "b", neg: true } }; // a ⇒ ¬b
  it("karşıtı yer değiştirir, tersi değiller, karşıt tersi ikisini birden yapar", () => {
    expect(transformConditional(base, "converse")).toEqual({ from: { name: "b", neg: true }, to: { name: "a", neg: false } });
    expect(transformConditional(base, "inverse")).toEqual({ from: { name: "a", neg: true }, to: { name: "b", neg: false } });
    expect(transformConditional(base, "contrapositive")).toEqual({ from: { name: "b", neg: false }, to: { name: "a", neg: true } });
  });
});

describe("sembolik biçim", () => {
  it("doğru adları geçirir (p/q, prime, 'koşullu önermesinin')", () => {
    expect(conditionalLogicIssues("p ⇒ q önermesinin karşıtı q ⇒ p, tersi ¬p ⇒ ¬q, karşıt tersi ise ¬q ⇒ ¬p biçimindedir.")).toEqual([]);
    expect(conditionalLogicIssues("p ⇒ q’nun karşıtı q ⇒ p, tersi p′ ⇒ q′, karşıt tersi q′ ⇒ p′ biçimindedir.")).toEqual([]);
    expect(conditionalLogicIssues("p ⇒ q koşullu önermesinin karşıt tersi ¬q ⇒ ¬p biçimindedir.")).toEqual([]);
  });
  it("herhangi bir harf çiftiyle çalışır", () => {
    expect(conditionalLogicIssues("r ⇒ s önermesinin karşıtı s ⇒ r, karşıt tersi ¬s ⇒ ¬r olur.")).toEqual([]);
    const issues = conditionalLogicIssues("a → b önermesinin tersi b → a olur.");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("karşıtı");
  });
  it("q ⇒ p'yi 'ters' diye adlandırmayı yakalar", () => {
    const issues = conditionalLogicIssues("p ⇒ q önermesinin tersi q ⇒ p olur.");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("karşıtı");
  });
  it("karşıt tersi ile tersini karıştırmayı yakalar; temel bir önceki cümleden taşınır", () => {
    expect(conditionalLogicIssues("p ⇒ q için karşıt tersi ¬p ⇒ ¬q olur.")).toHaveLength(1);
    expect(conditionalLogicIssues("p → q verilsin. Tersi: ¬q → ¬p")).toHaveLength(1);
  });
  it("formül sonra ad biçimini yakalar", () => {
    expect(conditionalLogicIssues("q ⇒ p, p ⇒ q’nun tersidir.")).toHaveLength(1);
  });
  it("fonksiyonun tersi gibi ilgisiz 'ters' sözcüğüne dokunmaz; temel yoksa karar vermez", () => {
    expect(conditionalLogicIssues("Fonksiyonun tersi f⁻¹ ile gösterilir.")).toEqual([]);
    expect(conditionalLogicIssues("Tersi ¬q ⇒ ¬p olarak yazılır.")).toEqual([]);
  });
  it("açık temel önerme: ¬p ⇒ q'nun karşıtı q ⇒ ¬p doğrudur, p ⇒ q metinde geçse de", () => {
    const t = "p ⇒ q önermesinin karşıtı q ⇒ p dir. ¬p ⇒ q önermesinin karşıtı q ⇒ ¬p olur. p ⇒ ¬q'nun karşıt tersi q ⇒ ¬p olur.";
    expect(conditionalLogicIssues(t)).toEqual([]);
  });
  it("açık temelde de yanlış ad yakalanır", () => {
    expect(conditionalLogicIssues("p ⇒ q verilsin. ¬p ⇒ q önermesinin karşıtı ¬q ⇒ p olur.")).toHaveLength(1);
    expect(conditionalLogicIssues("p ⇒ q önermesinin karşıtı q ⇒ ¬p olur.")).toHaveLength(1);
    expect(conditionalLogicIssues("p ⇒ q'nun tersi q ⇒ p olur.")).toHaveLength(1);
  });
  it("bileşik dönüşüm: tersinin karşıtı = karşıt tersi", () => {
    expect(conditionalLogicIssues("p ⇒ q önermesinin tersinin karşıtı ¬q ⇒ ¬p olur.")).toEqual([]);
    expect(conditionalLogicIssues("p ⇒ q önermesinin karşıtının tersi ¬q ⇒ ¬p olur.")).toEqual([]);
    const issues = conditionalLogicIssues("p ⇒ q önermesinin tersinin karşıtı q ⇒ p olur.");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("tersinin karşıtı");
  });
  it("cevap şıklarına bakmadan yalnız kök/açıklamadaki iddiayı yargılar", () => {
    // Soru kökü doğru bir soru sorar; şıklarda çeldirici olarak öbür dönüşümler bulunur.
    expect(conditionalLogicIssues("p ⇒ q koşullu önermesinin tersi hangisidir?\nq ⇒ p\n¬p ⇒ ¬q\n¬q ⇒ ¬p")).toEqual([]);
  });
});

describe("denklik iddiası", () => {
  it("karşıt tersine denklik doğru, karşıtına / tersine denklik yanlış", () => {
    expect(conditionalLogicIssues("Koşullu önerme karşıt tersine denktir.")).toEqual([]);
    expect(conditionalLogicIssues("Bir koşullu önermenin karşıtı ile tersi birbirine denktir.")).toEqual([]);
    expect(conditionalLogicIssues("Bir koşullu önerme karşıtına denktir.")).toHaveLength(1);
    expect(conditionalLogicIssues("p ⇒ q önermesi tersine denktir.")).toHaveLength(1);
    expect(conditionalLogicIssues("Koşullu önerme tersine denk değildir.")).toEqual([]);
  });
});

describe("sözel biçim: 'A ise B'", () => {
  it("doğru sözel dönüşümleri geçirir", () => {
    const t =
      "Bir şekil kare ise dörtgendir. Karşıtı: bir şekil dörtgen ise karedir. Tersi: bir şekil kare değilse dörtgen değildir. " +
      "Karşıt tersi: bir şekil dörtgen değilse kare değildir.";
    expect(conditionalLogicIssues(t)).toEqual([]);
  });
  it("karşıtı 'tersi' diye adlandırılınca yakalar (yüklem sözcüğü atomdur)", () => {
    const issues = conditionalLogicIssues("Hava yağmurlu ise yer ıslaktır. Tersi: yer ıslak ise hava yağmurludur.");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("karşıtı");
  });
  it("karşıt tersi yerine tersi yazılınca yakalar", () => {
    expect(conditionalLogicIssues("Bir sayı asal ise tektir. Karşıt tersi: bir sayı asal değilse tek değildir.")).toHaveLength(1);
  });
  it("yan cümleler temelle eşleşmiyorsa karar vermez", () => {
    expect(conditionalLogicIssues("Hava yağmurlu ise yer ıslaktır. Tersi: ders bitti ise zil çalar.")).toEqual([]);
  });
});

describe("istem kuralı", () => {
  it("yalnız önerme/mantık içeren içerikte istenir; sembolik ve disiplin örneği yok", () => {
    expect(needsConditionalLogicRule("Koşullu önermeler ve bileşik önermeler")).toBe(true);
    expect(needsConditionalLogicRule("p ⇒ q ve karşıtı")).toBe(true);
    expect(needsConditionalLogicRule("Hücre zarının yapısı")).toBe(false);
    expect(CONDITIONAL_LOGIC_RULE).toMatch(/KARŞITI q ⇒ p/);
    expect(CONDITIONAL_LOGIC_RULE).toMatch(/A ise B/);
    expect(CONDITIONAL_LOGIC_RULE).not.toMatch(/\d/);
  });
});

describe("havuz kapısı ve soru bütünlüğü", () => {
  const unit = { unitId: "u", choices: 5, outcomes: [{ code: "k.1", outcomeId: "o", limitations: [] }] };
  const item = (explanation: string) =>
    ({
      outcome_code: "k.1",
      difficulty: "easy",
      stem: "p ⇒ q koşullu önermesinin tersi hangisidir?",
      choices: ["q ⇒ p", "¬p ⇒ ¬q", "¬q ⇒ ¬p", "p ∧ q", "p ∨ q"],
      answer: 1,
      explanation,
    }) as never;
  it("açıklaması yanlış ad veren soruyu modele göndermeden reddeder", () => {
    const result = gateItem(item("p ⇒ q önermesinin tersi q ⇒ p biçiminde yazılır, yerler değişir."), unit);
    expect("reason" in result && result.reason).toMatch(/mantık terimi/);
  });
  it("çeldirici şıklardaki öbür dönüşümler kapıyı düşürmez", () => {
    const result = gateItem(item("p ⇒ q önermesinin tersi ¬p ⇒ ¬q biçimindedir; iki taraf değillenir, yer değişmez. Doğru cevap: ¬p ⇒ ¬q"), unit);
    expect("reason" in result ? result.reason : "").not.toMatch(/mantık terimi/);
  });
  it("ders içi soru ve test aynı kuralı okur", () => {
    const issues = singleAnswerIntegrityIssues({
      type: "mcq",
      prompt: "p ⇒ q önermesinin karşıtı hangisidir?",
      options: ["q ⇒ p", "¬p ⇒ ¬q", "¬q ⇒ ¬p", "p ∧ q"],
      answerIndex: 0,
      explanation: "p ⇒ q önermesinin karşıtı ¬p ⇒ ¬q olur.",
    });
    expect(issues.some((i) => i.startsWith("Mantık terimi hatası"))).toBe(true);
  });
});
