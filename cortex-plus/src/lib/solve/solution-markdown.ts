import type { Solution } from "@/lib/solve/question-solver";

/*
  Çözümün sohbete kaydedilen metni (23 Ekim 2026). Sohbet yeniden açılınca bu metin görünür ve sonraki sorular
  ("2. adımı anlamadım") bunu bağlam olarak okur. Kartla aynı sıra: cevap, verilenler, adımlar, şıklar, karıştırılan
  nokta, akılda tut, kontrol.
*/
export function solutionAnswerLine(solution: Solution): string {
  const option = solution.options.find((o) => o.letter === solution.answer.letter);
  return solution.kind === "mcq" && option ? `${option.letter}) ${option.text}` : (solution.answer.value ?? solution.answer.text);
}

export function solutionMarkdown(solution: Solution, note?: string): string {
  const lines: string[] = [];
  const answer = solutionAnswerLine(solution);
  lines.push(`**Doğru cevap: ${answer}**`);
  if (solution.answer.text && solution.answer.text !== answer) lines.push(solution.answer.text);
  if (note) lines.push("", `_${note}_`);
  if (solution.intro) lines.push("", solution.intro);
  if (solution.given.length) lines.push("", "**Verilenler**", ...solution.given.map((g) => `- ${g}`));
  if (solution.asked) lines.push("", `**İstenen:** ${solution.asked}`);
  if (solution.steps.length) {
    lines.push("", "**Çözüm adımları**");
    solution.steps.forEach((step, index) => {
      const parts = [step.math ? `\`${step.math.replace(/`/g, "'")}\`` : "", step.say ?? ""].filter(Boolean);
      lines.push(`${index + 1}. ${parts.join(" — ")}`);
    });
  }
  if (solution.optionsWhy.length) {
    lines.push("", "**Şıklar**");
    for (const o of solution.optionsWhy) {
      const correct = o.correct || o.letter === solution.answer.letter;
      lines.push(`- ${correct ? "✓ " : ""}**${o.letter}** — ${o.why}`);
    }
  }
  if (solution.trap) lines.push("", `**Karıştırılan nokta:** ${solution.trap}`);
  if (solution.tip) lines.push("", `**Akılda tut:** ${solution.tip}`);
  if (solution.check) lines.push("", solution.check);
  return lines.join("\n").trim();
}

/** Sohbette öğrencinin satırı: fotoğrafın kendisi saklanmaz, okunan soru yazılır. */
export function solveUserLine(solution: Solution, note: string | undefined, photo: boolean): string {
  const head = photo ? (note ? `📷 Fotoğraftaki soru · ${note}` : "📷 Fotoğraftaki soru") : "";
  const question = solution.question.length > 600 ? `${solution.question.slice(0, 600)}…` : solution.question;
  const options = solution.options.map((o) => `${o.letter}) ${o.text}`).join("\n");
  return [head, question, options].filter(Boolean).join("\n");
}
