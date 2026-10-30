import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { readSource } from "./helpers/node-sources";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { adaptPathAfterResult } from "@/lib/learning/adaptive-path";
import {
  ADAPT_HIGH_PCT,
  ADAPT_LOW_PCT,
  adaptiveFocusTopic,
  extraPracticeToSkip,
  hasPendingAdaptivePractice,
  parsePathChange,
  pathChangeLine,
  pathDecision,
  type PathNodeRow,
} from "@/lib/learning/path-change";

/*
  20 Ekim 2026, ürün sahibi: "sıralamayı 2 ileri adımla, kullanıcının durumuna göre ilerletelim";
  karar: kendiliğinden. Puanlı adımda %50 altı → konunun odaklı pratiği hemen sıradaki adım;
  %90 ve üstü → konunun kalan ek testleri yoldan çıkar (her konunun bir testi kalır).
*/

const read = (path: string) => readSource(path);
const meta = (topicId: string, topicTitle: string, extra: Record<string, unknown> = {}) => ({ topicId, topicTitle, ...extra });

describe("karar", () => {
  it("eşikler ve hangi adımlar karar verir", () => {
    expect(ADAPT_LOW_PCT).toBe(50);
    expect(ADAPT_HIGH_PCT).toBe(90);
    expect(pathDecision({ kind: "quiz", score: 2, total: 5 })).toBe("low");
    expect(pathDecision({ kind: "quiz", score: 3, total: 5 })).toBeNull();
    expect(pathDecision({ kind: "true_false", score: 9, total: 10 })).toBe("high");
    expect(pathDecision({ kind: "oral", score: 3, total: 3 })).toBe("high");
    // Ders içi 1-4 soru karar vermeye yetmez; odaklı pratik kendini tetiklemez; ders kanıt değil.
    expect(pathDecision({ kind: "quiz", score: 0, total: 2 })).toBeNull();
    expect(pathDecision({ kind: "focused", score: 0, total: 5 })).toBeNull();
    expect(pathDecision({ kind: "lesson", score: 0, total: 4 })).toBeNull();
  });

  it("yüksek sonuçta konunun kalan ek testleri; her konunun bir testi kalır", () => {
    const nodes: PathNodeRow[] = [
      { id: "q1", kind: "quiz", status: "ready", sortOrder: 2, sessionMeta: meta("t1", "Nefron") },
      { id: "q2", kind: "quiz", status: "locked", sortOrder: 5, sessionMeta: meta("t1", "Nefron") },
      { id: "q3", kind: "quiz", status: "locked", sortOrder: 7, sessionMeta: meta("t1", "Nefron") },
      { id: "q4", kind: "quiz", status: "locked", sortOrder: 8, sessionMeta: meta("t2", "Kalp") },
      { id: "s1", kind: "spaced", status: "locked", sortOrder: 9, sessionMeta: meta("t1", "Nefron") },
    ];
    const topic = { topicId: "t1", topicTitle: "Nefron" };
    // Konu testi %90: aynı konunun sonraki testleri kalkar, denemesi olan kalır; tekrar ve öbür konu kalır.
    expect(extraPracticeToSkip(nodes, { id: "q1", kind: "quiz", sortOrder: 2 }, topic, new Set(["q3"]))).toEqual(["q2"]);
    // Doğru/yanlış %90 ama konunun hiç testi bitmemiş: hiçbir test atlanmaz.
    expect(extraPracticeToSkip(nodes, { id: "tf", kind: "true_false", sortOrder: 1 }, topic, new Set())).toEqual([]);
  });

  it("bekleyen uyarlamalı pratik varken ikincisi eklenmez; içerik o konudan kurulur", () => {
    const nodes: PathNodeRow[] = [
      { id: "f1", kind: "focused", status: "locked", sortOrder: 3, sessionMeta: meta("t1", "Nefron", { adaptive: "low" }) },
    ];
    expect(hasPendingAdaptivePractice(nodes, { topicId: "t1", topicTitle: "Nefron" })).toBe(true);
    expect(hasPendingAdaptivePractice(nodes, { topicId: "t2", topicTitle: "Kalp" })).toBe(false);
    expect(adaptiveFocusTopic("focused", { adaptive: "low", topicTitle: "Nefron" }, "x")).toBe("Nefron");
    // Hazırlık geneli odaklı pratik eskisi gibi bütün zayıf konulardan.
    expect(adaptiveFocusTopic("focused", { topicTitle: "Nefron" }, "x")).toBeNull();
    expect(adaptiveFocusTopic("quiz", { adaptive: "low", topicTitle: "Nefron" }, "x")).toBeNull();
  });

  it("öğrenciye tek satır", () => {
    expect(pathChangeLine({ kind: "added", topic: "Nefron" })).toBe('Bu konuda zorlandın: sıradaki adım "Nefron" için odaklı pratik.');
    expect(pathChangeLine({ kind: "skipped", topic: "Nefron", count: 2 })).toBe(
      'Bu konuyu iyi biliyorsun: "Nefron" için 2 ek testi yoldan çıkardık.',
    );
    expect(parsePathChange({ kind: "skipped", topic: "Nefron", count: 0 })).toBeNull();
    expect(parsePathChange({ kind: "added", topic: " " })).toBeNull();
  });
});

