import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
  22 Ekim 2026 inceleme: erken çözülen yazılı deneme (her zaman açık) bitince (1) yeniden kurulan takvimde
  kalan adımlar denemenin arkasına numaralanıyor, sıradaki adım bitince "sonraki düğüm" bitmiş deneme
  çıkıyor ve yol sonsuza kadar kilitli kalıyordu; (2) denemenin hemen arkasındaki "Kartlarla son tekrar"
  sırası gelmeden açılıyordu. Göç 20261022120000: sıradaki = ilk KİLİTLİ düğüm; önünde bitmemiş adım
  varken biten düğüm sonrakini açmaz; dönen nextId bitmiş düğümü atlar.
*/

const PREP = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const node = (n: number) => `33333333-3333-4333-8333-33333333330${n}`;
const attempt = (n: number) => `44444444-4444-4444-8444-44444444440${n}`;

describe("complete_exam_prep_node: sıra ve bitmiş düğüm", () => {
  const db = new PGlite();

  async function complete(n: number) {
    await db.query(
      "INSERT INTO exam_prep_node_attempts(id, node_id, exam_prep_id, user_id, status, total) VALUES ($1, $2, $3, $4, 'active', 1)",
      [attempt(n), node(n), PREP, USER],
    );
    const { rows } = await db.query<{ out: { nextId: string | null } }>(
      "SELECT public.complete_exam_prep_node($1, $2, $3, $4, 1, 1, '{}'::jsonb) AS out",
      [USER, PREP, node(n), attempt(n)],
    );
    return rows[0]!.out.nextId;
  }

  async function statuses() {
    const { rows } = await db.query<{ sort_order: number; kind: string; status: string }>(
      "SELECT sort_order, kind, status FROM exam_prep_nodes ORDER BY sort_order",
    );
    return rows.map((row) => `${row.sort_order}:${row.kind}:${row.status}`);
  }

  beforeAll(async () => {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.exam_preps (id uuid PRIMARY KEY, user_id uuid NOT NULL, readiness_score integer);
      CREATE TABLE public.exam_prep_nodes (
        id uuid PRIMARY KEY, exam_prep_id uuid NOT NULL, kind text NOT NULL, title text NOT NULL,
        sort_order integer NOT NULL DEFAULT 0,
        status text NOT NULL DEFAULT 'locked' CHECK (status IN ('locked', 'ready', 'done')),
        session_meta jsonb NOT NULL DEFAULT '{}'::jsonb);
      CREATE TABLE public.exam_prep_node_attempts (
        id uuid PRIMARY KEY, node_id uuid NOT NULL, exam_prep_id uuid NOT NULL, user_id uuid NOT NULL,
        status text NOT NULL DEFAULT 'active', score integer, total integer, answers jsonb);`);
    await db.query("INSERT INTO exam_preps(id, user_id) VALUES ($1, $2)", [PREP, USER]);
    // 0 ders (bitti) · 1 ders (sırada) · 2 test · 3 yazılı deneme (her zaman açık) · 4 son kartlar · 5 son kontrol
    const rows: [number, string, string][] = [
      [0, "lesson", "done"],
      [1, "lesson", "ready"],
      [2, "quiz", "locked"],
      [3, "written_exam", "ready"],
      [4, "flashcards", "locked"],
      [5, "final_check", "locked"],
    ];
    for (const [order, kind, status] of rows) {
      await db.query("INSERT INTO exam_prep_nodes(id, exam_prep_id, kind, title, sort_order, status) VALUES ($1, $2, $3, $3, $4, $5)", [
        node(order),
        PREP,
        kind,
        order,
        status,
      ]);
    }
    await db.exec(readFileSync("supabase/migrations/20261022120000_complete_node_in_order.sql", "utf8"));
  }, 30_000);
  afterAll(() => db.close());

  it("erken çözülen deneme sonrakini açmaz; sıradaki adım bitince kilitli ilk düğüm açılır", async () => {
    // Öğrenci 1. adımdayken denemeyi çözdü: 4 (son kartlar) kilitli kalır, önünde bitmemiş adım var.
    expect(await complete(3)).toBe(node(4));
    expect(await statuses()).toEqual([
      "0:lesson:done",
      "1:lesson:ready",
      "2:quiz:locked",
      "3:written_exam:done",
      "4:flashcards:locked",
      "5:final_check:locked",
    ]);
    // Sıradaki adım (1) bitince 2 açılır.
    expect(await complete(1)).toBe(node(2));
    expect((await statuses())[2]).toBe("2:quiz:ready");
    // 2 bitince bitmiş deneme (3) atlanır, 4 açılır; nextId de 4.
    expect(await complete(2)).toBe(node(4));
    expect(await statuses()).toEqual([
      "0:lesson:done",
      "1:lesson:done",
      "2:quiz:done",
      "3:written_exam:done",
      "4:flashcards:ready",
      "5:final_check:locked",
    ]);
  });

  it("aynı kaydı ikinci kez tamamlamak hiçbir şeyi değiştirmez", async () => {
    const { rows } = await db.query<{ out: { score: number; nextId: string | null } }>(
      "SELECT public.complete_exam_prep_node($1, $2, $3, $4, 1, 1, '{}'::jsonb) AS out",
      [USER, PREP, node(2), attempt(2)],
    );
    expect(rows[0]!.out.score).toBe(1);
    expect((await statuses())[5]).toBe("5:final_check:locked");
  });

  it("yalnız sunucu çağırır", async () => {
    const { rows } = await db.query<{ grantee: string }>(
      "SELECT grantee FROM information_schema.routine_privileges WHERE routine_name = 'complete_exam_prep_node' AND privilege_type = 'EXECUTE'",
    );
    const grantees = rows.map((row) => row.grantee);
    expect(grantees).toContain("service_role");
    expect(grantees).not.toContain("anon");
    expect(grantees).not.toContain("authenticated");
  });
});

/*
  24 Ekim 2026 lansman testi: kredi v3'ten beri podcast, sözlü ve yazılı deneme ücretsiz hesapta açılmıyor;
  plan kurucusu bunları yine ilk dersin arkasına koyuyor. Ücretsiz öğrenci Plus adımını bitiremediği için
  yol 2. adımda kilitli kalıyordu. Göç 20261024130000: ücretsiz hesapta Plus adımı "önünde bitmemiş adım"
  sayılmaz, açılırsa arkasındaki adım da açılır, nextId onu atlar. Abone ve kurucuda davranış aynı.
*/
describe("complete_exam_prep_node: ücretsiz hesap Plus adımında kilitlenmez", () => {
  type Who = "free" | "plus" | "admin" | "admin_preview";

  async function setup(who: Who) {
    const db = new PGlite();
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.exam_preps (id uuid PRIMARY KEY, user_id uuid NOT NULL, readiness_score integer);
      CREATE TABLE public.exam_prep_nodes (
        id uuid PRIMARY KEY, exam_prep_id uuid NOT NULL, kind text NOT NULL, title text NOT NULL,
        sort_order integer NOT NULL DEFAULT 0,
        status text NOT NULL DEFAULT 'locked' CHECK (status IN ('locked', 'ready', 'done')),
        session_meta jsonb NOT NULL DEFAULT '{}'::jsonb);
      CREATE TABLE public.exam_prep_node_attempts (
        id uuid PRIMARY KEY, node_id uuid NOT NULL, exam_prep_id uuid NOT NULL, user_id uuid NOT NULL,
        status text NOT NULL DEFAULT 'active', score integer, total integer, answers jsonb);
      CREATE TABLE public.plans (id text PRIMARY KEY, is_premium boolean NOT NULL);
      CREATE TABLE public.subscriptions (user_id uuid NOT NULL, plan_id text NOT NULL, status text NOT NULL,
        current_period_end timestamptz);
      CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL, revoked_at timestamptz);
      CREATE TABLE public.admin_free_preview (user_id uuid PRIMARY KEY);
      CREATE FUNCTION public.is_admin(uid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = uid AND ur.role = 'admin' AND ur.revoked_at IS NULL);
      $$;
      INSERT INTO public.plans VALUES ('plus-aylik', true), ('free', false);`);
    await db.query("INSERT INTO exam_preps(id, user_id) VALUES ($1, $2)", [PREP, USER]);
    if (who === "plus" || who === "admin_preview") {
      await db.query(
        "INSERT INTO subscriptions(user_id, plan_id, status, current_period_end) VALUES ($1, 'plus-aylik', 'active', now() + interval '10 days')",
        [USER],
      );
    }
    if (who === "admin" || who === "admin_preview") {
      await db.query("INSERT INTO user_roles(user_id, role) VALUES ($1, 'admin')", [USER]);
    }
    if (who === "admin_preview") await db.query("INSERT INTO admin_free_preview(user_id) VALUES ($1)", [USER]);
    // Şablon: ders · podcast · test · sözlü · kartlar · yazılı deneme · son kontrol
    const rows: [number, string, string][] = [
      [0, "lesson", "ready"],
      [1, "podcast", "locked"],
      [2, "quiz", "locked"],
      [3, "oral", "locked"],
      [4, "flashcards", "locked"],
      [5, "written_exam", "locked"],
      [6, "final_check", "locked"],
    ];
    for (const [order, kind, status] of rows) {
      await db.query("INSERT INTO exam_prep_nodes(id, exam_prep_id, kind, title, sort_order, status) VALUES ($1, $2, $3, $3, $4, $5)", [
        node(order),
        PREP,
        kind,
        order,
        status,
      ]);
    }
    await db.exec(readFileSync("supabase/migrations/20261022120000_complete_node_in_order.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/20261024130000_free_path_skips_plus.sql", "utf8"));
    const complete = async (n: number) => {
      await db.query(
        "INSERT INTO exam_prep_node_attempts(id, node_id, exam_prep_id, user_id, status, total) VALUES ($1, $2, $3, $4, 'active', 1)",
        [attempt(n), node(n), PREP, USER],
      );
      const { rows: out } = await db.query<{ out: { nextId: string | null } }>(
        "SELECT public.complete_exam_prep_node($1, $2, $3, $4, 1, 1, '{}'::jsonb) AS out",
        [USER, PREP, node(n), attempt(n)],
      );
      return out[0]!.out.nextId;
    };
    const statuses = async () => {
      const { rows: out } = await db.query<{ sort_order: number; kind: string; status: string }>(
        "SELECT sort_order, kind, status FROM exam_prep_nodes ORDER BY sort_order",
      );
      return out.map((row) => `${row.sort_order}:${row.kind}:${row.status}`);
    };
    return { db, complete, statuses };
  }

  it("ücretsiz: Plus adımları açılır ama yolu tutmaz; nextId onları atlar", async () => {
    const { db, complete, statuses } = await setup("free");
    // Ders bitince podcast (Plus) açılır, arkasındaki test de; sıradaki test.
    expect(await complete(0)).toBe(node(2));
    expect(await statuses()).toEqual([
      "0:lesson:done",
      "1:podcast:ready",
      "2:quiz:ready",
      "3:oral:locked",
      "4:flashcards:locked",
      "5:written_exam:locked",
      "6:final_check:locked",
    ]);
    // Test bitince bitmemiş podcast sonrakini tutmaz: sözlü (Plus) ve kartlar açılır.
    expect(await complete(2)).toBe(node(4));
    expect((await statuses()).slice(3, 5)).toEqual(["3:oral:ready", "4:flashcards:ready"]);
    // Kartlar bitince yazılı deneme (Plus) ve son kontrol açılır; sıradaki son kontrol.
    expect(await complete(4)).toBe(node(6));
    expect((await statuses()).slice(5)).toEqual(["5:written_exam:ready", "6:final_check:ready"]);
    await db.close();
  }, 30_000);

  it("önizlemedeki kurucu (aboneliği olsa da) ücretsiz gibi ilerler", async () => {
    const { db, complete, statuses } = await setup("admin_preview");
    expect(await complete(0)).toBe(node(2));
    expect((await statuses())[2]).toBe("2:quiz:ready");
    await db.close();
  }, 30_000);

  it.each(["plus", "admin"] as const)("%s: davranış eskisi gibi, sıradaki Plus adımı", async (who) => {
    const { db, complete, statuses } = await setup(who);
    expect(await complete(0)).toBe(node(1));
    expect((await statuses()).slice(1, 3)).toEqual(["1:podcast:ready", "2:quiz:locked"]);
    await db.close();
  }, 30_000);
});
