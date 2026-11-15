import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
  15 Kasım 2026 (disk IO, Burhan kararı 7): `match_document_chunks` uygulamanın geçici dosya yazan tek sorgusuydu
  (2.740 çağrıda ~355 MB). Eski gövde (20261031160000) kullanıcının bütün parçalarını `content` metniyle birlikte
  `MATERIALIZED` bir CTE'ye alıp sıralıyordu. Yeni gövde (20261115160000) yalnız kimlik + uzaklıkla sıralar, metni
  seçilen en çok 20 satıra sonradan birleştirir.

  Bu test iki gövdeyi aynı veride yan yana koşturur: sonuçlar birebir aynı olmalı. Veri rastgele ama tohumlu
  (aynı her koşuda): üç kullanıcı, ana belgeler, sayfa aralıklı parçalar, silinmiş belgeler, sayfasız parçalar.

  PGlite'ta pgvector yok: `vector` float8[] üzerinde bir alan türü, `<=>` kosinüs mesafesi (lansman-parca-arama ile
  aynı kurulum). Gövdeler göç dosyalarının kendisi (yalnız `vector(1536)` → `vector`; eskisinin adı `_eski`).
*/

const OLD_FILE = "supabase/migrations/20261031160000_part_search_parent.sql";
const NEW_FILE = "supabase/migrations/20261115160000_match_chunks_narrow_sort.sql";
const DIM = 6;

const USERS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];

