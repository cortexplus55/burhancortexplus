import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
const db = new PGlite();
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const doc = "33333333-3333-4333-8333-333333333333";
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '${a}'::uuid $$;
    CREATE TABLE profiles(id uuid PRIMARY KEY);
    CREATE TABLE documents(id uuid PRIMARY KEY,user_id uuid,storage_path text,deleted_at timestamptz,updated_at timestamptz);
    CREATE TABLE document_chunks(id int,document_id uuid REFERENCES documents(id) ON DELETE CASCADE);
    CREATE TABLE document_pages(id int,document_id uuid REFERENCES documents(id) ON DELETE CASCADE);
    CREATE TABLE exam_preps(id int,document_id uuid REFERENCES documents(id) ON DELETE SET NULL,user_id uuid);
    CREATE TABLE storage.objects(id int,bucket_id text,name text);
    INSERT INTO profiles VALUES('${a}'),('${b}');
    ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
    ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
    ALTER TABLE document_pages ENABLE ROW LEVEL SECURITY;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own ON documents TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
    CREATE POLICY own ON document_chunks TO authenticated USING(true);
    CREATE POLICY own ON document_pages TO authenticated USING(true);
    CREATE POLICY own ON storage.objects TO authenticated USING(true);
    GRANT USAGE ON SCHEMA public,auth,storage TO authenticated;
    GRANT ALL ON documents,document_chunks,document_pages,storage.objects TO authenticated;`);
  await db.exec(readFileSync("supabase/migrations/20260923120849_uat_document_deletion_queue.sql", "utf8"));
}, 30_000);
beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE documents,document_chunks,document_pages,exam_preps,document_deletion_requests,storage.objects;
    INSERT INTO documents VALUES('${doc}','${a}','${a}/${doc}/file.pdf',null,now());
    INSERT INTO exam_preps VALUES(1,'${doc}','${a}');
    INSERT INTO document_chunks VALUES(1,'${doc}'); INSERT INTO document_pages VALUES(1,'${doc}');
    INSERT INTO storage.objects VALUES(1,'documents','${a}/${doc}/file.pdf');`);
});
afterAll(() => db.close());
describe("document deletion transaction", () => {
  it("atomically removes derived plans, disables retrieval and queues cleanup once", async () => {
    await db.exec(`SELECT soft_delete_document('${a}','${doc}'); SELECT soft_delete_document('${a}','${doc}');`);
    expect((await db.query("SELECT * FROM exam_preps")).rows).toHaveLength(0);
    expect((await db.query("SELECT * FROM document_deletion_requests")).rows).toHaveLength(1);
    expect((await db.query<{ deleted_at: string | null }>("SELECT deleted_at FROM documents")).rows[0].deleted_at).not.toBeNull();
    await db.exec("SET ROLE authenticated");
    for (const table of ["documents","document_chunks","document_pages","storage.objects"]) {
      expect((await db.query(`SELECT * FROM ${table}`)).rows).toHaveLength(0);
    }
    await expect(db.exec("DELETE FROM documents")).rejects.toThrow();
  });
  it("rejects a different owner's document and receipt", async () => {
    expect((await db.query<{ ok: boolean }>(`SELECT soft_delete_document('${b}','${doc}') AS ok`)).rows[0].ok).toBe(false);
    expect((await db.query("SELECT * FROM document_deletion_requests")).rows).toHaveLength(0);
    await db.exec(`SELECT soft_delete_document('${a}','${doc}'); DELETE FROM documents;`);
    expect((await db.query<{ ok: boolean }>(`SELECT soft_delete_document('${b}','${doc}') AS ok`)).rows[0].ok).toBe(false);
    expect((await db.query<{ ok: boolean }>(`SELECT soft_delete_document('${a}','${doc}') AS ok`)).rows[0].ok).toBe(true);
  });
  it("rolls back logical deletion if artifact removal fails", async () => {
    await db.exec(`CREATE FUNCTION refuse_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'temporary failure'; END; $$;
      CREATE TRIGGER refuse BEFORE DELETE ON exam_preps FOR EACH ROW EXECUTE FUNCTION refuse_delete();`);
    await expect(db.exec(`SELECT soft_delete_document('${a}','${doc}')`)).rejects.toThrow();
    expect((await db.query<{ deleted_at: string | null }>("SELECT deleted_at FROM documents")).rows[0].deleted_at).toBeNull();
    expect((await db.query("SELECT * FROM document_deletion_requests")).rows).toHaveLength(0);
    await db.exec("DROP TRIGGER refuse ON exam_preps; DROP FUNCTION refuse_delete();");
  });
});