describe("rota tarafı (sahte veritabanı)", () => {
  function fakeService(nodes: { id: string; kind: string; status: string; sort_order: number; session_meta: unknown }[], attempts: string[] = []) {
    const rpc = vi.fn(async () => ({ data: "new-id", error: null }));
    const deleted: string[][] = [];
    const service = {
      rpc,
      from(table: string) {
        if (table === "exam_prep_nodes") {
          return {
            select: () => ({ eq: () => ({ order: async () => ({ data: nodes, error: null }) }) }),
            delete: () => ({
              eq: () => ({ neq: () => ({ in: async (_column: string, ids: string[]) => (deleted.push(ids), { error: null }) }) }),
            }),
          };
        }
        return { select: () => ({ in: async () => ({ data: attempts.map((node_id) => ({ node_id })), error: null }) }) };
      },
    };
    return { service: service as never, rpc, deleted };
  }

  const current = { id: "q1", kind: "quiz", sortOrder: 4, dayIndex: 3, sessionMeta: meta("t1", "Nefron") };

  it("düşük sonuç: odaklı pratik bu adımın hemen arkasına, kilitli eklenir", async () => {
    const { service, rpc } = fakeService([{ id: "q1", kind: "quiz", status: "ready", sort_order: 4, session_meta: meta("t1", "Nefron") }]);
    const change = await adaptPathAfterResult(service, { prepId: "p", node: current, topicLabel: "Nefron", score: 1, total: 5 });
    expect(change).toEqual({ kind: "added", topic: "Nefron" });
    expect(rpc).toHaveBeenCalledWith(
      "exam_path_insert_after",
      expect.objectContaining({
        p_prep_id: "p",
        p_after_sort: 4,
        p_kind: "focused",
        p_title: "Odaklı pratik · Nefron",
        p_day_index: 3,
        p_session_meta: expect.objectContaining({ adaptive: "low", adaptiveFrom: "q1", role: "practice", topicId: "t1" }),
      }),
    );
  });

  it("yüksek sonuç: konunun denemesiz ek testleri silinir; orta sonuç yolu değiştirmez", async () => {
    const rows = [
      { id: "q1", kind: "quiz", status: "ready", sort_order: 4, session_meta: meta("t1", "Nefron") },
      { id: "q2", kind: "quiz", status: "locked", sort_order: 6, session_meta: meta("t1", "Nefron") },
      { id: "q3", kind: "quiz", status: "locked", sort_order: 9, session_meta: meta("t1", "Nefron") },
    ];
    const high = fakeService(rows, ["q3"]);
    expect(await adaptPathAfterResult(high.service, { prepId: "p", node: current, topicLabel: "Nefron", score: 5, total: 5 })).toEqual({
      kind: "skipped",
      topic: "Nefron",
      count: 1,
    });
    expect(high.deleted).toEqual([["q2"]]);

    const mid = fakeService(rows);
    expect(await adaptPathAfterResult(mid.service, { prepId: "p", node: current, topicLabel: "Nefron", score: 3, total: 5 })).toBeNull();
    expect(mid.rpc).not.toHaveBeenCalled();
    expect(mid.deleted).toEqual([]);
  });

  it("rota tamamlamada RPC'den önce uyarlar, sonucu cevaba koyar, odaklı pratiği konuya daraltır", () => {
    const route = read("src/app/api/learning/exam-prep/node/route.ts");
    expect(route.indexOf("await adaptPathAfterResult(")).toBeGreaterThan(0);
    expect(route.indexOf("await adaptPathAfterResult(")).toBeLessThan(route.indexOf('service.rpc("complete_exam_prep_node"'));
    expect(route).toContain("pathChange,");
    expect(route).toContain('focusTopic: (kind === "focused" && requestedTopic) || adaptiveFocusTopic(kind, node.session_meta, topicLabel)');
    expect(read("src/lib/learning/exam-local-session.ts")).toContain("const weakTopics = focus");
  });
});

