import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deterministicFactConflicts } from "@/lib/learning/oral-fact-check";
import math from "../fixtures/subjects/math-7.json";
import history from "../fixtures/subjects/history-10.json";
import circuit from "../fixtures/subjects/circuit-uni.json";
import kpss from "../fixtures/subjects/kpss-citizenship.json";
import chemistry from "../fixtures/subjects/chemistry.json";
import english from "../fixtures/subjects/english-grammar.json";

type Reject = { answer: string; correctIncludes: string; correctExcludes?: string };
type Checks = { source: string; accept: string[]; reject: Reject[] };

const subjects: { id: string; checks: Checks }[] = [
  { id: "math-7", checks: math.checks as Checks },
  { id: "history-10", checks: history.checks as Checks },
  { id: "circuit-uni", checks: circuit.checks as Checks },
  { id: "kpss-citizenship", checks: kpss.checks as Checks },
  { id: "chemistry", checks: chemistry.checks as Checks },
  { id: "english-grammar", checks: english.checks as Checks },
];

function conflicts(source: string, answer: string) {
  return deterministicFactConflicts(source, [{ index: 0, answer }]).get(0) ?? [];
}

describe("aynı olgu kapısı", () => {
  it.each(subjects)("$id: eşdeğer ifade çelişmez, başka olgu çelişir", (subject) => {
    for (const answer of subject.checks.accept) {
      expect(conflicts(subject.checks.source, answer), answer).toEqual([]);
    }
    for (const row of subject.checks.reject) {
      const found = conflicts(subject.checks.source, row.answer);
      expect(found.length, row.answer).toBeGreaterThan(0);
      expect(found[0]!.correct).toContain(row.correctIncludes);
      if (row.correctExcludes) expect(found[0]!.correct.toLocaleLowerCase("tr")).not.toContain(row.correctExcludes);
    }
  });

  it("birim dönüşümü aynı değerdir", () => {
    expect(conflicts("Ölçülen değer 5 mW olur.", "Ölçülen değer 0,005 W")).toEqual([]);
  });

  it("değişmez ile artar çelişir", () => {
    const found = conflicts("Ölçü sabit kalır.", "Ölçü artar.");
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]!.correct).toContain("sabit");
  });
});

describe("yeni dosyalarda ders dalı yok", () => {
  const banned =
    /hücre|mitoz|mayoz|mitokondri|kromozom|fotosentez|enzim|biyoloji|kimya|matematik|anayasa|pediatri|kpss|osmanlı|vatandaşlık|\btyt\b|\bayt\b|\byds\b|\btus\b|\bdna\b|\brna\b|\batp\b/i;
  const files = [
    "src/lib/learning/same-fact.ts",
    "src/lib/learning/unit-expect.ts",
    "src/lib/learning/solution-plan.ts",
    "src/lib/learning/open-rubric.ts",
    "src/lib/learning/oral-fact-check.ts",
  ];

  it("kod ve istem ders adı taşımaz", () => {
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(banned);
    }
  });
});
