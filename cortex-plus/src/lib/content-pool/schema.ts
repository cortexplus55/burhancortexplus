import { z } from "zod";

/** Model çıktısı: ünite anlatımı (her kazanım için bir bölüm), özet ve kartlar. Kaynak bağlantıları modelden gelmez. */
export const lessonSchema = z.object({
  title: z.string().min(2).max(200),
  overview: z.string().min(20).max(4000),
  sections: z
    .array(
      z.object({
        outcome_code: z.string().min(1).max(40),
        heading: z.string().min(2).max(200),
        explanation: z.string().min(40).max(8000),
        key_points: z.array(z.string().min(2).max(400)).min(1).max(12),
      }),
    )
    .min(1)
    .max(60),
  summary: z.string().min(20).max(4000),
  cards: z.array(z.object({ front: z.string().min(1).max(300), back: z.string().min(1).max(600) })).min(1).max(80),
});
export type LessonBody = z.infer<typeof lessonSchema>;

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const itemSchema = z.object({
  outcome_code: z.string().min(1).max(40),
  difficulty: z.enum(DIFFICULTIES),
  stem: z.string().min(10).max(3000),
  choices: z.array(z.string().min(1).max(600)).min(4).max(5),
  answer: z.number().int().min(0).max(4),
  explanation: z.string().min(10).max(3000),
});
export type PoolItem = z.infer<typeof itemSchema>;
export const itemsSchema = z.object({ items: z.array(itemSchema).min(1).max(200) });

export const reviewSchema = z.object({
  lesson_ok: z.boolean(),
  lesson_issues: z.array(z.string().max(400)).max(20).default([]),
  items: z
    .array(
      z.object({
        index: z.number().int().min(0),
        solved_answer: z.number().int().min(0).max(4),
        within_scope: z.boolean(),
        ok: z.boolean(),
        issue: z.string().max(400).optional().nullable(),
      }),
    )
    .max(200),
});
export type Review = z.infer<typeof reviewSchema>;

/** Kısa doğrulama çıktısı: [soru sırası, bağımsız çözüm (0 tabanlı), uyum 0/1]. */
export const compactReviewSchema = z.object({
  r: z.array(z.tuple([z.number().int().min(0), z.number().int().min(0).max(4), z.union([z.literal(0), z.literal(1)])])).max(200),
});

export type ShapeIssue = { code: string; detail: string };

/**
 * Kural denetimi (model yok): her kazanımın anlatımda bölümü var, her kazanım için üç zorlukta soru var,
 * seçenek sayısı doğru, cevap seçenekler içinde, seçenekler birbirinden farklı.
 */
export function checkShape(
  lesson: LessonBody,
  items: PoolItem[],
  outcomeCodes: string[],
  choices: number,
): { lessonIssues: ShapeIssue[]; validItems: PoolItem[]; itemIssues: ShapeIssue[] } {
  const lessonIssues: ShapeIssue[] = [];
  const covered = new Set(lesson.sections.map((s) => s.outcome_code.trim()));
  for (const code of outcomeCodes) if (!covered.has(code)) lessonIssues.push({ code, detail: "anlatımda bölüm yok" });
  const known = new Set(outcomeCodes);
  for (const s of lesson.sections)
    if (!known.has(s.outcome_code.trim())) lessonIssues.push({ code: s.outcome_code, detail: "kayıtta olmayan kazanım" });

  const itemIssues: ShapeIssue[] = [];
  const validItems = items.filter((item) => {
    const code = item.outcome_code.trim();
    const distinct = new Set(item.choices.map((c) => c.trim().toLocaleLowerCase("tr"))).size === item.choices.length;
    const problem = !known.has(code)
      ? "kayıtta olmayan kazanım"
      : item.choices.length !== choices
        ? `seçenek sayısı ${item.choices.length} (beklenen ${choices})`
        : item.answer >= item.choices.length
          ? "cevap seçeneklerin dışında"
          : !distinct
            ? "aynı seçenek iki kez"
            : null;
    if (problem) itemIssues.push({ code, detail: problem });
    return problem === null;
  });
  return { lessonIssues, validItems, itemIssues };
}

/** Kazanım × zorluk kapsaması: eksik olan çiftler. */
export function missingCoverage(items: PoolItem[], outcomeCodes: string[]): string[] {
  const have = new Set(items.map((i) => `${i.outcome_code.trim()}|${i.difficulty}`));
  return outcomeCodes.flatMap((code) => DIFFICULTIES.filter((d) => !have.has(`${code}|${d}`)).map((d) => `${code}|${d}`));
}

/**
 * Doğrulama çağrısının sonucunu uygular: bağımsız çözüm cevap anahtarıyla aynı, kazanım sınırları içinde ve
 * sorunsuz olan sorular kalır.
 */
export function applyReview(items: PoolItem[], review: Review): { kept: PoolItem[]; rejected: { item: PoolItem; reason: string }[] } {
  const byIndex = new Map(review.items.map((r) => [r.index, r]));
  const kept: PoolItem[] = [];
  const rejected: { item: PoolItem; reason: string }[] = [];
  items.forEach((item, index) => {
    const r = byIndex.get(index);
    const reason = !r
      ? "doğrulanmadı"
      : r.solved_answer !== item.answer
        ? "bağımsız çözüm farklı cevap buldu"
        : !r.within_scope
          ? "kazanım sınırı dışında"
          : !r.ok
            ? (r.issue ?? "doğrulayıcı reddetti")
            : null;
    if (reason) rejected.push({ item, reason });
    else kept.push(item);
  });
  return { kept, rejected };
}
