import { describe, expect, it } from "vitest";
import { syllabusWeightLine, visibleProbe } from "@/lib/learning/oral-exam";
import { expectsUnit } from "@/lib/learning/unit-expect";

const probe = {
  persona: "helpful" as const,
  alreadyProbed: false,
};

describe("birim yoklaması", () => {
  it("yıl ve sayım için birim sormaz", () => {
    expect(
      visibleProbe({ ...probe, answer: "1453", probeKind: "detail", expected: "29 Mayıs 1453" })?.question,
    ).not.toBe("Birimi ne?");
    expect(visibleProbe({ ...probe, answer: "3", probeKind: "detail", expected: "3" })?.question).not.toBe("Birimi ne?");
    expect(visibleProbe({ ...probe, answer: "madde 10", probeKind: "detail", expected: "madde 10" })?.question).not.toBe(
      "Birimi ne?",
    );
  });

  it("eksik gerilim ya da güç için birim sorar", () => {
    expect(visibleProbe({ ...probe, answer: "12", probeKind: "detail", expected: "12 V", persona: "strict" })?.question).toBe(
      "Birimi ne?",
    );
    expect(visibleProbe({ ...probe, answer: "4", probeKind: "detail", expected: "4 W" })?.question).toBe("Birimi ne?");
    expect(visibleProbe({ ...probe, answer: "4 W", probeKind: "detail", expected: "4 W" })?.question).not.toBe("Birimi ne?");
  });

  it("beklenen boşsa eski birim yoklaması durur", () => {
    expect(visibleProbe({ ...probe, answer: "18", probeKind: "unit", persona: "strict" })?.question).toBe("Birimi ne?");
  });

  it("iç ağırlık etiketi modele yazılmaz", () => {
    const line = syllabusWeightLine([
      { title: "Birinci başlık", emphasis: "core" },
      { title: "İkinci başlık", emphasis: "support" },
      { title: "Üçüncü başlık", emphasis: "skim" },
    ]);
    expect(line).toContain("Birinci başlık");
    expect(line).toContain("İkinci başlık");
    expect(line).not.toMatch(/\(core\)|\(support\)|\(skim\)/);
  });
});

describe("birim biçimi", () => {
  it("yıl, madde, oran ve sayım birim değildir", () => {
    expect(expectsUnit("12 V")).toBe(true);
    expect(expectsUnit("4 W")).toBe(true);
    expect(expectsUnit("%40")).toBe(true);
    expect(expectsUnit("1453")).toBe(false);
    expect(expectsUnit("madde 10")).toBe(false);
    expect(expectsUnit("3")).toBe(false);
    expect(expectsUnit("2/3")).toBe(false);
    expect(expectsUnit("64/16")).toBe(false);
    expect(expectsUnit("3 öğrenci")).toBe(false);
    expect(expectsUnit("5 adet")).toBe(false);
  });
});
