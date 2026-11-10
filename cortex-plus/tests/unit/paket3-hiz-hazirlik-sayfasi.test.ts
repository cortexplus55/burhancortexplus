/**
 * Paket 3 hız (6 Kasım 2026): hazırlık sayfası (`/deneme-sinavlari/[prepId]`) veritabanına art arda
 * ~30 gidiş-dönüş yapıyordu. Hazırlık tek select'le okunur, konu adları konu listesinden türetilir,
 * deneme puanı ilerleme kayıtlarından alınır ve bağımsız okumalar dalgalar hâlinde aynı anda gider.
 * Bu test sahte istemciyle her tabloya kaç okuma gittiğini ve dalga yapısını sayar: geri düşmesin.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { readFileSync } from "node:fs";

type Call = { table: string; select: string; filters: unknown[][] };
type Event = { kind: "start" | "end"; table: string };

const state = vi.hoisted(() => ({
  user: null as unknown,
  service: null as unknown,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/server", () => ({ after: () => undefined }));
vi.mock("next/headers", () => ({ headers: async () => new Map([["host", "cortexplus.test"]]) }));
vi.mock("@/lib/learning/lesson-prefetch", () => ({ requestPrepPrefetch: async () => undefined }));
vi.mock("@/lib/documents/vector-lifecycle", () => ({ reindexEvictedForPrep: async () => 0 }));
vi.mock("@/lib/rag/pipeline", () => ({ embedTexts: async () => [] }));
vi.mock("@/components/parity/sor-shell", () => ({ ParitySorShell: (p: { children: ReactNode }) => p.children }));
vi.mock("@/components/level-check/unit-level-check", () => ({ UnitLevelCheck: () => null }));
vi.mock("@/components/level-check/mastery-map", () => ({ MasteryMap: () => null }));
vi.mock("@/components/camp/camp-card", () => ({ CampCard: () => null }));
vi.mock("@/components/parity/exam-prep-home", () => ({ ExamPrepHome: function ExamPrepHome() { return null; } }));
vi.mock("@/lib/level-check/unit-offer", () => ({ unitCheckOffer: async () => null }));
vi.mock("@/lib/mastery-map/load", () => ({ loadMapInputs: async () => null }));
vi.mock("@/lib/mastery-map/net-load", () => ({ prepNetEstimate: async () => null }));
vi.mock("@/lib/auth/session", () => ({
  requireStudentArea: async () => ({ supabase: state.user, user: { id: "u1", email: "o@x.test" } }),
}));
vi.mock("@/lib/student/parity-shell-props", () => ({ loadParityShellProps: async () => ({}) }));
vi.mock("@/lib/learning/exam-prep-insert", () => ({
  ensurePrepNodes: async () => undefined,
  ensurePathSkeletonNodes: async () => undefined,
}));
vi.mock("@/lib/admin/feature-flags", () => ({
  isFeatureEnabled: async () => true,
  PDF_LEARNING_V2_FLAG: "pdf_learning_v2",
}));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => state.service }));
vi.mock("@/lib/billing/node-free-meter", () => ({ pathSkipKinds: async () => new Set<string>() }));
vi.mock("@/lib/billing/free-topic-gate", () => ({ freeTopicLocks: async () => null }));
vi.mock("@/lib/content-pool/lesson-preview", () => ({ poolLessonPreview: async () => null }));
vi.mock("@/lib/billing/entitlements", () => ({ getUserEntitlements: async () => ({ showsUpgradeChrome: false }) }));
vi.mock("@/lib/billing/plan-prices", () => ({ loadPlusPrices: async () => ({ plusWeekly: 0 }) }));
vi.mock("@/lib/camp/offer", () => ({ campOffer: () => null }));
vi.mock("@/lib/learning/review-items-store", () => ({ dueReviewCountForPrep: async () => 0 }));
vi.mock("@/lib/learning/pending-materials", () => ({ countPendingMaterials: async () => 0 }));
vi.mock("@/lib/learning/exam-result-load", () => ({ loadExamBaseline: async () => null }));

type Responder = (call: Call) => { data?: unknown; error?: unknown; count?: number | null };

function fakeClient(calls: Call[], events: Event[], respond: Responder) {
  return {
    from(table: string) {
      const call: Call = { table, select: "", filters: [] };
      calls.push(call);
      events.push({ kind: "start", table });
      const builder: Record<string, unknown> = new Proxy(
        {},
        {
          get(_target, prop: string) {
            if (prop === "then") {
              return (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
                Promise.resolve()
                  .then(() => Promise.resolve())
                  .then(() => {
                    events.push({ kind: "end", table });
                    const out = respond(call);
                    return { data: out.data ?? null, error: out.error ?? null, count: out.count ?? null };
                  })
                  .then(onOk, onErr);
            }
            return (...args: unknown[]) => {
              if (prop === "select") call.select = String(args[0] ?? "");
              else call.filters.push([prop, ...args]);
              return builder;
            };
          },
        },
      );
      return builder;
    },
  };
}

const PREP = {
  id: "p1",
  title: "Biyoloji",
  exam_type: "YKS",
  study_plan_id: null,
  exam_date: null,
  created_at: "2026-11-01T00:00:00Z",
  active_topic_id: "t2",
  intro_completed_at: null,
  intro_deferred_at: null,
  schedule_v2: null,
  learning_tracking: null,
  target_score: 70,
  daily_minutes: 45,
  study_days: null,
  hard_topics_self: [],
  learning_preferences: {},
};
const EXTRAS = { document_id: "d1", source_document_ids: ["d1"], visibility: "school", view_count: 3, forked_from: null };

/** `.eq(kolon, değer)` süzgeçlerini uygular; `maybeSingle` ilk satırı verir. */
function pick(call: Call, single: boolean, rows: Record<string, unknown>[]) {
  const kept = rows.filter((row) =>
    call.filters.every(([name, column, value]) => name !== "eq" || !(String(column) in row) || row[String(column)] === value),
  );
  return single ? (kept[0] ?? null) : kept;
}

