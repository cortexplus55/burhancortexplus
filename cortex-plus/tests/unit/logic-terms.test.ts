import { describe, expect, it } from "vitest";
import { logicTermIssues } from "@/lib/learning/logic-terms";

describe("koşullu önerme dönüşüm adları", () => {
  it("doğru adları geçirir", () => {
    expect(logicTermIssues("p ⇒ q önermesinin karşıtı q ⇒ p, tersi ¬p ⇒ ¬q, karşıt tersi ise ¬q ⇒ ¬p biçimindedir.")).toEqual([]);
    expect(logicTermIssues("p ⇒ q’nun karşıtı q ⇒ p, tersi p′ ⇒ q′, karşıt tersi q′ ⇒ p′ biçimindedir.")).toEqual([]);
    expect(logicTermIssues("p ⇒ q koşullu önermesinin karşıt tersi ¬q ⇒ ¬p biçimindedir.")).toEqual([]);
  });
  it("q ⇒ p'yi 'ters' diye adlandırmayı yakalar", () => {
    const issues = logicTermIssues("p ⇒ q önermesinin tersi q ⇒ p olur.");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("karşıtı");
  });
  it("karşıt tersi ile tersini karıştırmayı yakalar", () => {
    expect(logicTermIssues("p ⇒ q için karşıt tersi ¬p ⇒ ¬q olur.")).toHaveLength(1);
    expect(logicTermIssues("p → q verilsin. Tersi: ¬q → ¬p")).toHaveLength(1);
  });
  it("formül sonra ad biçimini yakalar", () => {
    expect(logicTermIssues("q ⇒ p, p ⇒ q’nun tersidir.")).toHaveLength(1);
  });
  it("p ⇒ q geçmeyen metne dokunmaz", () => {
    expect(logicTermIssues("Fonksiyonun tersi f⁻¹ ile gösterilir.")).toEqual([]);
  });
});

import { gateItem } from "@/lib/content-pool/gate";

describe("havuz kapısı mantık terimi", () => {
  it("q ⇒ p'yi ters diye açıklayan soruyu reddeder", () => {
    const unit = { unitId: "u", choices: 5, outcomes: [{ code: "9.1.1.3", outcomeId: "o", limitations: [] }] };
    const result = gateItem(
      {
        outcome_code: "9.1.1.3",
        difficulty: "easy",
        stem: "p ⇒ q koşullu önermesinin tersi hangisidir? Aşağıdakilerden seçiniz.",
        choices: ["q ⇒ p", "¬p ⇒ ¬q", "¬q ⇒ ¬p", "p ∧ q", "p ∨ q"],
        answer: 0,
        explanation: "p ⇒ q önermesinin tersi q ⇒ p biçiminde yazılır, yerler değişir.",
      } as never,
      unit,
    );
    expect("reason" in result && result.reason).toMatch(/mantık terimi/);
  });
});

describe("logicTermIssues — açık temel önerme", () => {
  it("¬p ⇒ q önermesinin karşıtı q ⇒ ¬p doğrudur (p ⇒ q metinde geçse de)", async () => {
    const { logicTermIssues } = await import("@/lib/learning/logic-terms");
    const t = "p ⇒ q önermesinin karşıtı q ⇒ p dir. ¬p ⇒ q önermesinin karşıtı q ⇒ ¬p olur. p ⇒ ¬q'nun karşıt tersi q ⇒ ¬p olur.";
    expect(logicTermIssues(t)).toEqual([]);
  });
  it("açık temelde de yanlış ad yakalanır", async () => {
    const { logicTermIssues } = await import("@/lib/learning/logic-terms");
    expect(logicTermIssues("p ⇒ q verilsin. ¬p ⇒ q önermesinin karşıtı ¬q ⇒ p olur.").length).toBe(1);
    expect(logicTermIssues("p ⇒ q önermesinin karşıtı q ⇒ ¬p olur.").length).toBe(1);
    expect(logicTermIssues("p ⇒ q'nun tersi q ⇒ p olur.").length).toBe(1);
  });
});

describe("logicTermIssues — bileşik dönüşüm", () => {
  it("p ⇒ q'nun tersinin karşıtı ¬q ⇒ ¬p doğrudur; yanlışı yakalanır", () => {
    expect(logicTermIssues("p ⇒ q önermesinin tersinin karşıtı ¬q ⇒ ¬p olur.")).toEqual([]);
    expect(logicTermIssues("p ⇒ q önermesinin karşıtının tersi ¬q ⇒ ¬p olur.")).toEqual([]);
    expect(logicTermIssues("p ⇒ q önermesinin tersinin karşıtı q ⇒ p olur.").length).toBe(1);
  });
});
