/**
 * The one course-level map pipeline end to end: fake Supabase, the real
 * credits service, and a generateJson mock that reserves / refunds / defers
 * exactly like production (so a spent key really blocks a model call).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "./helpers/fake-supabase";
import { HANG, model } from "./helpers/outline-model-mock";

const calls = model.calls;

vi.mock("@/lib/ai/generate", async () => (await import("./helpers/outline-model-mock")).generateModule());
vi.mock("@/lib/env", async () => (await import("./helpers/outline-model-mock")).outlineEnv);

const route = vi.hoisted(() => ({ service: null as unknown }));
vi.mock("@/lib/api/guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/guards")>();
  return { ...actual, withUser: async () => ({ ok: true, ctx: { userId: "u1", service: route.service } }) };
});
vi.mock("@/lib/admin/feature-flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/feature-flags")>();
  return { ...actual, isFeatureEnabled: async () => true };
});

import { MAX_OUTLINE_CALLS, runCourseMapRound } from "@/lib/documents/pdf-learning-v2";
import { loadOneshotIntakeTopics } from "@/lib/learning/intake-outline";

const COST = 3;
const SYL = ["ka", "ze", "mo", "ri", "tu", "la", "ne", "vo", "si", "pe", "du", "go", "fi", "ba", "yu", "ce"];
/** A distinct two-word heading for every page of every file. */
function heading(file: number, page: number): string {
  const a = SYL[page % 16]! + SYL[(page >> 4) % 16]! + SYL[file % 16]! + "r";
  const b = SYL[(page * 7 + 3) % 16]! + SYL[(page >> 2) % 16]! + SYL[(file + 5) % 16]! + "n";
  return `${a[0]!.toUpperCase()}${a.slice(1)} ${b[0]!.toUpperCase()}${b.slice(1)}`;
}
function pageText(file: number, page: number): string {
  const h = heading(file, page);
  return `${h}\n${h} bu sayfada anlatılır. Tanımlar, örnekler ve çözümlü sorular birlikte verilir; ${h.toLowerCase()} için temel kurallar sırasıyla açıklanır. Öğrenci konuyu adım adım izler ve kısa alıştırmalarla pekiştirir.`;
}

type Doc = { id: string; name: string; pages: number; file: number };
function mkDb(docs: Doc[], extra: Record<string, any[]> = {}) {
  return makeFakeDb(
    {
      documents: docs.map((d) => ({ id: d.id, user_id: "u1", file_name: d.name, topic_map_status: "pending", status: "processing", deleted_at: null })),
      document_pages: docs.flatMap((d) =>
        Array.from({ length: d.pages }, (_, i) => {
          const text = pageText(d.file, i + 1);
          return { id: `${d.id}p${i + 1}`, document_id: d.id, page_number: i + 1, text_content: text, extraction_ok: true, page_kind: null, extraction_method: "text", headings: [], char_count: text.length };
        }),
      ),
      document_topic_map_jobs: [], document_topic_nodes: [], document_topic_page_links: [], document_coverage_reports: [],
      exam_preps: [], exam_prep_topics: [], credit_reservations: [],
      ...extra,
    },
    { creditCost: COST },
  );
}

type Topic = [file: number, page: number];
/** A valid outline: one topic per (file, page), titled by that page's heading. */
function outline(units: { title: string; topics: Topic[] }[]) {
  let n = 0;
  return {
    units: units.map((u) => ({
      title: u.title,
      examWeight: "medium",
      topics: u.topics.map(([file, page]) => ({
        id: `t${++n}`, title: heading(file, page), whyLearn: "Bu konuyu öğreneceksin.", description: "",
        fileIndex: file, pageStart: page, pageEnd: page, examWeight: "high", likelyAsked: [], prerequisiteIds: [],
      })),
    })),
  };
}
const JUNK = { units: [{ title: "Diğer Konular", topics: [{ title: "Uydurma Başlık", pageStart: 1, pageEnd: 1 }] }] };
const oneFile = (pages: number[]) => outline([{ title: "Ünite", topics: pages.map((p) => [0, p] as Topic) }]);

async function runRounds(client: any, ids: string[], opts: Record<string, unknown> = {}, max = 8) {
  const results = [];
  for (let i = 0; i < max; i += 1) {
    const r = await runCourseMapRound(client, { documentIds: ids, examLabel: "KPSS", examDate: "2026-10-26", ...opts });
    results.push(r);
    if (!r.pending) break;
  }
  return results;
}

