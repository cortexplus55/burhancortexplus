/**
 * Açık uçlu rubrik (bütün dersler).
 *
 * 2-4 gözlenebilir ölçüt, kaynak noktalarından. Ölçüt etiketi öğrenciye yazılmaz.
 * Tam, kısmi ve yanlış çapa doğru sırada durmazsa rubrik yeniden kurulur.
 */

export type RubricRole = "definition" | "mechanism" | "example" | "condition";

export type OpenCriterion = {
  criterion: string;
  points: number;
  role: RubricRole;
};

const LABEL =
  /^(ana nokta|tanim|mekanizma|ornek|kosul|definition|mechanism|example|condition|exception|istisna)$/;

function fold(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/\s+/g, " ")
    .trim();
}

export function isRubricLabel(text: string): boolean {
  const folded = fold(text).replace(/[^a-z0-9 ]+/g, "").trim();
  return LABEL.test(folded);
}

function roleOf(text: string): RubricRole {
  const folded = fold(text);
  if (/\b(haric|degil|except|unless)\b/.test(folded)) return "condition";
  if (/\b(cunku|because)\b/.test(folded)) return "mechanism";
  if (/\b(ornegin|for example)\b/.test(folded)) return "example";
  return "definition";
}

function tokens(text: string): string[] {
  return fold(text)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
}

function numbers(text: string): string[] {
  return [...text.matchAll(/\d+(?:[.,]\d+)?/g)].map((match) => match[0].replace(",", "."));
}

function splitPoint(point: string): string[] {
  const parts = point
    .split(/\s*(?:[.;]|\bve\b|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3 && !isRubricLabel(part));
  if (parts.length >= 2) return parts.slice(0, 4);
  const words = point.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const mid = Math.ceil(words.length / 2);
    const left = words.slice(0, mid).join(" ");
    const right = words.slice(mid).join(" ");
    if (left !== point.trim() && right && left !== right) return [left, right];
  }
  return [point.trim()].filter((part) => part && !isRubricLabel(part));
}

function assignPoints(texts: string[], total: number): OpenCriterion[] {
  const list = texts.filter((text) => text.trim() && !isRubricLabel(text)).slice(0, 4);
  if (!list.length || total <= 0) return [];
  const count = Math.min(list.length, Math.max(1, total));
  const used = list.slice(0, count);
  const each = Math.floor(total / used.length);
  let extra = total - each * used.length;
  return used.map((criterion) => {
    const points = each + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
    return { criterion, points, role: roleOf(criterion) };
  });
}

export type OpenGrade = {
  earned: number;
  max: number;
  met: string[];
  missed: string[];
  fix: string;
};

/** Örtüşme: içerik sözcüklerinin yaklaşık %60'ı ya da ölçütteki sayıların hepsi. */
export function gradeOpenAnswer(answer: string, rubric: readonly { criterion: string; points: number }[]): OpenGrade {
  const rows = rubric.filter((row) => row.criterion.trim() && !isRubricLabel(row.criterion) && row.points > 0);
  const max = rows.reduce((sum, row) => sum + row.points, 0);
  const met: string[] = [];
  const missed: string[] = [];
  let earned = 0;
  const folded = fold(answer);
  for (const row of rows) {
    const need = tokens(row.criterion);
    const hit = need.filter((token) => folded.includes(token)).length;
    const nums = numbers(row.criterion);
    const numsOk = nums.length > 0 && nums.every((num) => numbers(answer).includes(num));
    const covered = (need.length > 0 && hit / need.length >= 0.6) || numsOk || (need.length === 0 && folded.includes(fold(row.criterion)));
    if (answer.trim() && covered) {
      met.push(row.criterion);
      earned += row.points;
    } else {
      missed.push(row.criterion);
    }
  }
  const fix = missed[0] ? `Eksik kalan noktayı kendi cümlenle ekle: ${missed[0]}` : "";
  return { earned, max, met, missed, fix };
}

function ordered(rubric: readonly { criterion: string; points: number }[]): boolean {
  if (rubric.length < 2) return false;
  const full = gradeOpenAnswer(rubric.map((row) => row.criterion).join(". "), rubric);
  const partial = gradeOpenAnswer(rubric[0]!.criterion, rubric);
  const wrong = gradeOpenAnswer("yok", rubric);
  return full.earned > partial.earned && partial.earned > wrong.earned;
}

/** Kaynak noktalarından rubrik. 2-4 hazır nokta olduğu gibi kalır. Çapalar sırayı bozarsa ölçütler bölünür. */
export function acceptRubric(points: readonly string[], total: number): OpenCriterion[] {
  const whole = points.map((point) => point.trim()).filter((point) => point && !isRubricLabel(point));
  if (whole.length >= 2) {
    const kept = assignPoints(whole.slice(0, 4), total);
    if (ordered(kept)) return kept;
  }
  const texts = whole.flatMap((point) => splitPoint(point)).filter((text) => !isRubricLabel(text));
  let rubric = assignPoints(texts, total);
  if (ordered(rubric)) return rubric;
  const rejoined = texts.join(" ");
  const words = rejoined.split(/\s+/).filter(Boolean);
  if (words.length >= 4) {
    const mid = Math.ceil(words.length / 2);
    rubric = assignPoints([words.slice(0, mid).join(" "), words.slice(mid).join(" ")], total);
    if (ordered(rubric)) return rubric;
  }
  if (words.length >= 2) {
    rubric = assignPoints([words[0]!, words.slice(1).join(" ")], total);
    if (ordered(rubric)) return rubric;
  }
  return rubric.filter((row) => !isRubricLabel(row.criterion));
}
