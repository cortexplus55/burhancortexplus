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