beforeEach(() => {
  calls.length = 0;
  model.impl = () => null;
});

describe("course map round (fake DB, real credit semantics)", () => {
  it("same file uploaded 3 times → 3 maps, one model call and one charge each", async () => {
    for (const id of ["up1", "up2", "up3"]) {
      const { db, client, chargedCredits } = mkDb([{ id, name: "kitap.pdf", pages: 12, file: 0 }]);
      model.impl = () => oneFile([1, 2, 3, 4, 5, 6]);
      const before = calls.length;
      const rounds = await runRounds(client, [id]);
      expect(rounds.at(-1)).toMatchObject({ ok: true, topics: 6 });
      expect(calls.length - before).toBe(1);
      expect(db.tables.documents![0]!.topic_map_status).toBe("ready");
      expect(chargedCredits("u1")).toBe(COST);
    }
  });

  it("a rejected mini draft really calls gpt-4.1 in the next round; only the kept call is charged", async () => {
    const { db, client, chargedCredits } = mkDb([{ id: "d1", name: "k.pdf", pages: 12, file: 0 }]);
    model.impl = (p) => (p.modelOverride === "gpt-4o-mini" ? JUNK : oneFile([1, 2, 3, 4]));
    const rounds = await runRounds(client, ["d1"]);
    expect(rounds.map((r) => r.pending ?? false)).toEqual([true, false]);
    expect(rounds[0]!.stage).toBe("escalate");
    expect(calls.map((c) => c.model)).toEqual(["gpt-4o-mini", "gpt-4.1"]);
    expect(calls[0]!.key).not.toBe(calls[1]!.key);
    const statuses = (db.tables.credit_reservations as any[]).map((r) => r.status);
    expect(statuses).toEqual(["refunded", "committed"]);
    expect(chargedCredits("u1")).toBe(COST);
  });

  it("a hard-killed round's pending reservation is refunded and a new call is made", async () => {
    const { db, client, chargedCredits } = mkDb([{ id: "d1", name: "k.pdf", pages: 12, file: 0 }]);
    model.impl = () => HANG;
    void runCourseMapRound(client, { documentIds: ["d1"] });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    // The function was killed: its lease simply expires.
    db.tables.document_topic_map_jobs![0]!.lease_until = new Date(0).toISOString();
    model.impl = () => oneFile([1, 2, 3]);
    const rounds = await runRounds(client, ["d1"]);
    expect(rounds.at(-1)).toMatchObject({ ok: true, topics: 3 });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.key).not.toBe(calls[0]!.key);
    const rows = db.tables.credit_reservations as any[];
    expect(rows.find((r) => r.idempotency_key === calls[0]!.key)!.status).toBe("refunded");
    expect(chargedCredits("u1")).toBe(COST);
  });

  it("our own deadline abort keeps the stage checkpointed; the next round retries it", async () => {
    const { db, client, chargedCredits } = mkDb([{ id: "d1", name: "k.pdf", pages: 12, file: 0 }]);
    let n = 0;
    model.impl = () => (++n === 1 ? { error: "deadline" } : oneFile([1, 2]));
    const first = await runCourseMapRound(client, { documentIds: ["d1"] });
    expect(first).toMatchObject({ ok: true, pending: true, stage: "first" });
    const meta = (db.tables.document_topic_map_jobs![0]!.topics as any[])[0];
    expect(meta).toMatchObject({ phase: "course", stage: "first", failures: 1 });
    const rounds = await runRounds(client, ["d1"]);
    expect(rounds.at(-1)).toMatchObject({ ok: true, topics: 2 });
    expect(calls.map((c) => c.model)).toEqual(["gpt-4o-mini", "gpt-4o-mini"]);
    expect(chargedCredits("u1")).toBe(COST);
  });

  it("does not start a call that cannot finish in the round (no call, stays pending)", async () => {
    const { client } = mkDb([{ id: "d1", name: "k.pdf", pages: 12, file: 0 }]);
    model.impl = () => oneFile([1]);
    const r = await runCourseMapRound(client, { documentIds: ["d1"], deadlineAt: Date.now() + 20_000 });
    expect(r).toMatchObject({ pending: true, stage: "first" });
    expect(calls).toHaveLength(0);
  });

  it("provider failures stop within the call cap: failed map, no fabricated list, nothing charged", async () => {
    const { db, client, chargedCredits } = mkDb([{ id: "d1", name: "k.pdf", pages: 12, file: 0 }]);
    model.impl = () => ({ error: "generation_failed" });
    const rounds = await runRounds(client, ["d1"], {}, 12);
    const last = rounds.at(-1)!;
    expect(last).toMatchObject({ ok: false, error: "topic_map_unavailable", retryable: false });
    expect(calls.length).toBeLessThanOrEqual(MAX_OUTLINE_CALLS);
    expect(db.tables.documents![0]).toMatchObject({ status: "processing", topic_map_status: "failed", topic_map_error: "topic_map_unavailable" });
    expect(db.tables.document_topic_nodes).toHaveLength(0);
    expect(db.tables.document_topic_map_jobs).toHaveLength(0);
    expect(chargedCredits("u1")).toBe(0);
  });

  it("validation rejecting every draft is final after ONE first → escalate → repair cycle", async () => {
    const { db, client, chargedCredits } = mkDb([{ id: "d1", name: "k.pdf", pages: 12, file: 0 }]);
    model.impl = () => JUNK;
    const rounds = await runRounds(client, ["d1"], {}, 12);
    expect(rounds.at(-1)).toMatchObject({ ok: false, error: "topic_map_unavailable" });
    expect(calls.map((c) => `${c.model}:${c.key.split(":").pop()}`)).toEqual([
      "gpt-4o-mini:first",
      "gpt-4.1:escalate",
      "gpt-4.1:repair",
    ]);
    expect(db.tables.documents![0]).toMatchObject({ topic_map_status: "failed" });
    expect(chargedCredits("u1")).toBe(0);
  });

  it("12 + 16 pages → one call on gpt-4o-mini; 16 + 16 → one call on gpt-4.1", async () => {
    for (const [pagesA, pagesB, routed] of [[12, 16, "gpt-4o-mini"], [16, 16, "gpt-4.1"]] as const) {
      calls.length = 0;
      const { client, chargedCredits } = mkDb([
        { id: "dA", name: "a.pdf", pages: pagesA, file: 0 },
        { id: "dB", name: "b.pdf", pages: pagesB, file: 1 },
      ]);
      model.impl = () => outline([{ title: "Ünite", topics: [[0, 2], [1, 3], [0, 5]] }]);
      const rounds = await runRounds(client, ["dA", "dB"]);
      expect(rounds.at(-1)).toMatchObject({ ok: true, topics: 3 });
      expect(calls.map((c) => c.model)).toEqual([routed]);
      expect(calls[0]!.prompt).toContain("[d2 s.3]");
      expect(chargedCredits("u1")).toBe(COST);
    }
  });

  it("intake reads the course back in the ONE cross-file order", async () => {
    const { db, client } = mkDb([
      { id: "dA", name: "a.pdf", pages: 12, file: 0 },
      { id: "dB", name: "b.pdf", pages: 16, file: 1 },
    ]);
    model.impl = () =>
      outline([
        { title: "Birinci Ünite", topics: [[1, 4], [0, 2]] },
        { title: "İkinci Ünite", topics: [[0, 7], [1, 9], [0, 3]] },
      ]);
    await runRounds(client, ["dA", "dB"]);
    const nodes = db.tables.document_topic_nodes as any[];
    expect(nodes.filter((n) => n.document_id === "dA" && n.parent_id).length).toBe(3);
    expect(nodes.filter((n) => n.document_id === "dB" && n.parent_id).length).toBe(2);
    const intake = await loadOneshotIntakeTopics(client as any, "u1", ["dA", "dB"]);
    expect(intake!.topics.map((t) => t.title)).toEqual([
      heading(1, 4), heading(0, 2), heading(0, 7), heading(1, 9), heading(0, 3),
    ]);
    expect(intake!.topics.map((t) => t.sources[0]!.documentId)).toEqual(["dB", "dA", "dA", "dB", "dA"]);
    expect(intake!.units).toEqual([
      { title: "Birinci Ünite", topicIndexes: [0, 1] },
      { title: "İkinci Ünite", topicIndexes: [2, 3, 4] },
    ]);
  });

  it("add-source: one call that carries the prep's existing topics", async () => {
    const { client } = mkDb([{ id: "dN", name: "yeni.pdf", pages: 10, file: 0 }], {
      exam_preps: [{ id: "p1", user_id: "u1", document_id: "old", source_document_ids: ["old"] }],
      exam_prep_topics: [{ id: "x1", exam_prep_id: "p1", label: "Var Olan Konu Başlığı", sort_order: 0 }],
    });
    model.impl = () => oneFile([1, 2]);
    const rounds = await runRounds(client, ["dN"], { prepId: "p1" });
    expect(rounds.at(-1)).toMatchObject({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.prompt).toContain("Var Olan Konu Başlığı");
  });

  it("2 × 600 pages: parts carry global file labels; merged topics land on file 2", async () => {
    const { db, client, chargedCredits } = mkDb([
      { id: "dA", name: "a.pdf", pages: 600, file: 0 },
      { id: "dB", name: "b.pdf", pages: 600, file: 1 },
    ]);
    model.impl = (p) =>
      p.userPrompt.includes("Kısmi taslak")
        ? outline([{ title: "Ünite", topics: [[1, 450], [0, 12]] }])
        : outline([{ title: "Ünite", topics: [[0, 1]] }]);
    const rounds = await runRounds(client, ["dA", "dB"]);
    expect(rounds.at(-1)).toMatchObject({ ok: true, topics: 2 });
    const parts = calls.filter((c) => c.key.includes(":part"));
    expect(parts.length).toBeGreaterThan(1);
    // Page lines start with the page's (capitalised) heading.
    expect(parts.some((c) => /\[d2 s\.\d+\] \p{Lu}/u.test(c.prompt) && !/\[d1 s\.\d+\] \p{Lu}/u.test(c.prompt))).toBe(true);
    expect(calls.filter((c) => c.key.endsWith(":merge"))).toHaveLength(1);
    const leaves = (db.tables.document_topic_nodes as any[]).filter((n) => n.parent_id);
    expect(leaves.find((n) => n.title === heading(1, 450))!.document_id).toBe("dB");
    // Every part plus the merge made the kept map — each charged once.
    expect(chargedCredits("u1")).toBe(COST * calls.length);
  });
});

