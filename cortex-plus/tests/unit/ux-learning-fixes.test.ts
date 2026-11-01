import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { dedupePathLabels, isGradeOnlyLabel, withoutGradeParts } from "@/lib/learning/path-labels";
import { claimModalSlot, releaseModalSlot, resetModalSlot } from "@/lib/ui/modal-slot";

const read = (p: string) => readFileSync(p, "utf8");

describe("yol etiketleri", () => {
  it("ortak sınıf ön eki bir kez yazılır, yinelenen satır düşer", () => {
    expect(dedupePathLabels(["9. Sınıf · Kümeler", "9. Sınıf · Üçgenler", "9. Sınıf · Kümeler"])).toEqual({
      prefix: "9. Sınıf",
      items: ["Kümeler", "Üçgenler"],
    });
    expect(dedupePathLabels(["A · x", "B · y"]).prefix).toBeNull();
  });
  it("kart başlığı sınıf değil konu", () => {
    expect(isGradeOnlyLabel("9. Sınıf")).toBe(true);
    expect(isGradeOnlyLabel("Mantık")).toBe(false);
    expect(withoutGradeParts(["9. Sınıf", "Mantık"])).toEqual(["Mantık"]);
    expect(withoutGradeParts(["9. Sınıf"])).toEqual(["9. Sınıf"]);
  });
});

describe("tek pencere", () => {
  beforeEach(() => resetModalSlot());
  it("ikinci pencere yer bulamaz, ilki kapanınca açılır", () => {
    expect(claimModalSlot("streak")).toBe(true);
    expect(claimModalSlot("badge")).toBe(false);
    releaseModalSlot("streak");
    expect(claimModalSlot("badge")).toBe(true);
  });
});

describe("öğrenme ekranları kaynak denetimi", () => {
  it("öğretmen ekranında tek Plus kartı; halka/tempo yok", () => {
    const pm = read("src/components/marketing/plus-month.tsx");
    expect(pm).not.toContain("sınav ayı temposu");
    const chat = read("src/components/chat/chat-panel.tsx");
    expect(chat).toContain("showUpgrade && !(showParityEmpty && heroFooter)");
  });
  it("test: sabit eylem çubuğu, şık açıklaması çift noktalama üretmez, eylem görünür", () => {
    const play = read("src/components/parity/exam-quiz-play.tsx");
    expect(play).toContain("cp-quiz-action-bar");
    expect(play).not.toContain("<RichBody text={option} />:");
    expect(read("src/styles/parity-shell.css")).toMatch(/\.cp-quiz-action-bar \{[^}]*position: sticky[^}]*safe-area-inset-bottom/);
  });
  it("tema düğmesi hidrasyonda sunucuyla aynı çizer", () => {
    expect(read("src/components/theme-toggle.tsx")).toContain("useSyncExternalStore");
  });
  it("yıldız rozeti ne olduğunu söyler", () => {
    expect(read("src/components/parity/exam-lesson-steps.tsx")).toContain("Dersi bitirince ${lessonStars} yıldız kazanırsın");
  });
});
