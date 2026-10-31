import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
  31 Ekim 2026 (lansman zırhı): belge parçaları (baş kopyası, pencere kopyaları) gömme kopyalamaz. Canlıda veritabanı
  15 kullanıcı ve 198 belgeyle 154 MB'tı (ücretsiz plan 500 MB), gömmeler 85 MB; 50 sayfadan büyük her PDF'in
  gömmeleri iki kez duruyordu. Göç 20261031160000: parçanın araması ana belgenin gömmelerini parçanın sayfa
  aralığında kullanır, sonucu parçanın kimliğiyle döndürür; bütün belgelerde arama parçaları atlar (aynı sonuç iki
  kez geliyordu).

  PGlite'ta pgvector yok: `vector` burada float8[] üzerinde bir alan türü, `<=>` kosinüs mesafesi. Fonksiyonun gövdesi
  göç dosyasının kendisi (yalnız `vector(1536)` → `vector`).
*/

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const BOOK = "33333333-3333-4333-8333-333333333333";
const PART = "44444444-4444-4444-8444-444444444444";
const NOTES = "55555555-5555-4555-8555-555555555555";

type Match = { chunk_id: string; document_id: string; page_number: number; similarity: number };

describe("match_document_chunks: parça ana belgenin gömmeleriyle aranır", () => {
  const db = new PGlite();

  async function search(documentId: string | null, query: number[], count = 20, user = USER) {
    const { rows } = await db.query<Match>(
      "SELECT chunk_id, document_id, page_number, similarity FROM public.match_document_chunks($1, $2::vector, $3, 0, $4)",
      [user, `{${query.join(",")}}`, count, documentId],
    );
    return rows;
  }

  beforeAll(async () => {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE DOMAIN vector AS float8[];
      CREATE FUNCTION cos_dist(a float8[], b float8[]) RETURNS float8 LANGUAGE sql IMMUTABLE AS $$
        SELECT 1 - (SELECT sum(x * y) FROM unnest(a, b) AS t(x, y))
          / (sqrt((SELECT sum(x * x) FROM unnest(a) x)) * sqrt((SELECT sum(y * y) FROM unnest(b) y)))
      $$;
      CREATE OPERATOR <=> (LEFTARG = float8[], RIGHTARG = float8[], FUNCTION = cos_dist);
      CREATE TABLE public.documents (id uuid PRIMARY KEY, user_id uuid NOT NULL, file_name text,
        deleted_at timestamptz, part_of uuid);
      CREATE TABLE public.document_pages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL,
        page_number integer NOT NULL);
      CREATE TABLE public.document_chunks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL,
        page_id uuid, content text, chunk_index integer);
      CREATE TABLE public.document_embeddings (chunk_id uuid NOT NULL, embedding vector);`);
    await db.query(
      `INSERT INTO documents(id, user_id, file_name, part_of) VALUES
        ($1, $4, 'Tarih Kitabı.pdf', NULL), ($2, $4, 'Tarih Kitabı.pdf', $1), ($3, $4, 'Notlar.pdf', NULL)`,
      [BOOK, PART, NOTES, USER],
    );
    // Ana belge 1-100. sayfa, her sayfada bir parça ve gömmesi; gömme sayfa numarasına göre döner (yakın sayfa yakın).
    // Parça 41-80. sayfaların METİN kopyası: gömmesi yok (yeni kod yazmaz).
    for (let page = 1; page <= 100; page += 1) {
      const angle = (page / 100) * (Math.PI / 2);
      const vector = `{${Math.cos(angle)},${Math.sin(angle)}}`;
      await db.query(
        `WITH p AS (INSERT INTO document_pages(document_id, page_number) VALUES ($1, $2) RETURNING id),
              c AS (INSERT INTO document_chunks(document_id, page_id, content, chunk_index)
                    SELECT $1, id, 'Sayfa ' || $2, $2 FROM p RETURNING id)
         INSERT INTO document_embeddings(chunk_id, embedding) SELECT id, $3::vector FROM c`,
        [BOOK, page, vector],
      );
      if (page >= 41 && page <= 80) {
        await db.query(
          `WITH p AS (INSERT INTO document_pages(document_id, page_number) VALUES ($1, $2) RETURNING id)
           INSERT INTO document_chunks(document_id, page_id, content, chunk_index) SELECT $1, id, 'Sayfa ' || $2, $2 FROM p`,
          [PART, page],
        );
      }
    }
    await db.query(
      `WITH p AS (INSERT INTO document_pages(document_id, page_number) VALUES ($1, 1) RETURNING id),
            c AS (INSERT INTO document_chunks(document_id, page_id, content, chunk_index) SELECT $1, id, 'Not', 1 FROM p RETURNING id)
       INSERT INTO document_embeddings(chunk_id, embedding) SELECT id, '{1,0}'::vector FROM c`,
      [NOTES],
    );
    const sql = readFileSync("supabase/migrations/20261031160000_part_search_parent.sql", "utf8").replace(/vector\(1536\)/g, "vector");
    await db.exec(sql);
  });

  afterAll(async () => {
    await db.close();
  });

  it("parçada arama yalnız parçanın sayfalarından döner ve parçanın kimliğini taşır", async () => {
    // Sorgu 10. sayfaya en yakın: parçanın dışı. Sonuçlar yine 41-80 arasında, en yakın 41. sayfa.
    const query = [Math.cos(Math.PI / 20), Math.sin(Math.PI / 20)];
    const rows = await search(PART, query, 20);
    expect(rows).toHaveLength(20);
    expect(rows.every((row) => row.document_id === PART)).toBe(true);
    expect(rows.every((row) => row.page_number >= 41 && row.page_number <= 80)).toBe(true);
    expect(rows[0]!.page_number).toBe(41);
  });

  it("ana belgede arama bugünkü gibi bütün sayfalarda; bütün belgelerde parça ikinci kez gelmez", async () => {
    const query = [Math.cos(Math.PI / 4), Math.sin(Math.PI / 4)];
    const book = await search(BOOK, query, 3);
    expect(book[0]!.page_number).toBe(50);
    expect(book.every((row) => row.document_id === BOOK && Math.abs(row.page_number - 50) <= 1)).toBe(true);
    const all = await search(null, query, 20);
    expect(all.some((row) => row.document_id === PART)).toBe(false);
    const ids = all.map((row) => row.chunk_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("başka kullanıcının belgesi, silinmiş parça ya da silinmiş ana belge sonuç vermez", async () => {
    const query = [1, 0];
    expect(await search(PART, query, 5, OTHER)).toHaveLength(0);
    await db.query("UPDATE documents SET deleted_at = now() WHERE id = $1", [PART]);
    expect(await search(PART, query, 5)).toHaveLength(0);
    await db.query("UPDATE documents SET deleted_at = NULL WHERE id = $1", [PART]);
    await db.query("UPDATE documents SET deleted_at = now() WHERE id = $1", [BOOK]);
    expect(await search(PART, query, 5)).toHaveLength(0);
    await db.query("UPDATE documents SET deleted_at = NULL WHERE id = $1", [BOOK]);
    expect(await search(PART, query, 5)).toHaveLength(5);
  });

  it("göç eklemeli: aynı imza ve yetkiler, DROP yok; kod parça gömmesi yazmaz", () => {
    const sql = readFileSync("supabase/migrations/20261031160000_part_search_parent.sql", "utf8").replace(/^--.*$/gm, "");
    expect(sql).toContain("p_query_embedding vector(1536)");
    expect(sql).toContain("FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("TO service_role;");
    expect(sql).not.toMatch(/\bDROP\b/);
    expect(readFileSync("src/lib/documents/document-head.ts", "utf8")).not.toContain('from("document_embeddings")');
  });
});