describe("göç: exam_path_insert_after (gerçek PostgreSQL)", () => {
  const db = new PGlite();
  const prep = "11111111-1111-4111-8111-111111111111";
  beforeAll(async () => {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.exam_prep_nodes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), exam_prep_id uuid NOT NULL, kind text NOT NULL, title text NOT NULL,
        day_index integer NOT NULL DEFAULT 1, sort_order integer NOT NULL DEFAULT 0,
        status text NOT NULL DEFAULT 'locked' CHECK (status IN ('locked', 'ready', 'done')),
        session_meta jsonb NOT NULL DEFAULT '{}'::jsonb);`);
    for (const [order, kind, status] of [[0, "lesson", "done"], [1, "quiz", "ready"], [2, "lesson", "locked"], [3, "quiz", "locked"]] as const) {
      await db.query("INSERT INTO exam_prep_nodes(exam_prep_id, kind, title, sort_order, status) VALUES ($1, $2, $2, $3, $4)", [prep, kind, order, status]);
    }
    await db.exec(read("supabase/migrations/20261020120000_exam_path_insert_after.sql"));
  }, 30_000);
  afterAll(() => db.close());

  it("sonrakileri bir kaydırır, yeni düğümü kilitli olarak hemen arkaya koyar", async () => {
    await db.query("SELECT public.exam_path_insert_after($1, 1, 'focused', 'Odaklı pratik · Nefron', 2, $2::jsonb)", [
      prep,
      JSON.stringify({ adaptive: "low", topicTitle: "Nefron" }),
    ]);
    const { rows } = await db.query<{ kind: string; sort_order: number; status: string; day_index: number }>(
      "SELECT kind, sort_order, status, day_index FROM exam_prep_nodes ORDER BY sort_order",
    );
    expect(rows.map((row) => `${row.sort_order}:${row.kind}:${row.status}`)).toEqual([
      "0:lesson:done",
      "1:quiz:ready",
      "2:focused:locked",
      "3:lesson:locked",
      "4:quiz:locked",
    ]);
    expect(rows[2]?.day_index).toBe(2);
  });

  it("yalnız sunucu çağırır", async () => {
    const { rows } = await db.query<{ grantee: string }>(
      "SELECT grantee FROM information_schema.routine_privileges WHERE routine_name = 'exam_path_insert_after' AND privilege_type = 'EXECUTE'",
    );
    const grantees = rows.map((row) => row.grantee);
    expect(grantees).toContain("service_role");
    expect(grantees).not.toContain("anon");
    expect(grantees).not.toContain("authenticated");
  });
});
