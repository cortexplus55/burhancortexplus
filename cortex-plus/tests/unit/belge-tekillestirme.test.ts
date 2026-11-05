import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/*
  Lansman zırhı #2a (5 Kasım 2026): aynı belgeyi tekrar okumama. Özet SUNUCUDA baytlardan; kaynak önce aynı
  öğrencide, sonra herkeste; `clone_document_content` sayfa/parça/gömmeyi tek SQL'de kopyalar; göç yoksa
  tekilleştirme atlanır. Örnekler ders bağımsız (fizik, tarih, hukuk metinleri).
*/

vi.mock("server-only", () => ({}));

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const SCHEMA = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE public.documents (
  id uuid PRIMARY KEY, user_id uuid NOT NULL, status text NOT NULL DEFAULT 'completed', part_of uuid,
  deleted_at timestamptz, page_count integer, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.document_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL, page_number integer NOT NULL,
  text_content text, extraction_ok boolean, page_kind text, headings jsonb, formulas jsonb, tables_detected boolean,
  images_detected boolean, uncertain_regions jsonb, extraction_method text, char_count integer, clean_text text,
  clean_model text, cleaned_at timestamptz);
CREATE TABLE public.document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL, page_id uuid, chunk_index integer NOT NULL,
  content text NOT NULL, token_count integer);
