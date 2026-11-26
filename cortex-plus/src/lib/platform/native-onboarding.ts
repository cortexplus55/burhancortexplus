/**
 * Mobil uygulamanın açılış akışı, 1. adım: seviye ve sınav (26 Kasım 2026, Aşama 1). Saf.
 *
 * Dört grup ve her grubun kesin seçimleri. Her seçim profildeki bildiğimiz iki alana yazılır: sınıf
 * (`profiles.grade_level`, kayıttaki `GRADE_OPTIONS`) ve hedef (`learning_goals.goal_text`, kayıttaki `GOAL_OPTIONS`
 * etiketi). Öğretmen, ders ve test bu iki alandan seviyeyi okur (`student-pedagogy.ts`); yeni alan açılmaz.
 */

export type LevelGroupId = "ortaokul" | "lise" | "universite" | "uzmanlik";

export type LevelChoice = {
  id: string;
  label: string;
  gradeLevel: string;
  learningGoal: string;
};

export type LevelGroup = {
  id: LevelGroupId;
  title: string;
  hint: string;
  choices: LevelChoice[];
};

const SCHOOL_GOAL = "Okul sınavları";

export const LEVEL_GROUPS: readonly LevelGroup[] = [
  {
    id: "ortaokul",
    title: "Ortaokul / LGS",
    hint: "5–8. sınıf",
    choices: [
      { id: "5", label: "5. sınıf", gradeLevel: "5. sınıf", learningGoal: SCHOOL_GOAL },
      { id: "6", label: "6. sınıf", gradeLevel: "6. sınıf", learningGoal: SCHOOL_GOAL },
      { id: "7", label: "7. sınıf", gradeLevel: "7. sınıf", learningGoal: SCHOOL_GOAL },
      { id: "8", label: "8. sınıf · LGS", gradeLevel: "8. sınıf", learningGoal: "LGS hazırlık" },
    ],
  },
  {
    id: "lise",
    title: "Lise / YKS",
    hint: "9–12. sınıf ve mezun",
    choices: [
      { id: "9", label: "9. sınıf", gradeLevel: "9. sınıf", learningGoal: SCHOOL_GOAL },
      { id: "10", label: "10. sınıf", gradeLevel: "10. sınıf", learningGoal: SCHOOL_GOAL },
      { id: "11", label: "11. sınıf · YKS", gradeLevel: "11. sınıf", learningGoal: "YKS hazırlık" },
      { id: "12", label: "12. sınıf · YKS", gradeLevel: "12. sınıf", learningGoal: "YKS hazırlık" },
      { id: "mezun", label: "Mezun · YKS", gradeLevel: "Mezun", learningGoal: "YKS hazırlık" },
    ],
  },
  {
    id: "universite",
    title: "Üniversite",
    hint: "Vize ve final",
    choices: [{ id: "universite", label: "Üniversite", gradeLevel: "Üniversite", learningGoal: "Üniversite vize ve final" }],
  },
  {
    id: "uzmanlik",
    title: "KPSS / TUS / Uzmanlık",
    hint: "Mezunlar ve uzmanlık sınavları",
    choices: [
      { id: "kpss", label: "KPSS", gradeLevel: "Mezun", learningGoal: "KPSS hazırlık" },
      { id: "ales", label: "ALES", gradeLevel: "Mezun", learningGoal: "ALES hazırlık" },
      { id: "tus", label: "TUS", gradeLevel: "Mezun", learningGoal: "TUS hazırlık" },
    ],
  },
];

export function levelGroup(id: string | null | undefined): LevelGroup | null {
  return LEVEL_GROUPS.find((group) => group.id === id) ?? null;
}

/** Seçimin profil karşılığı; grup ya da seçim tanınmazsa null. */
export function resolveLevelChoice(groupId: string, choiceId: string): LevelChoice | null {
  return levelGroup(groupId)?.choices.find((choice) => choice.id === choiceId) ?? null;
}

/** Profildeki sınıf ve hedeften ön seçim (kayıtta seçilmiş olabilir). Eşleşmezse null. */
export function preselectLevel(
  gradeLevel: string | null | undefined,
  learningGoal: string | null | undefined,
): { groupId: LevelGroupId; choiceId: string } | null {
  const grade = (gradeLevel ?? "").trim();
  const goal = (learningGoal ?? "").trim();
  if (!grade && !goal) return null;
  for (const group of LEVEL_GROUPS) {
    const exact = group.choices.find((choice) => choice.gradeLevel === grade && choice.learningGoal === goal);
    if (exact) return { groupId: group.id, choiceId: exact.id };
  }
  for (const group of LEVEL_GROUPS) {
    const byGoal = goal ? group.choices.find((choice) => choice.learningGoal === goal && choice.learningGoal !== SCHOOL_GOAL) : null;
    if (byGoal) return { groupId: group.id, choiceId: byGoal.id };
  }
  for (const group of LEVEL_GROUPS) {
    const byGrade = group.choices.find((choice) => choice.gradeLevel === grade);
    if (byGrade) return { groupId: group.id, choiceId: byGrade.id };
  }
  return null;
}
