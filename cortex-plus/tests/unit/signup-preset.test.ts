import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GOAL_OPTIONS, GRADE_OPTIONS } from "@/lib/parity/signup";
import { signupPresetFor } from "@/lib/parity/signup-preset";
import { curriculumFor } from "@/lib/learning/exam-catalog";

/*
  Kayıt ön seçimi (7 Kasım 2026): ana sayfanın hedef kitle sekmesi `/kayit?hedef=…` ile gelir; sınıf ve hedef sınav
  adımı ilgili seçenekleri önceden seçer ya da kesikli çerçeveyle öne çıkarır. Değerler kayıt seçeneklerinin kendi
  etiketleri; yeni alan yok.
*/
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("kayıt ön seçimi", () => {
  it("dört sekme dört ön seçim; bilinmeyen değer hiç", () => {
    const lise = signupPresetFor("lise")!;
    expect(lise.learningGoal).toBe("Okul sınavları");
    expect(lise.gradeLevel).toBeUndefined();
    expect(lise.suggestedGrades).toEqual(["9. sınıf", "10. sınıf", "11. sınıf", "12. sınıf"]);
    const yks = signupPresetFor("YKS-LGS")!;
    expect(yks.learningGoal).toBe("YKS hazırlık");
    expect(yks.goalForGrade?.("8. sınıf")).toBe("LGS hazırlık");
    expect(yks.goalForGrade?.("11. sınıf")).toBe("YKS hazırlık");
    expect(yks.goalForGrade?.("6. sınıf")).toBeNull();
    const uni = signupPresetFor("universite")!;
    expect(uni).toMatchObject({ gradeLevel: "Üniversite", learningGoal: "Üniversite vize ve final" });
    const akademik = signupPresetFor("akademik")!;
    expect(akademik).toMatchObject({ gradeLevel: "Mezun", learningGoal: "KPSS hazırlık" });
    expect(signupPresetFor("ortaokul")).toBeNull();
    expect(signupPresetFor(null)).toBeNull();
  });

  it("ön seçimdeki her değer kayıt seçeneklerinde var", () => {
    const goals = GOAL_OPTIONS.map((goal) => goal.label);
    for (const hedef of ["lise", "yks-lgs", "universite", "akademik"]) {
      const preset = signupPresetFor(hedef)!;
      expect(goals).toContain(preset.learningGoal);
      if (preset.gradeLevel) expect(GRADE_OPTIONS).toContain(preset.gradeLevel);
      for (const grade of preset.suggestedGrades) expect(GRADE_OPTIONS).toContain(grade);
    }
    expect(goals).toContain("LGS hazırlık");
  });

  it("'Üniversite' düzeyi: sabit ders listesi yok (ders adı kurulumda yazılır); eski düzeyler aynen", () => {
    expect(curriculumFor("Üniversite")).toEqual({ levelLabel: "Üniversite", items: [] });
    expect(curriculumFor("Mezun").items.length).toBeGreaterThan(0);
    expect(curriculumFor("10. sınıf").levelLabel).toBe("10. sınıf");
  });

  it("sihirbaz yalnız boş alanları doldurur; sınıf çipi hedefi sekmeye göre uyarlar; önerilen çip kesikli", () => {
    const wizard = read("src/app/kayit/signup-wizard.tsx");
    expect(wizard).toContain('signupPresetFor(searchParams.get("hedef"))');
    expect(wizard).toContain("gradeLevel: d.gradeLevel ?? preset.gradeLevel");
    expect(wizard).toContain("learningGoal: d.learningGoal ?? preset.learningGoal");
    expect(wizard).toContain("presetRef.current?.goalForGrade?.(g) ?? d.learningGoal");
    expect(wizard).toContain("suggested={suggestedGrades.includes(g)}");
    // e2e testleri `.grid-cols-3 button` ile ilk sınıf çipine tıklar: sınıf ızgarası bu sınıfı taşımaya devam eder.
    expect(wizard).toContain('className="grid grid-cols-3 gap-2 sm:grid-cols-5"');
    const css = read("src/styles/signup-wizard.css");
    expect(css).toContain('.signup-choice[data-suggested="true"]:not([data-selected="true"])');
  });
});