CREATE TABLE public.document_embeddings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), chunk_id uuid NOT NULL, embedding text);
CREATE TABLE public.feature_flags (key text PRIMARY KEY, enabled boolean NOT NULL DEFAULT true, description text, metadata jsonb);
`;

const SOURCE = "11111111-1111-4111-8111-111111111111";
const TARGET = "22222222-2222-4222-8222-222222222222";
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("clone_document_content (PGlite)", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(SCHEMA);
    await db.exec(read("supabase/migrations/20261105160000_lansman_zirhi.sql"));
    await db.query("INSERT INTO documents (id, user_id, page_count, sha256) VALUES ($1, $2, 2, 'abc')", [SOURCE, USER_A]);
    await db.query("INSERT INTO documents (id, user_id, page_count, status) VALUES ($1, $2, NULL, 'processing')", [TARGET, USER_B]);
    const p1 = await db.query<{ id: string }>(
      "INSERT INTO document_pages (document_id, page_number, text_content, clean_text, char_count) VALUES ($1, 1, 'Newton''un ikinci yasası: F = m·a', 'F = m·a', 30) RETURNING id",
      [SOURCE],
    );
    const p2 = await db.query<{ id: string }>(
      "INSERT INTO document_pages (document_id, page_number, text_content, char_count) VALUES ($1, 2, 'Tanzimat Fermanı 1839', 21) RETURNING id",
      [SOURCE],
    );
    const c1 = await db.query<{ id: string }>(
      "INSERT INTO document_chunks (document_id, page_id, chunk_index, content, token_count) VALUES ($1, $2, 10000, 'F = m·a', 5) RETURNING id",
      [SOURCE, p1.rows[0]!.id],
    );
    const c2 = await db.query<{ id: string }>(
      "INSERT INTO document_chunks (document_id, page_id, chunk_index, content, token_count) VALUES ($1, $2, 20000, 'Tanzimat 1839', 4) RETURNING id",
      [SOURCE, p2.rows[0]!.id],
    );
    await db.query("INSERT INTO document_embeddings (chunk_id, embedding) VALUES ($1, '[0.1,0.2]'), ($2, '[0.3,0.4]')", [c1.rows[0]!.id, c2.rows[0]!.id]);
    // Hedefte eski (yarım) içerik: klon önce onu temizler.
    await db.query("INSERT INTO document_pages (document_id, page_number, text_content) VALUES ($1, 1, 'eski yarım sayfa')", [TARGET]);
  }, 30_000);
  afterAll(async () => {
    await db.close();
  });

  it("göç eklemeli: sha256 ve embeddings_evicted_at sütunları, kısmi dizin, iki anahtar", async () => {
    const cols = await db.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'documents' AND column_name IN ('sha256','embeddings_evicted_at')",
    );
    expect(cols.rows.map((r) => r.column_name).sort()).toEqual(["embeddings_evicted_at", "sha256"]);
    const flags = await db.query<{ key: string; enabled: boolean }>("SELECT key, enabled FROM feature_flags ORDER BY key");
    expect(flags.rows).toEqual([
      { key: "admin_ai_daily_cap", enabled: true },
      { key: "vector_eviction", enabled: true },
    ]);
  });

  it("kaynağın sayfaları, parçaları ve gömmeleri hedefe kopyalanır; hedefin eski içeriği silinir; kaynak değişmez", async () => {
    const result = await db.query<{ clone_document_content: { pages: number; chunks: number; embeddings: number } }>(
      "SELECT clone_document_content($1, $2)",
      [SOURCE, TARGET],
    );
    expect(result.rows[0]!.clone_document_content).toEqual({ pages: 2, chunks: 2, embeddings: 2 });
    const pages = await db.query<{ page_number: number; text_content: string; char_count: number }>(
      "SELECT page_number, text_content, char_count FROM document_pages WHERE document_id = $1 ORDER BY page_number",
      [TARGET],
    );
    expect(pages.rows).toEqual([
      { page_number: 1, text_content: "Newton'un ikinci yasası: F = m·a", char_count: 30 },
      { page_number: 2, text_content: "Tanzimat Fermanı 1839", char_count: 21 },
    ]);
    const chunks = await db.query<{ chunk_index: number; page_number: number; embedding: string }>(
      `SELECT c.chunk_index, p.page_number, e.embedding FROM document_chunks c
         JOIN document_pages p ON p.id = c.page_id JOIN document_embeddings e ON e.chunk_id = c.id
        WHERE c.document_id = $1 ORDER BY c.chunk_index`,
      [TARGET],
    );
    expect(chunks.rows).toEqual([
      { chunk_index: 10000, page_number: 1, embedding: "[0.1,0.2]" },
      { chunk_index: 20000, page_number: 2, embedding: "[0.3,0.4]" },
    ]);
    const source = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM document_pages WHERE document_id = $1", [SOURCE]);
    expect(source.rows[0]!.n).toBe(2);
  });

  it("aynı belgeyi kendine klonlamak reddedilir; fonksiyon yalnız service_role'e açık", async () => {
    await expect(db.query("SELECT clone_document_content($1, $1)", [SOURCE])).rejects.toThrow(/invalid arguments/);
    const grants = await db.query<{ grantee: string }>(
      "SELECT grantee FROM information_schema.routine_privileges WHERE routine_name = 'clone_document_content' AND privilege_type = 'EXECUTE'",
    );
    const grantees = grants.rows.map((r) => r.grantee);
    expect(grantees).toContain("service_role");
    expect(grantees).not.toContain("anon");
    expect(grantees).not.toContain("authenticated");
  });
});

/** Sorgu zincirini taklit eden küçük sahte: her `.from()` çağrısı sıradaki cevabı döndürür. */
function fakeService(responses: { data?: unknown; error?: unknown; count?: number | null }[]) {
  const calls: { table: string; ops: string[] }[] = [];
  const service = {
    from(table: string) {
      const response = responses.shift() ?? { data: null, error: null };
      const call = { table, ops: [] as string[] };
      calls.push(call);
      const chain: Record<string, unknown> = {};
      const handler: ProxyHandler<Record<string, unknown>> = {
        get(_target, prop) {
          if (prop === "then") {
            return (resolve: (value: unknown) => void) => resolve({ data: response.data ?? null, error: response.error ?? null, count: response.count ?? null });
          }
          return (...args: unknown[]) => {
            call.ops.push(`${String(prop)}(${args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(",")})`);
            return proxy;
          };
        },
      };
      const proxy = new Proxy(chain, handler);
      return proxy;
    },
    rpc: vi.fn(async () => ({ data: null, error: null })),
  };
  return { service: service as never, calls, rpc: service.rpc };
}

describe("tekilleştirme yardımcıları", () => {
  it("özet baytlardan ve kararlıdır", async () => {
    const { sha256Hex } = await import("@/lib/documents/document-dedup");
    expect(sha256Hex(Buffer.from("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex(Buffer.from("abc"))).toBe(sha256Hex(new Uint8Array([97, 98, 99])));
  });

  it("kaynak önce aynı öğrencide aranır; sayfası olmayan kaynak sayılmaz; sütun yoksa null", async () => {
    const { findDuplicateSource } = await import("@/lib/documents/document-dedup");
    const own = fakeService([
      { data: [{ id: "src-own", user_id: USER_A, page_count: 3, embeddings_evicted_at: null }] },
      { count: 3 },
    ]);
    const found = await findDuplicateSource(own.service, { sha256: "x", excludeId: TARGET, userId: USER_A });
    expect(found).toEqual({ id: "src-own", userId: USER_A, pageCount: 3, evicted: false });
    expect(own.calls[0]!.ops).toContain(`eq(user_id,${USER_A})`);
    expect(own.calls[0]!.ops).toContain("eq(status,completed)");
    expect(own.calls[0]!.ops).toContain(`neq(id,${TARGET})`);

    const other = fakeService([
      { data: [] },
      { data: [{ id: "src-other", user_id: USER_B, page_count: 5, embeddings_evicted_at: "2026-11-01T00:00:00Z" }] },
      { count: 5 },
    ]);
    const cross = await findDuplicateSource(other.service, { sha256: "x", excludeId: TARGET, userId: USER_A });
    expect(cross).toEqual({ id: "src-other", userId: USER_B, pageCount: 5, evicted: true });

    const empty = fakeService([{ data: [{ id: "s", user_id: USER_B, page_count: 2, embeddings_evicted_at: null }] }, { count: 0 }]);
    expect(await findDuplicateSource(empty.service, { sha256: "x", excludeId: TARGET, userId: USER_B })).toBeNull();

    const noColumn = fakeService([{ error: { code: "42703", message: "column documents.sha256 does not exist" } }]);
    expect(await findDuplicateSource(noColumn.service, { sha256: "x", excludeId: TARGET, userId: USER_A })).toBeNull();
  });

  it("klon RPC'si yoksa null (eski yol sürer); varsa sayılar döner", async () => {
    const { cloneDocumentContent } = await import("@/lib/documents/document-dedup");
    const missing = fakeService([]);
    missing.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Could not find the function public.clone_document_content" } } as never);
    expect(await cloneDocumentContent(missing.service, { sourceId: SOURCE, targetId: TARGET })).toBeNull();
    const ok = fakeService([]);
    ok.rpc.mockResolvedValueOnce({ data: { pages: 2, chunks: 3, embeddings: 3 }, error: null } as never);
    expect(await cloneDocumentContent(ok.service, { sourceId: SOURCE, targetId: TARGET })).toEqual({ pages: 2, chunks: 3, embeddings: 3 });
  });

  it("eksik gömmeler yalnız gömme çağrısıyla tamamlanır (OCR yok)", async () => {
    const { ensureDocumentEmbeddings } = await import("@/lib/documents/document-dedup");
    const fake = fakeService([
      { data: [{ id: "c1", content: "Borçlar hukukunda sözleşme" }, { id: "c2", content: "Haksız fiil" }, { id: "c3", content: "Sebepsiz zenginleşme" }] },
      { data: [{ chunk_id: "c2" }] },
      { data: null },
    ]);
    const embed = vi.fn(async (texts: string[]) => texts.map(() => [0.5]));
    expect(await ensureDocumentEmbeddings(fake.service, TARGET, embed)).toBe(2);
    expect(embed).toHaveBeenCalledWith(["Borçlar hukukunda sözleşme", "Sebepsiz zenginleşme"]);
    expect(fake.calls[2]!.ops[0]).toContain('"chunk_id":"c1"');
  });

  it("kancalar: PDF ilk adımı ve belge boru hattı özetle kaynağı arar; hak kopyanın tamamına yetmiyorsa eski yol", () => {
    const pdf = read("src/lib/documents/pdf-ingestion.ts");
    expect(pdf).toContain("const sha256 = sha256Hex(buffer);");
    expect(pdf).toContain("remaining === null || remaining >= duplicate.pageCount");
    expect(pdf).toContain("if (affordable >= duplicate.pageCount)");
    expect(pdf).toContain('stage: "dedup_clone"');
    expect(pdf.indexOf("findDuplicateSource(")).toBeLessThan(pdf.indexOf("await readPdfBatch("));
    const pipeline = read("src/lib/rag/pipeline.ts");
    expect(pipeline).toContain("const duplicate = await findDuplicateSource(service, { sha256, excludeId: documentId, userId });");
    expect(pipeline.indexOf("findDuplicateSource(")).toBeLessThan(pipeline.indexOf("if (isImageDocument(doc.mime_type))"));
  });
});
