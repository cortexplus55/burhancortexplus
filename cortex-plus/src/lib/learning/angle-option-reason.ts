/**
 * Catch a common contradiction that a fluent explanation can hide:
 * describing π/2 as a full turn or 2π as 90 degrees. This deliberately
 * handles only unambiguous multiples of π; other subjects keep their
 * independent reviewer instead of being forced through a math heuristic.
 */
export function angleOptionReasonIssues(input: {
  text: string;
  options: string[];
  optionWhy?: string[];
}): string[] {
  if (!/(derece|radyan)/i.test(input.text) || !input.optionWhy) return [];
  const issues: string[] = [];
  input.options.forEach((option, index) => {
    const normalized = option.replace(/\s+/g, "").replace(/pi/gi, "π");
    const match = normalized.match(/^(\d+(?:[.,]\d+)?)?π(?:\/(\d+(?:[.,]\d+)?))?$/);
    if (!match) return;
    const denominator = Number((match[2] ?? "1").replace(",", "."));
    if (!denominator || denominator > 12) return;
    const degrees = 180 * Number((match[1] ?? "1").replace(",", ".")) / denominator;
    const reason = input.optionWhy?.[index] ?? "";
    if (!reason) return;
    const mentionedDegrees = [...reason.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:derece|°)/gi)]
      .map((part) => Number(part[1].replace(",", ".")));
    if (mentionedDegrees.some((value) => Math.abs(value - degrees) > 0.001)) {
      issues.push(`${option}: derece açıklaması şıkla çelişiyor.`);
    }
    const turns: [RegExp, number][] = [
      [/tam\s+(?:bir\s+)?(?:tur|dönüş)/i, 360],
      [/yarım\s+(?:tur|dönüş)/i, 180],
      [/çeyrek\s+(?:tur|dönüş)/i, 90],
    ];
    if (turns.some(([pattern, value]) => pattern.test(reason) && Math.abs(value - degrees) > 0.001)) {
      issues.push(`${option}: tur açıklaması şıkla çelişiyor.`);
    }
  });
  return issues;
}

/** A radian is a unit, not a fixed value such as π. Reject this vague stem. */
export function angleQuestionIssues(input: {
  text: string;
  correct: string[];
}): string[] {
  const stem = input.text.toLocaleLowerCase("tr-TR");
  const asksGenericRadianValue =
    /radyan(?:da|la|a)?\s+(?:cinsinden\s+)?(?:ifade|ölç|hesap)/u.test(stem) &&
    /hangi\s+(?:değer|sayı)/u.test(stem) &&
    !/\b\d+(?:[.,]\d+)?\s*(?:derece|°)/u.test(stem) &&
    !/\b(?:tam|yarım|çeyrek)\s+tur\b/u.test(stem);
  if (asksGenericRadianValue && input.correct.some((answer) => /^(?:\d+)?\s*π$/u.test(answer.trim()))) {
    return ["Radyan genel bir ölçü birimidir; belirsiz sorunun tek yanıtı π olamaz."];
  }
  return [];
}
