import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Yıldızlar (17 Ekim 2026, ürün sahibinin kararı: Astra'daki gibi). Göç gerçekten
 * çalıştırılıyor: tek seferlik kazanç, günlük hedef (+25), haftalık seri (+100),
 * davet (+100 / +50), sıralamada ad + baş harf, gizleme ve okul sıralaması.
 */
const read = (path: string) => readFileSync(path, "utf8");

const ayse = "11111111-1111-4111-8111-111111111111";
const mert = "22222222-2222-4222-8222-222222222222";
const deniz = "33333333-3333-4333-8333-333333333333";
const elif = "44444444-4444-4444-8444-444444444444";
const okul = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const baska = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("yıldızlar: göç canlı gibi çalışıyor", () => {
  const db = new PGlite();
  const as = (uid: string) => db.exec(`SELECT set_config('test.uid', '${uid}', false)`);
  const award = async (user: string, source: string, ref: string, amount: number) =>
    Number(
      (await db.query<{ n: number }>("SELECT public.award_stars($1, $2, $3, $4) AS n", [user, source, ref, amount])).rows[0]?.n,
    );

  beforeAll(async () => {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
      CREATE TABLE public.schools (id uuid PRIMARY KEY, name text NOT NULL);
      CREATE TABLE public.profiles (id uuid PRIMARY KEY, full_name text, school_id uuid REFERENCES public.schools(id),
        referred_by uuid REFERENCES public.profiles(id));
      INSERT INTO public.schools VALUES ('${okul}', 'Giresun Tıp'), ('${baska}', 'Ege Üniversitesi');
      INSERT INTO public.profiles VALUES
        ('${ayse}', 'Ayşe Nur Kaya', '${okul}', NULL),
        ('${mert}', 'Mert Demir', '${okul}', '${ayse}'),
        ('${deniz}', 'Deniz', '${baska}', NULL),
        ('${elif}', '', '${okul}', NULL);`);
    await db.exec(read("supabase/migrations/20261017120000_stars.sql"));
  });

  afterAll(async () => {
    await db.close();
  });

  it("aynı kazanç bir kez yazılır", async () => {
    expect(await award(deniz, "prep", "attempt-1", 17)).toBe(17);
    expect(await award(deniz, "prep", "attempt-1", 17)).toBe(0);
    await as(deniz);
    const mine = (await db.query<{ s: Record<string, number> }>("SELECT public.my_stars() AS s")).rows[0]!.s;
    expect(mine.today).toBe(17);
    expect(mine.week).toBe(17);
    expect(mine.all).toBe(17);
    expect(mine.sourcesWeek).toEqual({ prep: 17 });
  });

  it("günde 50 yıldız → +25 günlük hedef (bir kez)", async () => {
    expect(await award(ayse, "prep", "a-1", 30)).toBe(30);
    expect(await award(ayse, "duel", "d-1", 20)).toBe(45);
    expect(await award(ayse, "prep", "a-2", 10)).toBe(10);
    await as(ayse);
    const mine = (await db.query<{ s: Record<string, number> }>("SELECT public.my_stars() AS s")).rows[0]!.s;
    expect(mine.today).toBe(60);
    expect(mine.week).toBe(85);
  });

  it("haftanın 5 gününde günlük hedef → +100 haftalık seri", async () => {
    const week = (await db.query<{ w: string }>("SELECT public.stars_week_start(public.stars_today())::text AS w")).rows[0]!.w;
    // Bu haftanın önceki dört günü (bugün hariç) hedefe ulaşmış sayılır.
    for (let offset = 0; offset < 4; offset += 1) {
      await db.exec(`INSERT INTO public.star_events (user_id, source, amount, ref, day)
        SELECT '${elif}', 'daily_goal', 25, 'g${offset}', DATE '${week}' + ${offset}
        WHERE DATE '${week}' + ${offset} <> public.stars_today()`);
    }
    const before = Number((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.star_events WHERE user_id = '${elif}' AND source = 'daily_goal'`)).rows[0]!.n);
    const got = await award(elif, "prep", "e-1", 60);
    // Bugün pazartesiyse önceki gün yok; seri ancak 5 hedef günü olunca gelir.
    expect(got).toBe(before >= 4 ? 60 + 25 + 100 : 60 + 25);
  });

  it("davet edilen 3 ayrı günde yıldız kazanınca davet eden +100, kendisi +50", async () => {
    await db.exec(`INSERT INTO public.star_events (user_id, source, amount, ref, day) VALUES
      ('${mert}', 'prep', 10, 'm-old-1', public.stars_today() - 2),
      ('${mert}', 'prep', 10, 'm-old-2', public.stars_today() - 1)`);
    expect(await award(mert, "prep", "m-today", 10)).toBe(60);
    const invite = (await db.query<{ amount: number }>(`SELECT amount FROM public.star_events WHERE user_id = '${ayse}' AND source = 'invite'`)).rows;
    expect(invite).toEqual([{ amount: 100 }]);
    // İkinci kez verilmez.
    expect(await award(mert, "prep", "m-today-2", 10)).toBe(10);
  });

  it("okul sıralaması: ad + soyadın baş harfi, okul adı; gizleyen başkasında görünmez", async () => {
    await as(mert);
    const rows = (await db.query<{ rank: number; label: string; detail: string; stars: number; is_me: boolean }>(
      "SELECT rank::int, label, detail, stars::int, is_me FROM public.star_leaderboard('school', 'week', 20)",
    )).rows;
    // Adı boş olan "Öğrenci" görünür; başka okuldaki Deniz yok.
    expect(rows.map((row) => row.label).sort()).toEqual(["Ayşe K.", "Mert D.", "Öğrenci"].sort());
    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3]);
    expect(rows.find((row) => row.label === "Ayşe K.")?.detail).toBe("Giresun Tıp");
    expect(rows.find((row) => row.is_me)?.label).toBe("Mert D.");
    expect(rows.some((row) => row.label === "Deniz")).toBe(false);

    await db.exec(`UPDATE public.profiles SET stars_hidden = true WHERE id = '${ayse}'`);
    const hidden = (await db.query<{ label: string }>("SELECT label FROM public.star_leaderboard('school', 'week', 20)")).rows;
    expect(hidden.some((row) => row.label === "Ayşe K.")).toBe(false);
    await as(ayse);
    const self = (await db.query<{ label: string; is_me: boolean }>("SELECT label, is_me FROM public.star_leaderboard('school', 'week', 20)")).rows;
    expect(self.find((row) => row.is_me)?.label).toBe("Ayşe K.");
    await db.exec(`UPDATE public.profiles SET stars_hidden = false WHERE id = '${ayse}'`);
  });

  it("Türkiye ve okullar sıralaması; ilk sınırın dışındaki kendi satırı da gelir", async () => {
    await as(deniz);
    const country = (await db.query<{ label: string; is_me: boolean; rank: number }>(
      "SELECT label, is_me, rank::int FROM public.star_leaderboard('country', 'all', 1)",
    )).rows;
    expect(country[0]!.rank).toBe(1);
    expect(country.some((row) => row.is_me && row.label === "Deniz")).toBe(true);
    const schools = (await db.query<{ label: string; students: number; stars: number }>(
      "SELECT label, students::int, stars::int FROM public.star_leaderboard('schools', 'all', 20)",
    )).rows;
    expect(schools[0]!.label).toBe("Giresun Tıp");
    expect(schools[0]!.students).toBe(3);
    expect(schools.map((row) => row.label)).toContain("Ege Üniversitesi");
  });

  it("yazma yalnız sunucudan; öğrenci kendi kaydını okur", () => {
    const sql = read("supabase/migrations/20261017120000_stars.sql");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.award_stars(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("CREATE POLICY star_events_own ON public.star_events FOR SELECT USING (user_id = auth.uid());");
    expect(sql).not.toMatch(/THEN\s*\n/);
  });
});
