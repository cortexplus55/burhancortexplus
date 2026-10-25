import type { Solution } from "@/lib/solve/question-solver";

/**
 * Fotoğraftan çözümün Sokratik kalkanı mevcut çözüm alanlarından kurulur.
 * Motor çıktısı (çift çözüm + denetim) değişmez; ekran önce ipucu ve kavramı
 * gösterir, adımları ve cevabı öğrenci açınca açar.
 */
export function socraticHint(solution: Pick<Solution, "intro" | "asked" | "steps">): string {
  const intro = solution.intro.trim();
  if (intro) return intro;
  const first = solution.steps[0]?.say.trim();
  if (first) return first;
  return solution.asked.trim()
    ? `Önce sorunun ne istediğini netleştir: ${solution.asked.trim()}.`
    : "Sorunun hangi kavramı yokladığını düşün; cevabı henüz açma.";
}

export function socraticConcept(solution: Pick<Solution, "steps" | "tip" | "asked" | "subject">): string {
  const math = solution.steps.find((step) => step.math?.trim())?.math?.trim();
  if (math) return math;
  if (solution.tip.trim()) return solution.tip.trim();
  if (solution.asked.trim()) return solution.asked.trim();
  return solution.subject.trim() || "Bu sorunun kilit kavramı.";
}

export function solveDiscussPrompt(
  solution: Pick<Solution, "question" | "subject" | "answer" | "steps" | "trap">,
): string {
  const subject = solution.subject.trim() ? `${solution.subject.trim()}: ` : "";
  const question = solution.question.trim().slice(0, 500);
  const answer = (solution.answer.text || solution.answer.value || solution.answer.letter || "").trim().slice(0, 200);
  const steps = (solution.steps ?? [])
    .slice(0, 4)
    .map((step, i) => `${i + 1}. ${[step.title, step.math, step.say].filter(Boolean).join(" — ")}`)
    .join("\n")
    .slice(0, 600);
  const trap = solution.trap?.trim() ? `Dikkat: ${solution.trap.trim().slice(0, 160)}` : "";
  return [
    `Bu soruyu birlikte tartışalım. ${subject}${question}`,
    answer ? `Çözümün sonucu: ${answer}` : "",
    steps ? `Adımlar:\n${steps}` : "",
    trap,
    "Anlamadığım yeri soracağım; benzer bir soru da sor, cevabı bende kalsın.",
  ]
    .filter(Boolean)
    .join("\n");
}

export const SOLVE_DISCUSS_STORAGE_KEY = "cortex-entry-prompt";
