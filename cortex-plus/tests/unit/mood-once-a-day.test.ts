import { readFileSync } from "node:fs";
import { readSource } from "./helpers/node-sources";
import { describe, expect, it } from "vitest";
import { moodAskedSince, openingStage } from "@/lib/learning/lesson-open";

/*
  19 Ekim 2026, ürün sahibinin kararı: ruh hali günde bir kez sorulur. Astra'da bu kart yok;
  bizde her etkinlikten önce çıkıyordu ve derste "ruh hali → önerilen ders" iki onay kartı art
  arda geliyordu. Bugün cevap verildiyse kart atlanır, o cevap kayda yine yazılır.
*/
describe("ruh hali günde bir kez", () => {
  it("Türkiye gününün başı: UTC 21:00 önceki gün", () => {
    expect(moodAskedSince(new Date("2026-10-19T09:30:00Z"))).toBe("2026-10-18T21:00:00.000Z");
    // Türkiye'de 00:30 (UTC 21:30): yeni gün başlamış.
    expect(moodAskedSince(new Date("2026-10-18T21:30:00Z"))).toBe("2026-10-18T21:00:00.000Z");
    // Türkiye'de 23:59 (UTC 20:59): hâlâ o gün.
    expect(moodAskedSince(new Date("2026-10-18T20:59:00Z"))).toBe("2026-10-17T21:00:00.000Z");
  });

  it("açılış ekranı: aşinalık yoksa aşinalık; bugün ruh hali varsa doğrudan sonraki kart", () => {
    expect(openingStage("lesson", { familiarityKnown: false, moodToday: true })).toBe("familiarity");
    expect(openingStage("lesson", { familiarityKnown: true, moodToday: false })).toBe("mood");
    // 30 Ekim 2026: öneri kartı kalktı, açılış doğrudan kurulum kartı.
    expect(openingStage("lesson", { familiarityKnown: true, moodToday: true })).toBe("setup");
    expect(openingStage("quiz", { familiarityKnown: true, moodToday: true })).toBe("setup");
    expect(openingStage("podcast", { familiarityKnown: true, moodToday: true })).toBe("setup");
  });

  it("sayfa bugünkü cevabı okur; ekran onu kullanır ve ısınma öneri kartında da başlar", () => {
    const page = readSource("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx");
    expect(page).toContain('.from("study_session_moods")');
    expect(page).toContain('.gte("created_at", moodAskedSince())');
    expect(page).toContain("todayMood={todayMood}");
    const session = readSource("src/components/parity/exam-node-session.tsx");
    expect(session).toContain("useState<Mood>(todayMood ?? DEFAULT_MOOD)");
    expect(session).toContain("moodToday: Boolean(todayMood)");
    expect(session).toContain('stage !== "setup"');
  });
});
