import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  reviewAccuracyByStep,
  summarizeQuality,
  summarizeRatings,
  weakestReviewTopics,
} from "@/lib/admin/learning-signals";
import { lessonJudgeText, parseJudgeVerdict, QUALITY_JUDGE_SYSTEM } from "@/lib/learning/lesson-quality-judge";
import type { LessonV3 } from "@/lib/learning/lesson-v3";

/*
  Gerçek öğrenme ölçüleri (23 Ekim 2026, ürün sahibinin kararı): tekrar doğruluğu basamak basamak, ders sonu anketi,
  günlük kalite örneği. Kör ölçüm yapay zekâ yargıçlarıyla "hangisi iyi anlatıyor"u söylüyordu; bunlar canlı veriden
  "öğrenci gerçekten öğreniyor mu"yu söyler.
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("tekrar doğruluğu", () => {
  const rows = [
    { step: 0, correct: false, topic_label: "Kuvvetler ayrılığı" },
    { step: 0, correct: true, topic_label: "Kuvvetler ayrılığı" },
    { step: 1, correct: true, topic_label: "Kuvvetler ayrılığı" },
    { step: 1, correct: true, topic_label: "YSK" },
    { step: 2, correct: false, topic_label: "YSK" },
    ...Array.from({ length: 5 }, (_, i) => ({ step: 0, correct: i === 0, topic_label: "Persentil" })),
  ];

  it("basamak basamak doğru oranı; cevap yoksa veri yok", () => {
    const steps = reviewAccuracyByStep(rows);
    expect(steps.map((step) => [step.label, step.correct, step.answered])).toEqual([
      ["1. gün", 2, 7],
      ["3. gün", 2, 2],
      ["7. gün", 0, 1],
      ["14. gün", 0, 0],
    ]);
    expect(steps[3]!.share).toBeNull();
  });

  it("en zayıf konular yalnız yeterli cevabı olanlardan, en düşük oran önce", () => {
    expect(weakestReviewTopics(rows, 3).map((topic) => [topic.topic, topic.correct, topic.answered])).toEqual([
      ["Persentil", 1, 5],
      ["Kuvvetler ayrılığı", 2, 3],
    ]);
  });
});

describe("ders anketi", () => {
  it("dağılım ve anlaşılmadı payı", () => {
    const summary = summarizeRatings([
      { rating: "great", kind: "lesson", title: "a" },
      { rating: "great", kind: "lesson", title: "b" },
      { rating: "confusing", kind: "lesson", title: "c" },
      { rating: "other", kind: "quiz", title: "d" },
    ]);
    expect(summary.total).toBe(4);
    expect(summary.great).toBe(0.5);
    expect(summary.unclear).toBe(0.5);
    expect(summarizeRatings([]).unclear).toBeNull();
  });
});

describe("günlük kalite örneği", () => {
  it("yargıcın altı puanı 0-100 toplama çevrilir; eksik ya da aralık dışı puan reddedilir", () => {
    const ok = parseJudgeVerdict({ scores: { clarity: 8, why: 5, examples: 6, noRepetition: 7, questions: 6, retention: 4 }, worst: "Neden yok." });
    expect(ok?.total).toBe(60);
    expect(ok?.worst).toBe("Neden yok.");
    expect(parseJudgeVerdict({ scores: { clarity: 8 } })).toBeNull();
    expect(parseJudgeVerdict({ scores: { clarity: 11, why: 5, examples: 6, noRepetition: 7, questions: 6, retention: 4 } })).toBeNull();
    expect(QUALITY_JUDGE_SYSTEM).toContain("noRepetition");
  });

  it("yargıç dersi öğrencinin gördüğü sırayla okur; cevap anahtarı dahil", () => {
    const lesson = {
      format: 3,
      title: "YSK",
      overview: "Seçim kararlarını kim verir?",
      screens: [
        {
          heading: "Yüksek Seçim Kurulu",
          concept: "YSK",
          blocks: [
            { type: "text", text: "YSK kararları kesindir." },
            { type: "note", note: { title: "Neden böyle?: Kesinlik neden önemli?", body: "Seçim takvimi gecikmesin.", tone: "general" } },
            { type: "check", check: { type: "mcq", prompt: "YSK kararlarına karşı hangi yol açıktır?", options: ["Yok", "AYM", "Danıştay", "Yargıtay"], answerIndex: 0, explanation: "x" } },
          ],
        },
      ],
      summary: ["YSK kararları kesindir."],
    } as unknown as LessonV3;
    const text = lessonJudgeText(lesson);
    expect(text.indexOf("YSK kararları kesindir.")).toBeLessThan(text.indexOf("Neden böyle?"));
    expect(text).toContain("doğru: Yok");
    expect(text).toContain("## Özet");
  });

  it("özet ortalamaları ve son örnekler", () => {
    const summary = summarizeQuality([
      { source: "judge", total: 60, topic_label: "YSK", note: "Neden yok.", sampled_on: "2026-10-22" },
      { source: "judge", total: 70, topic_label: "Persentil", note: "Örnek ekle.", sampled_on: "2026-10-23" },
      { source: "verifier", total: 3.5, topic_label: "YSK", note: null, sampled_on: "2026-10-23" },
    ]);
    expect(summary.judgeAverage).toBe(65);
    expect(summary.verifierAverage).toBe(3.5);
    expect(summary.latest[0]!.topic).toBe("Persentil");
  });
});

describe("göç: yalnız ekleme, satır güvenliği açık, hesapla silinir", () => {
  const db = new PGlite();
  const user = "11111111-1111-4111-8111-111111111111";
  const prep = "22222222-2222-4222-8222-222222222222";

  beforeAll(async () => {
    await db.exec(`CREATE TABLE public.profiles(id uuid PRIMARY KEY);
      CREATE TABLE public.exam_preps(id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE);
      CREATE TABLE public.feature_flags(key text PRIMARY KEY, enabled boolean NOT NULL DEFAULT false, description text,
        updated_at timestamptz NOT NULL DEFAULT now());
      INSERT INTO public.profiles VALUES ('${user}');
      INSERT INTO public.exam_preps VALUES ('${prep}', '${user}');`);
    await db.exec(read("supabase/migrations/20261020160000_prep_review_items.sql"));
    await db.exec(read("supabase/migrations/20261023120000_learning_signals.sql"));
    // İki kez uygulanabilir (IF NOT EXISTS).
    await db.exec(read("supabase/migrations/20261023120000_learning_signals.sql"));
  }, 30_000);
  afterAll(() => db.close());

  it("tekrar cevabı basamağıyla yazılır; basamak 0-3 dışı reddedilir; aynı derse ikinci yargıç satırı yazılmaz", async () => {
    const item = await db.query<{ id: string }>(
      `INSERT INTO public.exam_prep_review_items (user_id, exam_prep_id, source_kind, reason, source_ref, prompt_key, item, due_on)
       VALUES ('${user}', '${prep}', 'quiz', 'miss', 'att:1', 'abcd1234abcd1234', '{}'::jsonb, '2026-10-24') RETURNING id`,
    );
    const itemId = item.rows[0]!.id;
    await db.exec(`INSERT INTO public.exam_prep_review_answers (user_id, exam_prep_id, item_id, topic_label, step, correct, answered_on)
      VALUES ('${user}', '${prep}', '${itemId}', 'YSK', 1, true, '2026-10-23')`);
    await expect(
      db.exec(`INSERT INTO public.exam_prep_review_answers (user_id, exam_prep_id, item_id, step, correct, answered_on)
        VALUES ('${user}', '${prep}', '${itemId}', 4, true, '2026-10-23')`),
    ).rejects.toThrow();
    const attempt = "33333333-3333-4333-8333-333333333333";
    await db.exec(`INSERT INTO public.lesson_quality_samples (source, user_id, attempt_id, total) VALUES ('judge', '${user}', '${attempt}', 60)`);
    await expect(
      db.exec(`INSERT INTO public.lesson_quality_samples (source, user_id, attempt_id, total) VALUES ('judge', '${user}', '${attempt}', 61)`),
    ).rejects.toThrow();
    await db.exec(`INSERT INTO public.lesson_quality_samples (source, user_id, total, scores) VALUES ('verifier', '${user}', 3.5, '{"parts":[3,4]}')`);
    const rls = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('exam_prep_review_answers', 'lesson_quality_samples') ORDER BY relname`,
    );
    expect(rls.rows.every((row) => row.relrowsecurity)).toBe(true);
    await db.exec(`DELETE FROM public.profiles WHERE id = '${user}'`);
    const left = await db.query<{ n: number }>(
      `SELECT (SELECT count(*) FROM public.exam_prep_review_answers) + (SELECT count(*) FROM public.lesson_quality_samples) AS n`,
    );
    expect(Number(left.rows[0]!.n)).toBe(0);
  });
});
