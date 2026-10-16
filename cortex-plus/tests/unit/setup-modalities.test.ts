import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseLearningPreferences } from "@/lib/learning/exam-prep-ui-path";
import { STUDY_MODALITY_CHOICES, WIZARD_COPY } from "@/lib/learning/exam-wizard-copy";
import { recommendedStudyTool } from "@/lib/learning/study-tools";

/*
  17 Ekim 2026, Astra ile yan yana: kurulumun "Nasıl çalışmayı seversin?" adımı Astra'da
  çoklu seçim, her seçeneğin altında açıklama (Okuyarak / Dinleyerek / İzleyerek / Pratik
  yaparak). Bizde tek seçimliydi, "Sen karar ver" vardı ve seçim kaydedildiği hâlde hiçbir
  yerde kullanılmıyordu ("bu tercihe göre sıralanır" diyordu).
*/
describe("kurulum: nasıl çalışmayı seversin", () => {
  it("dört seçenek, her birinin açıklaması var; 'Sen karar ver' yok", () => {
    expect(STUDY_MODALITY_CHOICES.map((item) => item.label)).toEqual(["Okuyarak", "Dinleyerek", "İzleyerek", "Pratik yaparak"]);
    expect(STUDY_MODALITY_CHOICES.every((item) => item.blurb.length > 8)).toBe(true);
    expect(WIZARD_COPY.modalityLead).toContain("Birden çok seçebilirsin");
    expect(WIZARD_COPY.focusLead).toContain("biraz daha fazla zaman");
    const wizard = readFileSync("src/components/parity/exam-create-wizard.tsx", "utf8");
    expect(wizard).toContain('role="checkbox"');
    expect(wizard).not.toContain("Ders, podcast ve pratik bu tercihe göre sıralanır.");
  });

  it("çoklu seçim kaydedilir; eski tek seçimli kayıt da liste olarak okunur", () => {
    expect(parseLearningPreferences({ modality: "listening", modalities: ["listening", "practice", "bogus"] }).modalities).toEqual([
      "listening",
      "practice",
    ]);
    expect(parseLearningPreferences({ modality: "reading" }).modalities).toEqual(["reading"]);
    expect(parseLearningPreferences({ modality: "auto" }).modalities).toEqual([]);
    for (const route of ["create", "intake", "settings"]) {
      const source = readFileSync(`src/app/api/learning/exam-prep/${route}/route.ts`, "utf8");
      expect(source).toContain('modalities: z.array(z.enum(["reading", "listening", "watching", "practice"])).max(4).optional(),');
    }
  });

  it("eski taslak açılınca seçim kaybolmaz", () => {
    // Eski taslakta tek seçim ("modality") vardı; yenisinde liste. İkisi de okunur.
    const source = readFileSync("src/lib/learning/exam-wizard-draft.ts", "utf8");
    expect(source).toContain("modalities: Array.isArray(parsed.modalities)");
    const wizard = readFileSync("src/components/parity/exam-create-wizard.tsx", "utf8");
    expect(wizard).toContain('const list = draft.modalities ?? (draft.modality === "auto" ? [] : [draft.modality]);');
  });

  it("seçim 'Önerilen' rozetini yönlendirir", () => {
    const nodes = [
      { kind: "lesson", status: "pending", sortOrder: 1 },
      { kind: "podcast", status: "pending", sortOrder: 2 },
      { kind: "quiz", status: "pending", sortOrder: 3 },
    ];
    expect(recommendedStudyTool(nodes)?.id).toBe("lesson");
    expect(recommendedStudyTool(nodes, ["listening"])?.id).toBe("podcast");
    expect(recommendedStudyTool(nodes, ["reading", "listening"])?.id).toBe("lesson");
    expect(recommendedStudyTool(nodes, ["practice"])?.id).toBe("quiz");
    const hub = readFileSync("src/components/parity/exam-prep-home.tsx", "utf8");
    expect(hub).toContain("preferred={settings?.preferences.modalities ?? []}");
  });
});
