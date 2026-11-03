import { stripOptionLetters } from "@/lib/learning/option-text";
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
        // Kalite rubriği alanları (2 Kasım 2026, rubric.ts); eski kayıtlarda yok.
        steps: z.array(z.string().min(2).max(600)).max(8).optional(),
        worked_example: z.string().max(3000).optional(),
        common_mistakes: z.array(z.string().min(2).max(600)).max(5).optional(),
        ladder: z.object({ temel: z.string().max(600), orta: z.string().max(600), ileri: z.string().max(600) }).optional(),
        // Sınav pedagojik iskeleti (blueprint.ts); yalnız sınav türü programlarda, eski kayıtlarda yok.
        blueprint: z.unknown().optional(),
      }),
    )
    .min(1)
    .max(60),
  summary: z.string().min(20).max(4000),
  key_terms: z.array(z.object({ term: z.string().min(1).max(120), definition: z.string().min(2).max(600) })).max(20).optional(),
  cards: z.array(z.object({ front: z.string().min(1).max(300), back: z.string().min(1).max(600) })).min(1).max(80),
});
export type LessonBody = z.infer<typeof lessonSchema>;

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const itemSchema = z.object({
  outcome_code: z.string().min(1).max(40),
  difficulty: z.enum(DIFFICULTIES),
  stem: z.string().min(10).max(3000),
  // Harf imli şıklar ("A) …") kayda temiz girer (stripOptionLetters yalnız tüm şıklar sıralı imliyse dokunur).
  choices: z.preprocess(
    (v) => (Array.isArray(v) && v.every((e) => typeof e === "string") ? stripOptionLetters(v as string[]) : v),
    z.array(z.string().min(1).max(600)).min(4).max(5),
  ),
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
        /** v14 katman 3: her yanlış şıkkın somut yanlışlığı gösterildi mi (yoksa okunmadı). */
        distractors_ok: z.boolean().optional(),
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
export function missingCoverage(items: PoolItem[], outcomeCodes: string[], perPair = 1): string[] {
  const have = new Map<string, number>();
  for (const i of items) have.set(`${i.outcome_code.trim()}|${i.difficulty}`, (have.get(`${i.outcome_code.trim()}|${i.difficulty}`) ?? 0) + 1);
  return outcomeCodes.flatMap((code) =>
    DIFFICULTIES.flatMap((d) => Array.from({ length: Math.max(0, perPair - (have.get(`${code}|${d}`) ?? 0)) }, () => `${code}|${d}`)),
  );
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
            : r.distractors_ok === false
              ? "çeldirici kanıtı yok"
              : null;
    if (reason) rejected.push({ item, reason });
    else kept.push(item);
  });
  return { kept, rejected };
}
