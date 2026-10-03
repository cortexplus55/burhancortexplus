import { describe, expect, it } from "vitest";
import {
  examChatGreeting,
  examCountdownLine,
  examDaysLeft,
} from "@/lib/learning/exam-chat-context";

describe("examCountdownLine", () => {
  const prep = "Zemin Mekaniği Temelleri";

  it("says how many days are left", () => {
    // Referans ürünün açılışı: "… için 20 gün kaldı. Neye çalışmak istersin?"
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

  it("opens the exam chat with a greeting, not a separate title", () => {
    expect(examChatGreeting(prep, 7)).toBe(
      "Selam! Zemin Mekaniği Temelleri için 7 gün kaldı. Neye çalışmak istersin?",
    );
  });
});

describe("examDaysLeft", () => {
  // 1 Ekim 2026 01:30 Türkiye = 30 Eylül 22:30 UTC. Sunucu UTC'de; gün
  // sunucunun yerel saatiyle hesaplandığında sınav gününün ilk üç saatinde
  // sohbet "yarın" diyordu.
  const now = new Date("2026-09-30T22:30:00Z");

  it("counts from the Turkish calendar day, not the server's", () => {
    expect(examDaysLeft("2026-10-01", now)).toBe(0);
    expect(examDaysLeft("2026-10-02", now)).toBe(1);
    expect(examDaysLeft("2026-09-30", now)).toBe(-1);
  });

  it("greets exam day as today after midnight", () => {
    expect(examChatGreeting("Fizik", examDaysLeft("2026-10-01", now))).toContain("bugün");
  });

  it("has no count without a readable date", () => {
    expect(examDaysLeft(null, now)).toBeNull();
    expect(examDaysLeft("belki yarın", now)).toBeNull();
  });
});
