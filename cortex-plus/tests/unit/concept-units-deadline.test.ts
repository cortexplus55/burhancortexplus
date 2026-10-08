/**
 * R7-M1: main's concept-unit step inside the course-map save is bounded by the
 * round deadline, runs one call per file in parallel without retry, is skipped
 * when too little time is left, and never stops the map from being saved.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "./helpers/fake-supabase";
import { model } from "./helpers/outline-model-mock";

const luna = vi.hoisted(() => ({
  created: [] as { timeout: number; maxRetries: number }[],
  calls: 0,
  inFlight: 0,
  maxInFlight: 0,
  delayMs: 0,
}));

vi.mock("@/lib/ai/generate", async () => (await import("./helpers/outline-model-mock")).generateModule());
vi.mock("@/lib/env", async () => {
  const base = (await import("./helpers/outline-model-mock")).outlineEnv;
  return { env: { ...base.env, OPENAI_API_KEY: "k" } };
});
vi.mock("@/lib/ai/model-router", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  contentModel: () => "luna-test",
}));
vi.mock("openai", () => ({
  default: class {
    chat = {
      completions: {
        create: async () => {
          luna.calls += 1;
          luna.inFlight += 1;
          luna.maxInFlight = Math.max(luna.maxInFlight, luna.inFlight);
          await new Promise((r) => setTimeout(r, luna.delayMs));
          luna.inFlight -= 1;
          return { choices: [{ message: { content: '{"topics":[]}' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
        },
      },
    };
    constructor(opts: { timeout: number; maxRetries: number }) {
      luna.created.push({ timeout: opts.timeout, maxRetries: opts.maxRetries });
    }
  },
}));

import { runCourseMapRound } from "@/lib/documents/pdf-learning-v2";
import { CONCEPT_UNITS_RESERVE_MS } from "@/lib/documents/concept-units-run";

const SYL = ["ka", "ze", "mo", "ri", "tu", "la", "ne", "vo", "si", "pe", "du", "go", "fi", "ba", "yu", "ce"];
function heading(file: number, page: number): string {
  const a = SYL[page % 16]! + SYL[(page >> 4) % 16]! + SYL[file % 16]! + "r";
  const b = SYL[(page * 7 + 3) % 16]! + SYL[(page >> 2) % 16]! + SYL[(file + 5) % 16]! + "n";
  return `${a[0]!.toUpperCase()}${a.slice(1)} ${b[0]!.toUpperCase()}${b.slice(1)}`;
}
function pageText(file: number, page: number): string {
  const h = heading(file, page);
  return `${h}\n${h} bu sayfada anlatılır. Tanımlar, örnekler ve çözümlü sorular birlikte verilir; ${h.toLowerCase()} için temel kurallar sırasıyla açıklanır.`;
}
function mkDb(files: number, pages = 12) {
  const ids = Array.from({ length: files }, (_, i) => `d${i}`);
  const fake = makeFakeDb(
    {
      documents: ids.map((id) => ({ id, user_id: "u1", file_name: `${id}.pdf`, topic_map_status: "pending", status: "processing", deleted_at: null })),
      document_pages: ids.flatMap((id, file) =>
        Array.from({ length: pages }, (_, i) => {
          const text = pageText(file, i + 1);
          return { id: `${id}p${i + 1}`, document_id: id, page_number: i + 1, text_content: text, extraction_ok: true, page_kind: null, extraction_method: "text", headings: [], char_count: text.length };
        }),
      ),
      document_topic_map_jobs: [], document_topic_nodes: [], document_topic_page_links: [], document_coverage_reports: [],
      exam_preps: [], exam_prep_topics: [], credit_reservations: [],
    },
    { creditCost: 3 },
  );
  return { ...fake, ids };
}
/** Every file: two big (6-page) topics, so each file wants concept units. */
function bigOutline(files: number) {
  let n = 0;
  const topic = (file: number, start: number) => ({
    id: `t${++n}`, title: heading(file, start), whyLearn: "Bu konuyu öğreneceksin.", description: "",
    fileIndex: file, pageStart: start, pageEnd: start + 5, examWeight: "high", likelyAsked: [], prerequisiteIds: [],
  });
  return {
    units: Array.from({ length: files }, (_, file) => ({
      title: `Ünite ${file + 1}`, examWeight: "medium", topics: [topic(file, 1), topic(file, 7)],
    })),
  };
}
async function rounds(client: any, ids: string[], opts: Record<string, unknown> = {}) {
  const out = [];
  for (let i = 0; i < 8; i += 1) {
    const r = await runCourseMapRound(client, { documentIds: ids, examLabel: "KPSS", ...opts });
    out.push(r);
    if (!r.pending) break;
  }
  return out;
}
const leaves = (db: any) => (db.tables.document_topic_nodes as any[]).filter((n) => n.parent_id);

