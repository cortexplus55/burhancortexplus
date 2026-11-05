import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
  Güvenlik (6 Kasım 2026): soru bankası (cevap anahtarıyla), havuz dersleri ve özellik bayrakları oturumsuz
  (anon) ve oturumlu kullanıcıya kapalı; yalnız sunucu (service_role) okur. Canlı taramada yayınlanan anahtarla
  13.172 sorunun tamamı cevabıyla okunabiliyordu. Bu dosya iki şeyi bekler: göç politikaları gerçekten kaldırır
  (PGlite'ta anon 0 satır görür) ve uygulama kodu bu tabloları tarayıcı istemcisiyle hiç okumaz.
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("göç: anon ve authenticated okuyamaz (PGlite)", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE public.item_bank (id int PRIMARY KEY, status text, answer int);
      CREATE TABLE public.topic_content (id int PRIMARY KEY, status text);
      CREATE TABLE public.feature_flags (key text PRIMARY KEY, metadata jsonb);
      ALTER TABLE public.item_bank ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.topic_content ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
      CREATE POLICY item_bank_read_verified ON public.item_bank FOR SELECT TO anon, authenticated USING (status = 'verified');
      CREATE POLICY topic_content_read_verified ON public.topic_content FOR SELECT TO anon, authenticated USING (status = 'verified');
      CREATE POLICY feature_flags_read ON public.feature_flags FOR SELECT USING (true);
      GRANT SELECT ON public.item_bank, public.topic_content, public.feature_flags TO anon, authenticated, service_role;
      INSERT INTO public.item_bank VALUES (1, 'verified', 2);
      INSERT INTO public.topic_content VALUES (1, 'verified');
      INSERT INTO public.feature_flags VALUES ('pilot', '{"pilot_user_ids":["u1"]}');
    `);
  }, 30_000);
  afterAll(async () => {
    await db.close();
  });

  async function countAs(role: string, table: string): Promise<number> {
    await db.exec(`SET ROLE ${role}`);
    const result = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.${table}`);
    await db.exec("RESET ROLE");
    return result.rows[0]!.n;
  }

  it("göçten önce anon soruyu cevabıyla görüyordu; göçten sonra görmez, service_role görür", async () => {
    expect(await countAs("anon", "item_bank")).toBe(1);
    await db.exec(read("supabase/migrations/20261106100000_havuz_okuma_sunucuya.sql"));
    for (const table of ["item_bank", "topic_content", "feature_flags"]) {
      expect(await countAs("anon", table)).toBe(0);
      expect(await countAs("authenticated", table)).toBe(0);
      expect(await countAs("service_role", table)).toBe(1);
    }
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("uygulama bu tabloları tarayıcı istemcisiyle okumaz", () => {
  it("tarayıcı istemcisi kullanan dosyalarda item_bank / topic_content / feature_flags okuması yok", () => {
    const offenders = walk("src").filter((file) => {
      const text = read(file);
      const browser = /createBrowserClient|@\/lib\/supabase\/client/.test(text);
      return browser && /from\("(item_bank|topic_content|feature_flags)"\)/.test(text);
    });
    expect(offenders).toEqual([]);
  });
});
