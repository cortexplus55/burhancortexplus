/**
 * Paket 3 hız (6 Kasım 2026) göçleri PGlite'ta:
 *  - `add_outcome_evidence`: Hakimiyet Haritası artışı atomik; iki çağrı birbirini ezmez, hesap koddakiyle
 *    aynı; tarayıcı rolleri (anon, authenticated) çalıştıramaz, service_role çalıştırır.
 *  - Eksik indeksler: her ifade korumalı (tablo/sütun yoksa ya da başı bu sütun olan indeks varsa atlanır)
 *    ve IF NOT EXISTS; eksik tabloda göç düşmez.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const EVIDENCE = "supabase/migrations/20261106140000_outcome_mastery_atomik.sql";
const INDEXES = "supabase/migrations/20261106141000_eksik_indeksler.sql";
const USER = "11111111-1111-4111-8111-111111111111";

describe("add_outcome_evidence (PGlite)", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      -- Tablo tanımı 20261101200000_item_responses_mastery.sql'den (yabancı anahtarlar dışında).
      CREATE TABLE public.outcome_mastery (
        user_id uuid NOT NULL,
        outcome_id text NOT NULL,
        unit_id text NOT NULL,
        program_id text NOT NULL,
        alpha numeric NOT NULL DEFAULT 1 CHECK (alpha > 0),
        beta numeric NOT NULL DEFAULT 1 CHECK (beta > 0),
        n integer NOT NULL DEFAULT 0 CHECK (n >= 0),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT outcome_mastery_user_outcome_key UNIQUE (user_id, outcome_id)
      );
      ALTER TABLE public.outcome_mastery ENABLE ROW LEVEL SECURITY;
      CREATE POLICY outcome_mastery_select_own ON public.outcome_mastery FOR SELECT TO authenticated USING (true);
      GRANT SELECT ON public.outcome_mastery TO authenticated;
      GRANT ALL ON public.outcome_mastery TO service_role;
    `);
    await db.exec(read(EVIDENCE));
  }, 30_000);
  afterAll(async () => {
    await db.close();
  });

  const call = (rows: unknown[]) =>
    db.query<{ n: number }>("SELECT public.add_outcome_evidence($1::uuid, $2::jsonb) AS n", [USER, JSON.stringify(rows)]);
  const state = async (outcome: string) =>
    (
      await db.query<{ alpha: number; beta: number; n: number; unit_id: string }>(
        "SELECT alpha::float8 AS alpha, beta::float8 AS beta, n, unit_id FROM public.outcome_mastery WHERE user_id = $1 AND outcome_id = $2",
        [USER, outcome],
      )
    ).rows[0];

  it("ilk kanıt PRIOR'dan başlar; hesap koddakiyle aynı (doğru α'ya, yanlış β'ya, 3 basamak)", async () => {
    const out = await call([
      { outcome_id: "o1", unit_id: "u1", program_id: "p1", weight: 1, correct: true },
      { outcome_id: "o2", unit_id: "u1", program_id: "p1", weight: 1 / 3, correct: false },
    ]);
    expect(out.rows[0]!.n).toBe(2);
    expect(await state("o1")).toEqual({ alpha: 2, beta: 1, n: 1, unit_id: "u1" });
    // Kod: round(1 + 1/3) = 1.333
    expect(await state("o2")).toEqual({ alpha: 1, beta: 1.333, n: 1, unit_id: "u1" });
  });

  it("aynı anda gelen iki notlama ikisi de eklenir (oku-değiştir-yaz kaybı yok)", async () => {
    const one = { outcome_id: "o3", unit_id: "u1", program_id: "p1", weight: 0.5, correct: true };
    const two = { outcome_id: "o3", unit_id: "u2", program_id: "p1", weight: 0.5, correct: true };
    await Promise.all([call([one]), call([two])]);
    const row = await state("o3");
    expect(row!.alpha).toBe(2);
    expect(row!.n).toBe(2);
    expect(row!.unit_id).toBe("u2");
    // Aynı çağrıda aynı kazanım iki kez: sırayla iki kez artar.
    await call([one, one]);
    expect((await state("o3"))!.n).toBe(4);
    expect((await state("o3"))!.alpha).toBe(3);
  });

  it("eksik alanlı ya da ağırlığı pozitif olmayan eleman atlanır; dizi değilse 0", async () => {
    const out = await call([
      { outcome_id: "o4", unit_id: "u1", program_id: "p1", weight: 0, correct: true },
      { outcome_id: "o4", unit_id: "u1", weight: 1, correct: true },
      { outcome_id: "o4", unit_id: "u1", program_id: "p1", weight: 1, correct: "yes" },
    ]);
    expect(out.rows[0]!.n).toBe(0);
    expect(await state("o4")).toBeUndefined();
    const notArray = await db.query<{ n: number }>("SELECT public.add_outcome_evidence($1::uuid, '{}'::jsonb) AS n", [USER]);
    expect(notArray.rows[0]!.n).toBe(0);
  });

  it("anon ve authenticated çalıştıramaz; service_role çalıştırır", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(call([{ outcome_id: "o5", unit_id: "u1", program_id: "p1", weight: 1, correct: true }])).rejects.toThrow(
        /permission denied/i,
      );
      await db.exec("RESET ROLE");
    }
    await db.exec("SET ROLE service_role");
    const out = await call([{ outcome_id: "o5", unit_id: "u1", program_id: "p1", weight: 1, correct: true }]);
    await db.exec("RESET ROLE");
    expect(out.rows[0]!.n).toBe(1);
  });

  it("göç yalnız ekler: tablo/politika silmez, SECURITY DEFINER kullanmaz, arama yolu sabit", () => {
    const sql = read(EVIDENCE);
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|POLICY|FUNCTION)\b/i);
    expect(sql).not.toMatch(/SECURITY DEFINER/i);
    expect(sql).toContain("SET search_path = public, pg_temp");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.add_outcome_evidence(uuid, jsonb) FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.add_outcome_evidence(uuid, jsonb) TO service_role;");
  });
});

describe("eksik indeksler", () => {
  const sql = read(INDEXES);
  // Yorum satırları dışındaki SQL (başlık yorumunda "CREATE INDEX" sözü geçiyor).
  const code = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const blocks = code.split(/\nDO \$\$/).slice(1);

  it("25 indeks, her biri kendi korumalı DO bloğunda ve IF NOT EXISTS", () => {
    const creates = code.match(/CREATE INDEX/g) ?? [];
    expect(creates.length).toBe(25);
    expect(blocks.length).toBe(25);
    for (const block of blocks) {
      expect(block).toMatch(/IF to_regclass\('public\.\w+'\) IS NOT NULL/);
      expect(block).toContain("information_schema.columns");
      expect(block).toContain("pg_index");
      expect(block).toMatch(/CREATE INDEX IF NOT EXISTS \w+ ON public\.\w+ \(\w+\);/);
      expect(block).toContain("END IF;");
    }
    expect(code).not.toMatch(/\bDROP\b/i);
    expect(code).not.toMatch(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/);
  });

  it("PGlite: eksik tablo düşürmez, var olan baş sütunlu indeks yinelenmez, olanlara indeks açar", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.exam_preps (id uuid PRIMARY KEY, user_id uuid NOT NULL);
        CREATE TABLE public.notifications (id uuid PRIMARY KEY, user_id uuid NOT NULL);
        CREATE INDEX notifications_by_user ON public.notifications (user_id, id);
        CREATE TABLE public.document_chunks (id uuid PRIMARY KEY);
      `);
      await db.exec(sql);
      await db.exec(sql); // ikinci kez de düşmez
      const idx = await db.query<{ indexname: string; tablename: string }>(
        "SELECT indexname, tablename FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname",
      );
      const names = idx.rows.map((row) => row.indexname);
      expect(names).toContain("exam_preps_user_id_idx");
      // Başı user_id olan indeks zaten var: yenisi açılmaz.
      expect(names).not.toContain("notifications_user_id_idx");
      // Sütun yok (page_id): atlanır.
      expect(names).not.toContain("document_chunks_page_id_idx");
    } finally {
      await db.close();
    }
  });
});
