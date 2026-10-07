import { describe, expect, it } from "vitest";
import { displayUserText, istanbulDay, todayMoodFrom } from "@/lib/chat/chat-display";

describe("sohbet görünümü", () => {
  it("baştaki ders etiketi balondan silinir, başka köşeli parantez kalır", () => {
    expect(displayUserText("[Matematik] Pisagor nedir?")).toBe("Pisagor nedir?");
    expect(displayUserText("[Türk Dili ve Edebiyatı] Divan nedir?")).toBe("Divan nedir?");
    expect(displayUserText("[1] numaralı kaynağı açıkla")).toBe("[1] numaralı kaynağı açıkla");
    expect(displayUserText("Sadece soru")).toBe("Sadece soru");
    expect(displayUserText("a [Matematik] b")).toBe("a [Matematik] b");
  });

  it("ruh hali yalnızca kaydedildiği gün geçerli", () => {
    const today = "2026-10-01";
    expect(todayMoodFrom(JSON.stringify({ day: today, mood: "stressed" }), today)).toBe("stressed");
    expect(todayMoodFrom(JSON.stringify({ day: "2026-09-30", mood: "stressed" }), today)).toBe("neutral");
    expect(todayMoodFrom(JSON.stringify({ day: today, mood: "uykulu" }), today)).toBe("neutral");
    expect(todayMoodFrom("bozuk", today)).toBe("neutral");
    expect(todayMoodFrom(null, today)).toBe("neutral");
  });

  it("gün İstanbul saatine göre", () => {
    // 30 Eylül 22:30 UTC = 1 Ekim 01:30 İstanbul.
    expect(istanbulDay(new Date("2026-09-30T22:30:00Z"))).toBe("2026-10-01");
  });
});
