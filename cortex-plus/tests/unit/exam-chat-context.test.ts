import { describe, expect, it } from "vitest";
import { examCountdownLine } from "@/lib/learning/exam-chat-context";

describe("examCountdownLine", () => {
  const prep = "Zemin Mekaniği Temelleri";

  it("says how many days are left", () => {
    // Astra'nın açılışı: "… için 20 gün kaldı. Neye çalışmak istersin?"
    expect(examCountdownLine(prep, 20)).toBe(
      "Zemin Mekaniği Temelleri için 20 gün kaldı. Neye çalışmak istersin?",
    );
  });

  it("does not say '1 gün kaldı' when the exam is tomorrow", () => {
    // "1 gün kaldı" Türkçede bugünü de kastediyor gibi okunuyor.
    expect(examCountdownLine(prep, 1)).toContain("yarın");
    expect(examCountdownLine(prep, 1)).not.toContain("1 gün");
  });

  it("treats exam day and past exams separately", () => {
    expect(examCountdownLine(prep, 0)).toContain("bugün");
    expect(examCountdownLine(prep, -3)).toContain("geçti");
  });

  it("stays useful when there is no exam date", () => {
    expect(examCountdownLine(prep, null)).toBe("Zemin Mekaniği Temelleri için buradayım.");
  });
});
