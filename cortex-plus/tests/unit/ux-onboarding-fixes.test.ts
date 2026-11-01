import { describe, expect, it } from "vitest";
import { levelForExamLabel, sourceDisplayTitle } from "@/lib/curriculum/topic-map";
import { officialExamsForTrack } from "@/lib/curriculum/calendar";
import { EXAM_TRACKS, examTrackForGoal } from "@/lib/learning/exam-wizard-copy";
import { GOAL_OPTIONS } from "@/lib/parity/signup";
import { targetPlanHint } from "@/lib/learning/target-plan";
import { levelLabel } from "@/components/parity/official-curriculum-panel";
import { draftHasProgress } from "@/components/parity/exam-create-wizard";

describe("2 Kasım 2026 mobil denetim: kurulum", () => {
  it("sınav türleri sınıf düzeyine düşmez; etiket 'tus. sınıf' olmaz", () => {
    for (const k of ["ales", "dgs", "yds", "tus", "dus", "kpss", "lgs"]) {
      expect(levelForExamLabel(k.toUpperCase())).toBe(k);
      expect(levelLabel(k)).not.toMatch(/sınıf/);
    }
    expect(levelForExamLabel("TYT")).toBe("yks");
    expect(levelLabel("sinif-10")).toBe("10. sınıf");
  });

  it("kaynak adlarında iç kod ve dosya adı yok", () => {
    expect(sourceDisplayTitle("Öğretim Programı PID 2256")).toBe("Öğretim Programı (MEB)");
    expect(sourceDisplayTitle("1. Dönem Konu-Soru Dağılım Tablosu (matematik2.xlsx)")).not.toMatch(/xlsx/);
  });

  it("tarih adımı yalnız seçilen sınavın resmî tarihlerini gösterir", () => {
    const today = "2026-11-02";
    const tyt = officialExamsForTrack(today, "tyt");
    expect(tyt.length).toBeGreaterThan(0);
    expect(tyt.every((e) => e.exam === "TYT")).toBe(true);
    expect(officialExamsForTrack(today, "kpss").every((e) => e.exam === "KPSS")).toBe(true);
    expect(officialExamsForTrack(today, "uni")).toEqual([]);
    expect(officialExamsForTrack(today, null).length).toBeGreaterThan(1);
  });

  it("kayıttaki hedef sınav türünü önceden seçer", () => {
    expect(examTrackForGoal("YKS hazırlık")).toBe("yks");
    expect(examTrackForGoal("LGS hazırlık")).toBe("lgs");
    expect(examTrackForGoal("Okul sınavları")).toBeNull();
  });

  it("sınav ve hedef listeleri okul yolu sırasında, sade dilde", () => {
    expect(EXAM_TRACKS.map((t) => t.id)).toEqual(["lgs", "tyt", "ayt", "yks", "kpss", "ales", "tus", "uni"]);
    expect(GOAL_OPTIONS[0]!.label).toBe("Okul sınavları");
    for (const score of [55, 75, 95]) expect(targetPlanHint(score).badge).not.toMatch(/mevcut plan akışı|barajı aktif|kompakt/);
  });

  it("boş taslakta 'kaldığın yerden' bandı yok", () => {
    expect(draftHasProgress({ step: "subject", subject: "", materials: [] })).toBe(false);
    expect(draftHasProgress({ step: "date", subject: "Matematik", materials: [] })).toBe(true);
  });
});