/** Tohumlu sözde rastgele (mulberry32): her koşuda aynı veri. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function uuid(n: number): string {
  const hex = n.toString(16).padStart(12, "0");
  return `aaaaaaaa-aaaa-4aaa-8aaa-${hex}`;
}

type Row = {
  chunk_id: string;
  document_id: string;
  file_name: string | null;
  content: string | null;
  similarity: number;
  page_number: number | null;
  chunk_index: number | null;
};

describe("match_document_chunks: dar sıralama eski gövdeyle aynı sonucu verir", () => {
  const db = new PGlite();
  const random = rng(20261115);
  const docsByUser = new Map<string, string[]>();
  let next = 1;

  const vec = () => `{${Array.from({ length: DIM }, () => (random() * 2 - 1).toFixed(6)).join(",")}}`;

  async function call(fn: string, user: string, query: string, count: number, min: number, doc: string | null) {
    const { rows } = await db.query<Row>(
      `SELECT chunk_id, document_id, file_name, content, similarity, page_number, chunk_index
         FROM public.${fn}($1, $2::vector, $3, $4, $5)`,
      [user, query, count, min, doc],
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

    for (const user of USERS) {
      const ids: string[] = [];
      for (let d = 0; d < 4; d += 1) {
        const id = uuid(next++);
        const pages = 8 + Math.floor(random() * 25);
        const deleted = d === 3 && user === USERS[0];
        await db.query("INSERT INTO documents(id, user_id, file_name, deleted_at) VALUES ($1, $2, $3, $4)", [
          id,
          user,
          `Belge ${d + 1}.pdf`,
          deleted ? new Date().toISOString() : null,
        ]);
        for (let page = 1; page <= pages; page += 1) {
          const chunks = 1 + Math.floor(random() * 3);
          const { rows } = await db.query<{ id: string }>(
            "INSERT INTO document_pages(document_id, page_number) VALUES ($1, $2) RETURNING id",
            [id, page],
          );
          for (let c = 0; c < chunks; c += 1) {
            // Her 17. parçanın sayfası yok (eski kayıtlarda olur); gömmesi yine var.
            const pageId = (next + c) % 17 === 0 ? null : rows[0]!.id;
            await db.query(
              `WITH c AS (INSERT INTO document_chunks(document_id, page_id, content, chunk_index)
                          VALUES ($1, $2, $3, $4) RETURNING id)
               INSERT INTO document_embeddings(chunk_id, embedding) SELECT id, $5::vector FROM c`,
              [id, pageId, `Belge ${d + 1} · sayfa ${page} · parça ${c} ${"metin ".repeat(40)}`, page * 10 + c, vec()],
            );
            next += 1;
          }
        }
        ids.push(id);
        // İlk iki belgenin bir parçası (pencere kopyası): ana belgenin bir sayfa aralığının metni, gömmesi yok.
        if (d < 2) {
          const part = uuid(next++);
          const from = 2 + Math.floor(random() * 3);
          const to = from + 3 + Math.floor(random() * 4);
          await db.query("INSERT INTO documents(id, user_id, file_name, part_of) VALUES ($1, $2, $3, $4)", [
            part,
            user,
            `Belge ${d + 1} (s. ${from}–${to}).pdf`,
            id,
          ]);
          for (let page = from; page <= to; page += 1) {
            await db.query(
              `WITH p AS (INSERT INTO document_pages(document_id, page_number) VALUES ($1, $2) RETURNING id)
               INSERT INTO document_chunks(document_id, page_id, content, chunk_index) SELECT $1, id, 'kopya', $2 FROM p`,
              [part, page],
            );
          }
          ids.push(part);
        }
      }
      // Gömmesi hiç olmayan belge.
      const bare = uuid(next++);
      await db.query("INSERT INTO documents(id, user_id, file_name) VALUES ($1, $2, 'Boş.pdf')", [bare, user]);
      ids.push(bare);
      docsByUser.set(user, ids);
    }

    const old = readFileSync(OLD_FILE, "utf8")
      .replace(/vector\(1536\)/g, "vector")
      .replace(/public\.match_document_chunks\b/g, "public.match_document_chunks_eski");
    await db.exec(old);
    await db.exec(readFileSync(NEW_FILE, "utf8").replace(/vector\(1536\)/g, "vector"));
  }, 120_000);

  afterAll(async () => {
    await db.close();
  });

  it("rastgele 240 aramada eski ve yeni gövde birebir aynı satırları aynı sırayla döndürür", async () => {
    let compared = 0;
    let nonEmpty = 0;
    let filtered = 0;
    for (let i = 0; i < 240; i += 1) {
      const user = USERS[i % USERS.length]!;
      const docs = docsByUser.get(user)!;
      // Kimi aramada başka kullanıcının belgesi sorulur (sonuç boş olmalı, ikisinde de).
      const pool = i % 11 === 0 ? docsByUser.get(USERS[(i + 1) % USERS.length]!)! : docs;
      const doc = i % 4 === 0 ? null : pool[Math.floor(random() * pool.length)]!;
      const count = [1, 3, 5, 8, 20, 50, 0, -2][i % 8]!;
      const min = [0, 0, 0.2, 0.5, 0.8, 0.95, -1][i % 7]!;
      const query = vec();
      const before = await call("match_document_chunks_eski", user, query, count, min, doc);
      const after = await call("match_document_chunks", user, query, count, min, doc);
      expect(after).toEqual(before);
      compared += 1;
      if (before.length) nonEmpty += 1;
      if (min > 0 && before.length < Math.max(1, Math.min(count, 20))) filtered += 1;
    }
    expect(compared).toBe(240);
    // Karşılaştırma boş sonuçlarla geçmesin: aramaların çoğu satır döndürmeli, eşik bazılarını kısaltmalı.
    expect(nonEmpty).toBeGreaterThan(150);
    expect(filtered).toBeGreaterThan(10);
  });

  it("parça araması yalnız parçanın sayfa aralığından döner ve parçanın kimliğini taşır", async () => {
    const user = USERS[1]!;
    const { rows } = await db.query<{ id: string; from: number; to: number }>(
      `SELECT d.id, min(p.page_number) AS from, max(p.page_number) AS to
         FROM documents d JOIN document_pages p ON p.document_id = d.id
        WHERE d.user_id = $1 AND d.part_of IS NOT NULL GROUP BY d.id`,
      [user],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const part of rows) {
      const found = await call("match_document_chunks", user, vec(), 20, 0, part.id);
      expect(found.length).toBeGreaterThan(0);
      expect(found.every((row) => row.document_id === part.id)).toBe(true);
      expect(found.every((row) => row.page_number! >= part.from && row.page_number! <= part.to)).toBe(true);
    }
  });

  it("eşit uzaklıkta sıra parça kimliğine göre sabit", async () => {
    const user = USERS[2]!;
    const doc = uuid(next++);
    await db.query("INSERT INTO documents(id, user_id, file_name) VALUES ($1, $2, 'Eş.pdf')", [doc, user]);
    for (let c = 0; c < 6; c += 1) {
      await db.query(
        `WITH c AS (INSERT INTO document_chunks(document_id, content, chunk_index) VALUES ($1, 'eş', $2) RETURNING id)
         INSERT INTO document_embeddings(chunk_id, embedding) SELECT id, '{1,0,0,0,0,0}'::vector FROM c`,
        [doc, c],
      );
    }
    const first = await call("match_document_chunks", user, "{1,0,0,0,0,0}", 4, 0, doc);
    const second = await call("match_document_chunks", user, "{1,0,0,0,0,0}", 4, 0, doc);
    expect(first.map((row) => row.chunk_id)).toEqual(second.map((row) => row.chunk_id));
    expect(first.map((row) => row.chunk_id)).toEqual([...first.map((row) => row.chunk_id)].sort());
  });

  it("bütün adayları gören sıralama ve CTE'ler dar satır taşır; eski gövde metni taşıyordu", async () => {
    // Gövdeyi hazır bir sorgu olarak açıklar (EXPLAIN VERBOSE, JSON ağacı). Bakılan düğümler: LIMIT'in hemen altındaki
    // sıralama (bütün adayları görür) ve CTE'ler (MATERIALIZED ise belleğe alınır). Seçilen en çok 20 satırın son
    // sıralaması metin taşıyabilir; o küçük ve planlayıcıya göre var ya da yok, bakılmaz.
    type PlanNode = {
      "Node Type": string;
      "Parent Relationship"?: string;
      "Subplan Name"?: string;
      Output?: string[];
      Plans?: PlanNode[];
    };
    async function candidateOutputs(file: string): Promise<string[]> {
      const sql = readFileSync(file, "utf8").replace(/vector\(1536\)/g, "vector");
      const body = sql.split("$BODY$")[1]!
        .replace(/\bp_user_id\b/g, "$1")
        .replace(/\bp_query_embedding\b/g, "$2::vector")
        .replace(/\bp_match_count\b/g, "$3")
        .replace(/\bp_min_similarity\b/g, "$4")
        .replace(/\bp_document_id\b/g, "$5::uuid");
      const { rows } = await db.query<{ "QUERY PLAN": unknown }>(
        `EXPLAIN (VERBOSE, COSTS OFF, FORMAT JSON) ${body.trim().replace(/;$/, "")}`,
        [USERS[0], "{1,0,0,0,0,0}", 20, 0, null],
      );
      const raw = rows[0]!["QUERY PLAN"];
      const root = (typeof raw === "string" ? JSON.parse(raw) : raw) as { Plan: PlanNode }[];
      const outputs: string[] = [];
      const walk = (node: PlanNode) => {
        const children = node.Plans ?? [];
        if (node["Subplan Name"]?.startsWith("CTE ")) outputs.push(`CTE ${(node.Output ?? []).join(", ")}`);
        if (node["Node Type"] === "Limit") {
          const outer = children.find((child) => child["Parent Relationship"] === "Outer");
          if (outer?.["Node Type"] === "Sort") outputs.push(`LIMIT/SORT ${(outer.Output ?? []).join(", ")}`);
        }
        children.forEach(walk);
      };
      walk(root[0]!.Plan);
      return outputs;
    }
    const before = await candidateOutputs(OLD_FILE);
    const after = await candidateOutputs(NEW_FILE);
    expect(before.some((line) => /\bcontent\b/.test(line))).toBe(true);
    expect(after.some((line) => line.startsWith("LIMIT/SORT"))).toBe(true);
    expect(after.filter((line) => /\bcontent\b/.test(line))).toEqual([]);
  });

  it("göç eklemeli: aynı imza ve yetkiler, DROP yok, uygulama notu (15 Kasım 2026, Burhan onayıyla uygulandı)", () => {
    // Windows'ta çalışma kopyası CRLF olabilir (core.autocrlf); depo ve CI LF.
    const raw = readFileSync(NEW_FILE, "utf8").replace(/\r\n/g, "\n");
    expect(raw.split("\n")[0]).toMatch(/^-- UYGULANDI: 15 Kasım 2026, Burhan onayıyla/);
    const sql = raw.replace(/^--.*$/gm, "");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.match_document_chunks(");
    expect(sql).toContain("p_query_embedding vector(1536)");
    expect(sql).toContain("FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("TO service_role;");
    expect(sql).toContain("SET search_path = public, pg_temp;");
    expect(sql).not.toMatch(/\b(DROP|DELETE|TRUNCATE|UPDATE|INSERT|ALTER TABLE)\b/);
    // Metin sıralamaya girmez: dar CTE `content` seçmez, MATERIALIZED yalnız tek satırlık hedefte.
    const ranked = sql.slice(sql.indexOf("ranked AS ("), sql.indexOf("SELECT\n    r.chunk_id"));
    expect(ranked).not.toMatch(/\bcontent\b/);
    expect(sql.match(/MATERIALIZED/g)).toHaveLength(1);
  });
});
