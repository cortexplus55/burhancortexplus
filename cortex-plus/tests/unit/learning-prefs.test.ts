import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dailyGoalLabel, parseTutorVoice, streakRecordLine } from "@/lib/student/learning-prefs";
import { pickVoiceFor } from "@/lib/learning/studio-speech";

/*
  Astra'nın Ayarlar > Öğrenme tercihleri sekmesi ve seri penceresi
  (1 Ekim 2026): günlük hedef, rekor metni, öğretmen sesi.
*/
describe("öğrenme tercihleri", () => {
  it("rekorun gerisindeyken Astra gibi kalan gün yazılır", () => {
    // Astra: en uzun 3, şu an 0 → "Rekoru kırmana 4 gün daha var".
    expect(streakRecordLine(0, 3)).toBe("Rekoru kırmana 4 gün daha var");
    expect(streakRecordLine(2, 4)).toBe("Rekoru kırmana 3 gün daha var");
    expect(streakRecordLine(4, 4)).toBe("Rekorundasın");
    expect(streakRecordLine(0, 0)).toBe("Rekorunu bugün başlat");
  });

  it("günlük hedef dakika olarak yazılır", () => {
    expect(dailyGoalLabel(12.7, 30)).toBe("12 / 30 dk");
    expect(dailyGoalLabel(-3, 45)).toBe("0 / 45 dk");
  });

  it("öğretmen sesi cihazdaki Türkçe sesten cinsiyete göre seçilir", () => {
    const voices = [
      { lang: "en-US", name: "Google US English" },
      { lang: "tr-TR", name: "Microsoft Tolga - Turkish (Turkey)" },
      { lang: "tr-TR", name: "Microsoft Seda - Turkish (Turkey)" },
    ];
    expect(pickVoiceFor(voices, "male")).toBe(1);
    expect(pickVoiceFor(voices, "female")).toBe(2);
    expect(pickVoiceFor([{ lang: "tr-TR", name: "Google Türkçe" }], "male")).toBe(0);
    expect(pickVoiceFor([{ lang: "en-US", name: "x" }], "female")).toBe(-1);
    expect(parseTutorVoice("robot")).toBe("female");
  });

  it("göç dakika hedefini ve üç tercihi ekliyor; eski bağlantı pencereyi açıyor", () => {
    const migration = "supabase/migrations/20261001100000_learning_preferences.sql";
    expect(existsSync(migration)).toBe(true);
    const sql = readFileSync(migration, "utf8");
    expect(sql).toContain("show_suggestions");
    expect(sql).toContain("readable_font");
    expect(sql).toContain("tutor_voice");
    expect(sql).toContain("BETWEEN 5 AND 240");
    expect(readFileSync("src/app/profil/duzenle/page.tsx", "utf8")).toContain('redirect("/profil?dialog=profile")');
    expect(readFileSync("src/components/chat/chat-panel.tsx", "utf8")).toContain("lastIsAnswer && showSuggestions");
  });
});
