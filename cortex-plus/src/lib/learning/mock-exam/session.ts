/** Soru metni örtüşmesi ve doğru şık harf dengesi. */

const FOLD = (s: string) =>
  s
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

function tokens(text: string): Set<string> {
  return new Set(
    FOLD(text)
      .split(" ")
      .filter((t) => t.length >= 3),
  );
}

/** Jaccard benzerliği; ≥ 0.6 → aynı kavramı ölçüyor say. */
export function questionOverlapRatio(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;
  let inter = 0;
  for (const t of left) if (right.has(t)) inter += 1;
  const union = left.size + right.size - inter;
  return union ? inter / union : 0;
}

export function hasDuplicateConcept(
  questions: Array<{ text: string }>,
  threshold = 0.6,
): boolean {
  for (let i = 0; i < questions.length; i += 1) {
    for (let j = i + 1; j < questions.length; j += 1) {
      if (questionOverlapRatio(questions[i].text, questions[j].text) >= threshold) {
        return true;
      }
    }
  }
  return false;
}

export function filterOverlappingQuestions<T extends { text: string }>(
  questions: T[],
  threshold = 0.6,
): T[] {
  const kept: T[] = [];
  for (const q of questions) {
    if (kept.some((k) => questionOverlapRatio(k.text, q.text) >= threshold)) continue;
    kept.push(q);
  }
  return kept;
}

/**
 * Doğru şık harf dağılımı: aynı harf toplamın %40'ını geçemez.
 * options + correctAnswers ile A=0… indeksleri.
 */
export function letterBalanceOk(
  questions: Array<{ options: string[]; correctAnswers: string[] }>,
  maxShare = 0.4,
): boolean {
  const mcq = questions.filter(
    (q) => q.options.length >= 2 && q.correctAnswers.length === 1,
  );
  if (mcq.length < 5) return true;
  const counts = new Map<number, number>();
  for (const q of mcq) {
    const idx = q.options.findIndex((o) => o === q.correctAnswers[0]);
    if (idx < 0) continue;
    counts.set(idx, (counts.get(idx) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (!total) return true;
  return [...counts.values()].every((c) => c / total <= maxShare + 1e-9);
}

export function deadlinePassed(
  deadlineAt: string | null | undefined,
  now = Date.now(),
  graceSec = 120,
): boolean {
  if (!deadlineAt) return false;
  const end = new Date(deadlineAt).getTime();
  if (Number.isNaN(end)) return false;
  return now > end + graceSec * 1000;
}

export function remainingExamSeconds(
  deadlineAt: string | null | undefined,
  now = Date.now(),
): number {
  if (!deadlineAt) return 0;
  const end = new Date(deadlineAt).getTime();
  if (Number.isNaN(end)) return 0;
  return Math.max(0, Math.floor((end - now) / 1000));
}

export function examDeadlineFromDuration(
  durationMinutes: number,
  from = new Date(),
): { started_at: string; deadline_at: string } {
  const started = from;
  const deadline = new Date(started.getTime() + Math.max(1, durationMinutes) * 60_000);
  return {
    started_at: started.toISOString(),
    deadline_at: deadline.toISOString(),
  };
}
