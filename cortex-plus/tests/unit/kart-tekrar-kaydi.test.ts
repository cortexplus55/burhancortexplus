import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nodeCardReviewRows } from "@/lib/learning/node-card-reviews";
import { TEACHER_CARD_KINDS } from "@/lib/learning/node/shared";

/*
  20 Kasım 2026: kart değerlendirmesi sessizce düşmesin.
  (1) Yazıcının sütunları canlı tabloyla aynı; depodaki eski tanım (flashcard_id, next_review_at) göçle eşitlenir.
  (2) Canlıda destelerin çoğu "Kartlarla tekrar" (spaced) adımı; kayıt iki kart türünde de yazılır.
*/

const MIGRATION = "supabase/migrations/20261120100000_flashcard_reviews_canli_sema.sql";
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const USER = "11111111-1111-4111-8111-111111111111";
const PREP = "22222222-2222-4222-8222-222222222222";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  // Depodaki ilk tanımın (20250825120000_init) eski biçimi; bağımlı tablolar yalın.
  await db.exec(`
    CREATE TABLE public.profiles (id uuid PRIMARY KEY);
    CREATE TABLE public.exam_preps (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.profiles(id));
    CREATE TABLE public.flashcards (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE TABLE public.flashcard_reviews (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      flashcard_id uuid NOT NULL REFERENCES public.flashcards(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      ease numeric NOT NULL DEFAULT 2.5,
      interval_days integer NOT NULL DEFAULT 1,
      next_review_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO public.profiles (id) VALUES ('${USER}');
    INSERT INTO public.exam_preps (id, user_id) VALUES ('${PREP}', '${USER}');
  `);
  await db.exec(read(MIGRATION));
});

afterAll(async () => {
  await db?.close();
});

async function upsert(rows: ReturnType<typeof nodeCardReviewRows>) {
  for (const row of rows) {
    await db.query(
      `INSERT INTO public.flashcard_reviews
         (user_id, exam_prep_id, card_key, card_source, topic_label, ease, interval_days, reps, lapses, due_at,
          last_rating, last_reviewed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (user_id, card_key) DO UPDATE SET
         ease = EXCLUDED.ease, interval_days = EXCLUDED.interval_days, reps = EXCLUDED.reps,
         lapses = EXCLUDED.lapses, due_at = EXCLUDED.due_at, last_rating = EXCLUDED.last_rating,
         last_reviewed_at = EXCLUDED.last_reviewed_at`,
      [
        row.user_id,
        row.exam_prep_id,
        row.card_key,
        row.card_source,
        row.topic_label,
        row.ease,
        row.interval_days,
        row.reps,
        row.lapses,
        row.due_at,
        row.last_rating,
        row.last_reviewed_at,
      ],
    );
  }
}

describe("flashcard_reviews canlı biçim göçü", () => {
  it("yalnız ekler: DROP, DELETE, UPDATE ve TRUNCATE yok", () => {
    const sql = read(MIGRATION)
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|INDEX|POLICY|CONSTRAINT)\b/i);
    expect(sql).not.toMatch(/\b(DELETE\s+FROM|TRUNCATE|UPDATE\s+public\.)/i);
  });

  it("yazıcının ürettiği satırlar eski biçimden kurulan tabloya yazılır ve aynı kart tek satırda ilerler", async () => {
    const cards = [
      { front: "Bir kavramın tanımı", back: "Kavramın kısa açıklaması" },
      { front: "İkinci kavram", back: "İkinci açıklama" },
    ];
    const first = nodeCardReviewRows({
      userId: USER,
      prepId: PREP,
      topicLabel: "Örnek konu",
      cards,
      answers: { "0": true, "1": false },
      existing: [],
      now: new Date("2026-11-20T09:00:00Z"),
    });
    expect(first).toHaveLength(2);
    await upsert(first);

    const { rows: existing } = await db.query<{
      card_key: string;
      ease: string;
      interval_days: number;
      reps: number;
      lapses: number;
    }>(`SELECT card_key, ease, interval_days, reps, lapses FROM public.flashcard_reviews WHERE user_id = $1`, [USER]);
    expect(existing).toHaveLength(2);

    const second = nodeCardReviewRows({
      userId: USER,
      prepId: PREP,
      topicLabel: "Örnek konu",
      cards,
      answers: { "0": 5, "1": 5 },
      existing,
      now: new Date("2026-11-21T09:00:00Z"),
    });
    await upsert(second);
    const { rows } = await db.query<{ n: number; reps: number }>(
      `SELECT count(*)::int AS n, max(reps)::int AS reps FROM public.flashcard_reviews WHERE user_id = $1`,
      [USER],
    );
    expect(rows[0]).toEqual({ n: 2, reps: 2 });
  });

  it("canlı tablodaki kısıtlar aynı adlarla kurulur", async () => {
    await expect(
      db.query(
        `INSERT INTO public.flashcard_reviews (user_id, card_key, card_source) VALUES ($1, 'x', 'baska')`,
        [USER],
      ),
    ).rejects.toThrow(/flashcard_reviews_card_source_check/);
    await expect(
      db.query(
        `INSERT INTO public.flashcard_reviews (user_id, card_key, card_source, last_rating) VALUES ($1, 'y', 'node', 'iyi')`,
        [USER],
      ),
    ).rejects.toThrow(/flashcard_reviews_last_rating_check/);
  });

  it("ikinci kez çalışınca hiçbir şey değişmez (canlıda no-op)", async () => {
    await expect(db.exec(read(MIGRATION))).resolves.toBeDefined();
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_indexes WHERE tablename = 'flashcard_reviews'`,
    );
    // pkey + kart anahtarı tekil dizini + iki yardımcı dizin; ikinci çalışma yenisini eklemez.
    expect(rows[0]?.n).toBe(4);
  });
});

describe("kart düğümünün değerlendirmesi iki kart türünde de yazılır", () => {
  it("TEACHER_CARD_KINDS iki türü kapsar ve tamamlama bu kümeye bakar", () => {
    expect([...TEACHER_CARD_KINDS].sort()).toEqual(["flashcards", "spaced"]);
    const complete = read("src/lib/learning/node/complete.ts");
    expect(complete).toMatch(/if \(TEACHER_CARD_KINDS\.has\(kind\)\) \{\s*await recordNodeCardReviews\(/);
    expect(complete).not.toMatch(/if \(kind === "flashcards"\) \{\s*await recordNodeCardReviews\(/);
  });
});
