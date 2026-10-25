import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXAM_TRACKS, WIZARD_STEP_ORDER, isExamTrack } from "@/lib/learning/exam-wizard-copy";
import { parseLearningPreferences } from "@/lib/learning/exam-prep-ui-path";
import { STUCK_PROCESSING_MS, isProcessingStuck } from "@/lib/documents/processing-stale";

describe("kurulum sınav türü, tarih ve takılı belge", () => {
  it("ilk adım ders kalır; tür çipleri ders adımındadır ve tercih olarak saklanır", () => {
    expect(WIZARD_STEP_ORDER[0]).toBe("subject");
    expect(EXAM_TRACKS.map((track) => track.label)).toEqual([
      "TYT",
      "AYT",
      "YKS (TYT+AYT)",
      "KPSS",
      "TUS",
      "LGS",
      "ALES",
      "Üniversite Vize/Final",
    ]);
    expect(isExamTrack("tus")).toBe(true);
    expect(isExamTrack("matematik")).toBe(false);
    expect(parseLearningPreferences({ examTrack: "kpss", language: "tr" }).examTrack).toBe("kpss");
    const wizard = readFileSync("src/components/parity/exam-create-wizard.tsx", "utf8");
    expect(wizard).toContain("EXAM_TRACKS");
    expect(wizard).toContain("DEFAULT_EXAM_LEAD_DAYS");
    expect(wizard).toContain("examTrack");
    const route = readFileSync("src/app/api/learning/exam-prep/create/route.ts", "utf8");
    expect(route).toContain("examTrack:");
  });

  it("beş dakikadır işlenen belge takılı sayılır", () => {
    const now = new Date("2026-10-25T12:00:00Z");
    const fresh = new Date(now.getTime() - 4 * 60 * 1000).toISOString();
    const stuck = new Date(now.getTime() - STUCK_PROCESSING_MS - 1000).toISOString();
    expect(isProcessingStuck("processing", fresh, now)).toBe(false);
    expect(isProcessingStuck("processing", stuck, now)).toBe(true);
    expect(isProcessingStuck("ready", stuck, now)).toBe(false);
    const list = readFileSync("src/app/dokumanlar/page.tsx", "utf8");
    const detail = readFileSync("src/app/dokumanlar/[documentId]/page.tsx", "utf8");
    expect(list).toContain("isProcessingStuck");
    expect(detail).toContain("autoOnce");
    expect(readFileSync("src/components/documents/document-retry-button.tsx", "utf8")).toContain("Yeniden Dene");
  });
});
