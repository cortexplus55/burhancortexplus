import { isAudienceSegmentId, type AudienceSegmentId } from "@/lib/marketing/landing-showcase";

/**
 * Kayıt ön seçimi (7 Kasım 2026): ana sayfadaki hedef kitle sekmesi `/kayit?hedef=…` ile gelir; sınıf ve hedef sınav
 * adımı ilgili seçenekleri önceden seçer ya da öne çıkarır, öğrenci yalnız doğrular.
 *
 * Seçilen değerler kayıt seçeneklerinin kendi etiketleridir (`GRADE_OPTIONS`, `GOAL_OPTIONS`); yeni bir alan yok.
 */
export type SignupPreset = {
  hedef: AudienceSegmentId;
  gradeLevel?: string;
  learningGoal: string;
  /** Öne çıkarılan sınıf çipleri (seçilmez, işaretlenir). */
  suggestedGrades: string[];
  /** Sınıf seçimine göre hedef değişir (YKS/LGS sekmesi: 8. sınıf → LGS, üstü → YKS). */
  goalForGrade?: (gradeLevel: string) => string | null;
};

const LISE_GRADES = ["9. sınıf", "10. sınıf", "11. sınıf", "12. sınıf"];

export function signupPresetFor(hedef: string | null | undefined): SignupPreset | null {
  const id = hedef?.trim().toLocaleLowerCase("tr");
  if (!isAudienceSegmentId(id)) return null;
  switch (id) {
    case "lise":
      return { hedef: id, learningGoal: "Okul sınavları", suggestedGrades: LISE_GRADES };
    case "yks-lgs":
      return {
        hedef: id,
        learningGoal: "YKS hazırlık",
        suggestedGrades: ["8. sınıf", ...LISE_GRADES, "Mezun"],
        goalForGrade: (gradeLevel) => {
          if (gradeLevel === "8. sınıf") return "LGS hazırlık";
          if (/^(9|10|11|12)\. sınıf$/.test(gradeLevel) || gradeLevel === "Mezun") return "YKS hazırlık";
          return null;
        },
      };
    case "universite":
      return { hedef: id, gradeLevel: "Üniversite", learningGoal: "Üniversite vize ve final", suggestedGrades: ["Üniversite"] };
    case "akademik":
      return { hedef: id, gradeLevel: "Mezun", learningGoal: "KPSS hazırlık", suggestedGrades: ["Mezun", "Üniversite"] };
  }
}
