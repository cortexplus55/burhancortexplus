/**
 * Öğe öğe içerik (kart, doğru/yanlış, sözlü soru) için öğretmen döngüsü.
 * Taslak yedekli istenir; her öğe ayrı denetlenir; temiz öğeler kalır,
 * sorunlu öğeler modelin düzeltmesine gider. Kod öğe metnine dokunmaz.
 * Test motoru (teacher-quiz-run.ts) aynı akışı kendi içinde taşıyor.
 */

export type Reviewed<T> = { item: T; problems: string[] };

export async function teacherItemLoop<T>(options: {
  count: number;
  started: number;
  deadlineMs: number;
  maxFixRounds: number;
  /** Yedekli taslak; şema tutmazsa null. */
  draft: () => Promise<T[] | null>;
  /** Her öğe için yüksek sorunlar (yapı + model denetimi), aynı sırayla. */
  review: (items: T[]) => Promise<string[][]>;
  /** Yalnız sorunlu öğeler, aynı sayıda ve sırada düzeltilmiş döner; olmazsa null. */
  fix: (failing: Reviewed<T>[]) => Promise<T[] | null>;
}): Promise<{ items: T[]; rejected: Reviewed<T>[]; rounds: number }> {
  let draft = await options.draft();
  if (!draft) draft = await options.draft();
  if (!draft?.length) return { items: [], rejected: [], rounds: 0 };

  const classify = async (items: T[]) => {
    const problems = await options.review(items);
    return items.map((item, index) => ({ item, problems: problems[index] ?? [] }));
  };

  const first = await classify(draft);
  const good = first.filter((row) => !row.problems.length).map((row) => row.item);
  let bad = first.filter((row) => row.problems.length);
  let rounds = 0;
  while (
    good.length < options.count &&
    bad.length &&
    rounds < options.maxFixRounds &&
    Date.now() - options.started < options.deadlineMs
  ) {
    rounds += 1;
    const fixed = await options.fix(bad);
    if (!fixed?.length) break;
    const again = await classify(fixed);
    good.push(...again.filter((row) => !row.problems.length).map((row) => row.item));
    bad = again.filter((row) => row.problems.length);
  }
  return { items: good.slice(0, options.count), rejected: bad, rounds };
}

/** Denetçinin { issues: [{ item, severity, problem, fix }] } cevabını öğe sırasına göre toplar. */
export function issuesByItem(raw: unknown, count: number): string[][] {
  const out: string[][] = Array.from({ length: count }, () => []);
  const list = (raw as { issues?: unknown } | null)?.issues;
  if (!Array.isArray(list)) return out;
  for (const entry of list) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const index = typeof row.item === "number" ? row.item : Number(row.item);
    const problem = typeof row.problem === "string" ? row.problem.trim() : "";
    if (!problem || !Number.isInteger(index) || index < 0 || index >= count || row.severity === "low") continue;
    const fix = typeof row.fix === "string" && row.fix.trim() ? ` → ${row.fix.trim()}` : "";
    out[index].push(`${problem}${fix}`.slice(0, 400));
  }
  return out;
}
