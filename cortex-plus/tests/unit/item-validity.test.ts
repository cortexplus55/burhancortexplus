import { describe, expect, it } from "vitest";
import { detectLanguage, itemValidity, unseenReference } from "@/lib/learning/item-validity";
import { sourceHasMeasurableQuantities } from "@/lib/learning/source-quantities";
import math from "../fixtures/subjects/math-7.json";
import history from "../fixtures/subjects/history-10.json";
import circuit from "../fixtures/subjects/circuit-uni.json";
import kpss from "../fixtures/subjects/kpss-citizenship.json";
import chemistry from "../fixtures/subjects/chemistry.json";
import english from "../fixtures/subjects/english-grammar.json";

const subjects = [math, history, circuit, kpss, chemistry, english];

function mcq(text: string, extra: Partial<Parameters<typeof itemValidity>[0]> = {}) {
  return itemValidity({
    kind: "mcq",
    text,
    options: ["Doğru şık", "İkinci şık", "Üçüncü şık", "Dördüncü şık"],
    correct: ["Doğru şık"],
    ...extra,
  });
}

describe("item validity", () => {
  it("measures quantity from structure, not a subject list", () => {
    expect(sourceHasMeasurableQuantities(math.material)).toBe(true);
    expect(sourceHasMeasurableQuantities(circuit.material)).toBe(true);
    expect(sourceHasMeasurableQuantities(chemistry.material)).toBe(true);
    expect(sourceHasMeasurableQuantities(history.material)).toBe(false);
    expect(sourceHasMeasurableQuantities(kpss.material)).toBe(false);
    expect(sourceHasMeasurableQuantities(english.material)).toBe(false);
    expect(sourceHasMeasurableQuantities("1923 yılında ilan edildi")).toBe(false);
    expect(sourceHasMeasurableQuantities("kısa kenar 3 cm")).toBe(true);
  });

  it("rejects an empty stem", () => {
    expect(mcq("   ", { material: math.material }).issues).toContain("empty");
  });

  it("rejects a short stem", () => {
    expect(mcq("kısa mı", { material: history.material }).issues).toContain("short");
  });

  it("rejects duplicate options", () => {
    const verdict = mcq("Direnç değeri hangi ifadeyle bulunur?", {
      material: circuit.material,
      options: ["5 ohm", "5 ohm", "12 volt"],
      correct: ["5 ohm"],
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.issues).toContain("duplicate_options");
  });

  it("rejects broken text", () => {
    const verdict = mcq("Mol kütlesi kaç gramdır \uFFFD burada?", { material: chemistry.material });
    expect(verdict.issues).toContain("malformed");
  });

  it("rejects a missing correct option", () => {
    const verdict = mcq("Yasama organı hangi işi yapar burada?", {
      material: kpss.material,
      correct: ["listede yok"],
    });
    expect(verdict.issues).toContain("missing_correct");
  });

  it("rejects the other language when the source language is known", () => {
    const turkish = mcq("Bu sorunun doğru cevabı bir ve olan ifade değildir?", { material: english.material });
    expect(turkish.issues).toContain("wrong_language");
    const foreign = mcq("The subject and the verb is the wrong language here?", { material: math.material });
    expect(foreign.issues).toContain("wrong_language");
    expect(detectLanguage(english.material)).toBe("en");
    expect(detectLanguage(history.material)).toBe("tr");
  });

  it("rejects an unseen equation and keeps a plain which-of question", () => {
    expect(unseenReference("yukarıdaki denkleme göre sonuç kaçtır?")).toBe(true);
    expect(unseenReference("yukarıdaki denkleme göre sonuç kaçtır?", "V = I")).toBe(false);
    const unseen = mcq("yukarıdaki denkleme göre sonuç kaçtır şimdi?", { material: math.material });
    expect(unseen.issues).toContain("unseen_reference");
    const plain = mcq("Aşağıdakilerden hangisi bu madde için doğrudur?", { material: kpss.material });
    expect(plain.issues).not.toContain("unseen_reference");
    expect(plain.ok).toBe(true);
  });

  it("rejects markup and a hint label", () => {
    expect(mcq("Bu ifade ==vurgu== ile mi yazılır?", { material: history.material }).issues).toContain("markup");
    expect(mcq("Direnç sorusu burada mıdır? İpucu: beş", { material: circuit.material }).issues).toContain("hint");
  });

  it("rejects a true or false line that is still a question", () => {
    const verdict = itemValidity({
      kind: "true_false",
      text: "Bu ifade doğru mudur ve kaynakla uyumlu mudur?",
      material: chemistry.material,
    });
    expect(verdict.issues).toContain("short");
  });

  it("keeps a well formed item in every subject", () => {
    for (const subject of subjects) {
      const text =
        subject.language === "en"
          ? "Subject verb agreement is the right form and the answer is this?"
          : "Bu madde için doğru ifade hangisidir ve neden böyledir?";
      const options =
        subject.language === "en"
          ? ["The right form", "The wrong form", "Another form", "A fourth form"]
          : ["Doğru şık", "İkinci şık", "Üçüncü şık", "Dördüncü şık"];
      const verdict = mcq(text, { material: subject.material, options, correct: [options[0]!] });
      expect(verdict.ok, subject.id).toBe(true);
    }
  });
});