function responder(opts: { mergedFails?: boolean }): Responder {
  return (call) => {
    const single = call.filters.some(([name]) => name === "maybeSingle");
    switch (call.table) {
      case "exam_preps": {
        if (call.select.includes("forked_from") && call.select.includes("learning_preferences")) {
          return opts.mergedFails ? { error: { code: "42703" } } : { data: { ...PREP, ...EXTRAS } };
        }
        if (call.select.includes("learning_preferences")) return { data: PREP };
        if (call.select.includes("source_document_ids")) return { data: { document_id: "d1", source_document_ids: ["d1"] } };
        if (call.select.includes("visibility")) return { data: { visibility: "school", view_count: 3, forked_from: null } };
        return { data: single ? null : [] };
      }
      case "profiles":
        return { data: { school_id: "s1", school_name: "Okul" } };
      case "documents":
        return { data: [{ id: "d1", file_name: "notlar.pdf", mime_type: "application/pdf", page_count: 4 }] };
      case "exam_prep_topics":
        if (call.select.includes("contradictions")) return { data: [] };
        return {
          data: pick(call, single, [
            { id: "t1", label: "Hücre", sort_order: 0, status: "ready", lesson_id: null, document_topic_node_id: null },
            { id: "t2", label: " Kalıtım ", sort_order: 1, status: "ready", lesson_id: null, document_topic_node_id: null },
          ]),
        };
      case "exam_prep_nodes":
        return {
          data: [
            { id: "n1", kind: "lesson", title: "Ders", day_index: 0, sort_order: 0, status: "done", session_meta: {} },
            { id: "n2", kind: "written_exam", title: "Yazılı deneme", day_index: 1, sort_order: 1, status: "done", session_meta: {} },
            { id: "n3", kind: "quiz", title: "Test", day_index: 2, sort_order: 2, status: "ready", session_meta: {} },
          ],
        };
      case "exam_prep_topic_mastery":
        return { data: [] };
      case "exam_prep_misconceptions":
        return call.select === "id" ? { count: 0 } : { data: [] };
      case "exam_prep_node_attempts":
        return {
          data: pick(call, single, [
            { node_id: "n2", score: 8, total: 10, created_at: "2026-11-02T10:00:00Z", payload: {}, topic_id: null },
            { node_id: "n2", score: 2, total: 10, created_at: "2026-11-01T10:00:00Z", payload: {}, topic_id: null },
          ]),
        };
      default:
        return { data: single ? null : [] };
    }
  };
}

function findHomeProps(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findHomeProps(child);
      if (hit) return hit;
    }
    return null;
  }
  const el = node as ReactElement<Record<string, unknown>>;
  if (typeof el.type === "function" && (el.type as { name?: string }).name === "ExamPrepHome") return el.props;
  return findHomeProps(el.props?.children);
}

