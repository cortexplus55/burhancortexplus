import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
const db = new PGlite();
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE profiles(id uuid PRIMARY KEY, deleted_at timestamptz);
    CREATE TABLE documents(id integer PRIMARY KEY, user_id uuid, content text);
    CREATE TABLE storage.objects(id integer PRIMARY KEY, owner_id uuid);
    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE POLICY profile_owner ON profiles TO authenticated USING (id=auth.uid()) WITH CHECK (id=auth.uid());
    CREATE POLICY document_owner ON documents TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
    CREATE POLICY storage_owner ON storage.objects TO authenticated USING (owner_id=auth.uid()) WITH CHECK (owner_id=auth.uid());
    GRANT USAGE ON SCHEMA public,auth,storage TO authenticated;
    GRANT ALL ON profiles,documents,storage.objects TO authenticated;
    INSERT INTO profiles VALUES ('${a}',null),('${b}',null);
    INSERT INTO documents VALUES (1,'${a}','A private'),(2,'${b}','B private');
    INSERT INTO storage.objects VALUES (1,'${a}'),(2,'${b}');`);
  await db.exec(readFileSync("supabase/migrations/20260923120002_uat_deleted_account_barrier.sql", "utf8"));
}, 30_000);
beforeEach(async () => { await db.exec("RESET ROLE; UPDATE profiles SET deleted_at=null;"); });
afterAll(() => db.close());
async function actAs(userId: string) { await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${userId}',false);`); }

describe("deleted account database barrier", () => {
  it("does not widen the existing ownership policy", async () => {
    await actAs(a);
    expect((await db.query("SELECT content FROM documents")).rows).toEqual([{ content: "A private" }]);
    await expect(db.exec(`UPDATE documents SET user_id='${b}' WHERE id=1`)).rejects.toThrow();
  });
  it("blocks old JWT reads in documents, profiles and storage", async () => {
    await db.exec(`UPDATE profiles SET deleted_at=now() WHERE id='${a}'`);
    await actAs(a);
    for (const table of ["documents", "profiles", "storage.objects"]) {
      expect((await db.query(`SELECT * FROM ${table}`)).rows).toHaveLength(0);
    }
  });
  it("blocks resurrection or writes by a deleted user", async () => {
    await db.exec(`UPDATE profiles SET deleted_at=now() WHERE id='${a}'`);
    await actAs(a);
    expect((await db.query("UPDATE profiles SET deleted_at=null RETURNING id")).rows).toHaveLength(0);
    await expect(db.exec(`INSERT INTO documents VALUES (3,'${a}','new')`)).rejects.toThrow();
  });
  it("keeps another active account functional", async () => {
    await db.exec(`UPDATE profiles SET deleted_at=now() WHERE id='${a}'`);
    await actAs(b);
    expect((await db.query("SELECT content FROM documents")).rows).toEqual([{ content: "B private" }]);
  });
});