describe("process route: extract per file, then ONE course outline", () => {
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const post = (body: unknown) =>
    new Request("http://test.local/api/documents/process", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("defers the map per file, runs one call for the course, charges each file once", async () => {
    const fake = mkDb(
      [
        { id: A, name: "a.pdf", pages: 12, file: 0 },
        { id: B, name: "b.pdf", pages: 16, file: 1 },
      ],
      {
        document_chunks: [{ id: "c1", document_id: A }, { id: "c2", document_id: B }],
        document_ingestion_state: [
          { document_id: A, status: "ready", total_pages: 12 },
          { document_id: B, status: "ready", total_pages: 16 },
        ],
        processing_jobs: [{ document_id: A, status: "processing" }, { document_id: B, status: "processing" }],
        credit_reservations: [A, B].map((id) => ({
          id: `doc-${id}`, user_id: "u1", idempotency_key: `document_process_${id}`,
          action_code: "DOCUMENT_PAGE_PROCESS", status: "pending", amount: 5, claim_token: null,
        })),
      },
    );
    for (const doc of fake.db.tables.documents as any[]) doc.mime_type = "application/pdf";
    route.service = fake.client;
    model.impl = () => outline([{ title: "Ünite", topics: [[0, 2], [1, 3]] }]);
    const { POST } = await import("@/app/api/documents/process/route");

    const deferred = await POST(post({ documentId: A, deferMap: true }));
    expect(deferred.status).toBe(200);
    expect(await deferred.json()).toMatchObject({ status: "completed", mapDeferred: true });
    expect(calls).toHaveLength(0);

    const done = await POST(post({ documentId: A, courseDocumentIds: [A, B], examType: "KPSS" }));
    expect(done.status).toBe(200);
    expect(await done.json()).toMatchObject({ status: "completed" });
    expect(calls).toHaveLength(1);
    expect((fake.db.tables.documents as any[]).map((d) => [d.status, d.topic_map_status])).toEqual([
      ["completed", "ready"],
      ["completed", "ready"],
    ]);

    // Polling again never re-runs the outline or charges twice.
    const again = await POST(post({ documentId: A, courseDocumentIds: [A, B] }));
    expect(again.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(fake.chargedCredits("u1")).toBe(5 + 5 + COST);
  });

  it("rejects a course whose first file is not the request's document", async () => {
    route.service = mkDb([]).client;
    const { POST } = await import("@/app/api/documents/process/route");
    const res = await POST(post({ documentId: A, courseDocumentIds: [B, A] }));
    expect(res.status).toBe(400);
  });
});