async function renderPage(opts: { mergedFails?: boolean } = {}) {
  const userCalls: Call[] = [];
  const serviceCalls: Call[] = [];
  const events: Event[] = [];
  state.user = fakeClient(userCalls, events, responder(opts));
  state.service = fakeClient(serviceCalls, events, responder(opts));
  const { default: Page } = await import("@/app/deneme-sinavlari/[prepId]/page");
  const tree = await Page({ params: Promise.resolve({ prepId: "p1" }), searchParams: Promise.resolve({}) });
  const count = (table: string) => userCalls.filter((call) => call.table === table).length;
  return { userCalls, serviceCalls, events, count, home: findHomeProps(tree) };
}

describe("hazırlık sayfası veritabanı gidiş-dönüşleri", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("hazırlık tek select'le, konu tablosu iki kez (liste + uyarılar), deneme kaydı tek okumayla", async () => {
    const { count, home, userCalls } = await renderPage();
    expect(count("exam_preps")).toBe(1);
    expect(count("profiles")).toBe(1);
    expect(count("documents")).toBe(1);
    // loadOrBackfillTopics + loadTopicWarnings; etkin konu, planlanan konular ve seçenekler listeden.
    expect(count("exam_prep_topics")).toBe(2);
    // Deneme puanı ilerleme kayıtlarından: ayrı "son deneme" okuması yok.
    expect(count("exam_prep_node_attempts")).toBe(1);
    expect(count("exam_prep_nodes")).toBe(1);
    expect(count("exam_prep_topic_mastery")).toBe(1);
    // 10 Kasım 2026: notlanmış denemeler kendi kaydından (aynı paralel dalgada tek okuma; deneme yoksa ek okuma yok).
    expect(count("practice_exams")).toBe(1);
    expect(userCalls.length).toBeLessThanOrEqual(12);

    expect(home).not.toBeNull();
    expect(home!.activeTopicLabel).toBe(" Kalıtım ");
    expect(home!.initialShared).toBe(true);
    expect(home!.joinCount).toBe(3);
    expect(home!.canShare).toBe(true);
    expect(home!.documentId).toBe("d1");
    expect(home!.documentName).toBe("notlar.pdf");
    expect((home!.settings as { topicOptions: string[] }).topicOptions).toEqual(["Hücre", "Kalıtım"]);
    // En son tamamlanan deneme kaydı (8/10), eski kayıt (2/10) değil.
    expect((home!.learningTracking as { mockPct: number | null }).mockPct).toBe(80);
  });

  it("bağımsız okumalar aynı dalgada başlar: ilk yanıt gelmeden hepsi yolda", async () => {
    const { events } = await renderPage();
    const firstEnd = (table: string) => events.findIndex((e) => e.kind === "end" && e.table === table);
    const start = (table: string) => events.findIndex((e) => e.kind === "start" && e.table === table);
    // Dalga 1: hazırlık ve profil birlikte.
    expect(start("profiles")).toBeLessThan(firstEnd("exam_preps"));
    // Dalga 2: belge, konu, hâkimiyet, yanılgı ve ilerleme kayıtları birlikte.
    const wave2End = Math.min(
      ...["documents", "exam_prep_topics", "exam_prep_topic_mastery", "exam_prep_node_attempts"].map(firstEnd),
    );
    for (const table of ["documents", "exam_prep_topics", "exam_prep_topic_mastery", "exam_prep_misconceptions", "exam_prep_node_attempts"]) {
      expect(start(table), table).toBeLessThan(wave2End);
    }
  });

  it("birleşik select düşerse (sütun yok) eski okumalara geçer ve sayfa aynı veriyi çizer", async () => {
    const { count, home } = await renderPage({ mergedFails: true });
    // birleşik + ana + kaynak + paylaşım
    expect(count("exam_preps")).toBe(4);
    expect(home!.documentId).toBe("d1");
    expect(home!.initialShared).toBe(true);
    expect(home!.joinCount).toBe(3);
    expect((home!.learningTracking as { mockPct: number | null }).mockPct).toBe(80);
  });

  it("yazımlar sunucu anahtarıyla kalır; sahiplik süzgeci ana okumada", () => {
    const page = readFileSync("src/app/deneme-sinavlari/[prepId]/page.tsx", "utf8");
    expect(page).toContain("await ensurePrepNodes(service, prep);");
    expect(page).toContain("await ensurePathSkeletonNodes(service, prep.id);");
    expect(page).toMatch(/\.eq\("id", prepId\)\s*\.eq\("user_id", user\.id\)/);
    expect(page.match(/await Promise\.all\(/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});