beforeEach(() => {
  model.calls.length = 0;
  Object.assign(luna, { created: [], calls: 0, inFlight: 0, maxInFlight: 0, delayMs: 0 });
});

describe("R7-M1: concept units inside the course save are deadline-bounded", () => {
  it("30 s left when persist starts → 0 unit calls, map saved with units=[], returns before the deadline", async () => {
    const { db, client, ids } = mkDb(1);
    let skew = 0;
    const deadlineAt = Date.now() + 270_000;
    model.impl = () => {
      // The outline call ate the round: persist will start with ~30 s left
      // (after the 12 s post-call reserve).
      skew = 270_000 - 42_000;
      return bigOutline(1);
    };
    const out = await rounds(client, ids, { deadlineAt, now: () => Date.now() + skew });
    expect(out.at(-1)).toMatchObject({ ok: true });
    expect(Date.now() + skew).toBeLessThan(deadlineAt);
    expect(luna.calls).toBe(0);
    expect(leaves(db).length).toBe(2);
    expect(leaves(db).every((n) => Array.isArray(n.units) && n.units.length === 0)).toBe(true);
    expect((db.tables.documents as any[])[0]).toMatchObject({ topic_map_status: "ready" });
  });

  it("8-file course: unit calls run in parallel, capped to the time left, no retry; one per file; none after the save", async () => {
    const { db, client, ids } = mkDb(8);
    luna.delayMs = 300;
    model.impl = () => bigOutline(8);
    const started = Date.now();
    const out = await rounds(client, ids);
    expect(out.at(-1)).toMatchObject({ ok: true });
    expect(luna.calls).toBe(8);
    expect(luna.maxInFlight).toBe(8);
    // 8 × 300 ms sequential would be 2.4 s; parallel is about one call.
    expect(Date.now() - started).toBeLessThan(8 * 300);
    for (const c of luna.created) {
      expect(c.maxRetries).toBe(0);
      expect(c.timeout).toBeLessThanOrEqual(120_000);
      expect(c.timeout).toBeLessThanOrEqual(270_000 - 12_000 - CONCEPT_UNITS_RESERVE_MS);
    }
    expect(leaves(db).length).toBe(16);
    // Polls and later rounds on the saved course make no further unit call.
    await rounds(client, ids);
    await rounds(client, [ids[0]!]);
    expect(luna.calls).toBe(8);
  });

  it("a hanging provider cannot hold the save past the round: the call is capped to the time left", async () => {
    const { db, client, ids } = mkDb(2);
    let skew = 0;
    model.impl = () => {
      skew = 270_000 - 12_000 - 46_000; // 46 s left for persist → units run, capped to ~21 s
      return bigOutline(2);
    };
    const deadlineAt = Date.now() + 270_000;
    const out = await rounds(client, ids, { deadlineAt, now: () => Date.now() + skew });
    expect(out.at(-1)).toMatchObject({ ok: true });
    expect(luna.calls).toBe(2);
    for (const c of luna.created) {
      expect(c.maxRetries).toBe(0);
      expect(c.timeout).toBeLessThanOrEqual(46_000 - CONCEPT_UNITS_RESERVE_MS + 1_000);
      expect(c.timeout).toBeGreaterThan(0);
    }
    expect(leaves(db).length).toBe(4);
  });
});
