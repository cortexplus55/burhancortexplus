/**
 * Round-5 regressions (review V9 + V4): a map a study plan already uses is
 * never rewritten, never marked failed and never loses its topics — not by
 * the rebuild button, not by a retry, not by the wizard's course outline.
 * No model call is spent on it and no outline reservation is left pending.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "./helpers/fake-supabase";
import { model, processRequest, routeTables, titledOutline } from "./helpers/outline-model-mock";

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

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const SYL = ["ka", "ze", "mo", "ri", "tu", "la", "ne", "vo", "si", "pe", "du", "go", "fi", "ba", "yu", "ce"];
const heading = (file: number, page: number) => {
  const a = SYL[page % 16]! + SYL[(page >> 4) % 16]! + SYL[file % 16]! + "r";
  const b = SYL[(page * 7 + 3) % 16]! + SYL[(page >> 2) % 16]! + SYL[(file + 5) % 16]! + "n";
  return `${a[0]!.toUpperCase()}${a.slice(1)} ${b[0]!.toUpperCase()}${b.slice(1)}`;
};
const pages = (file: number, count: number) =>
  Array.from({ length: count }, (_, i) => {
    const h = heading(file, i + 1);
    return `${h}\n${h} bu sayfada anlatılır. Tanımlar, örnekler ve çözümlü sorular birlikte verilir; kurallar sırasıyla açıklanır.`;
  });
const JUNK = titledOutline([["Fotosentez ve Hücre Solunumu", 1, 2]]);
const good = (file = 0) => titledOutline([[heading(file, 2), 2, 2, 0], [heading(file, 7), 7, 7, 0]]);

const OLD_NODES = [
  { id: "on1", document_id: A, parent_id: null, title: "Eski ünite", sort_order: 0, is_student_edited: false, key_relations: [] },
  { id: "on2", document_id: A, parent_id: "on1", title: "Eski konu", sort_order: 1, is_student_edited: false, key_relations: [] },
];

/** A is extracted and has an old (pre-rules) ready map; `used` links it to a plan. */
function db(opts: { used: boolean; tms?: string; error?: string | null; extra?: { id: string; name: string }[] }) {
  const docs = [{ id: A, name: "kpss.pdf", pages: pages(0, 12) }, ...(opts.extra ?? []).map((d, i) => ({ ...d, pages: pages(i + 1, 12) }))];
  const tables = routeTables(docs);
  const a = tables.documents![0]!;
  Object.assign(a, {
    status: "completed",
    topic_map_status: opts.tms ?? "ready",
    topic_map_error: opts.error ?? null,
    topic_map_updated_at: "2026-08-01T00:00:00Z",
  });
  tables.credit_reservations![0]!.status = "committed";
  tables.document_topic_nodes = OLD_NODES.map((n) => ({ ...n }));
  if (opts.used) {
    tables.exam_preps = [{ id: "p1", user_id: "u1", document_id: A, source_document_ids: [A] }];
    tables.exam_prep_topics = [{ id: "x1", exam_prep_id: "p1", document_topic_node_id: "on2", label: "Eski konu", sort_order: 0 }];
  }
  const fake = makeFakeDb(tables, { creditCost: 3 });
  route.service = fake.client;
  return fake;
}
type Fake = ReturnType<typeof db>;
const outlineRes = (fake: Fake) => fake.reservations().filter((r: any) => r.action_code === "STUDY_PLAN_GENERATE");
const docA = (fake: Fake) => fake.db.tables.documents!.find((d: any) => d.id === A)!;
const nodesA = (fake: Fake) => fake.db.tables.document_topic_nodes!.filter((n: any) => n.document_id === A).map((n: any) => n.id);

async function post(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/documents/process/route");
  const res = await POST(processRequest(body));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
async function until(body: Record<string, unknown>, max = 8) {
  let last = await post(body);
  for (let i = 1; i < max && last.status === 202; i += 1) last = await post(body);
  return last;
}
async function rebuild(id = A) {
  const { POST } = await import("@/app/api/documents/[documentId]/topic-map/route");
  const res = await POST(
    new Request(`http://test.local/api/documents/${id}/topic-map`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "rebuild" }),
    }),
    { params: Promise.resolve({ documentId: id }) },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
async function intake(id = A) {
  const { POST } = await import("@/app/api/learning/exam-prep/intake/route");
  const res = await POST(new Request("http://test.local/api/learning/exam-prep/intake", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ documentId: id, probeOnly: true }),
  }));
  return res.status;
}

beforeEach(() => {
  model.calls.length = 0;
  model.impl = () => good();
});

describe("V9: rebuild on a map a study plan uses", () => {
  it("is refused calmly: status, nodes and credits untouched, 0 model calls; the document keeps working", async () => {
    const fake = db({ used: true });
    const r = await rebuild();
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ code: "topic_map_in_use", inUse: true });
    expect(String(r.body.error)).toMatch(/çalışma planında kullanılıyor/);
    expect(docA(fake)).toMatchObject({ status: "completed", topic_map_status: "ready", topic_map_error: null });
    expect(nodesA(fake)).toEqual(["on1", "on2"]);
    expect(model.calls).toHaveLength(0);
    expect(outlineRes(fake)).toHaveLength(0);

    // Plan creation from it is not stuck on "hâlâ hazırlanıyor".
    expect(await intake()).not.toBe(409);
    // Poller, retry button: no call, nothing changes, still completed.
    expect((await post({ documentId: A })).status).toBe(200);
    expect((await until({ documentId: A, retryMap: true })).status).toBe(200);
    expect(model.calls).toHaveLength(0);
    expect(docA(fake)).toMatchObject({ status: "completed", topic_map_status: "ready" });
    expect(nodesA(fake)).toEqual(["on1", "on2"]);
    expect(fake.db.tables.document_topic_map_jobs!.filter((j: any) => (j.topics as unknown[] | null)?.length)).toHaveLength(0);
  });

  it("a wizard course that includes the in-use file makes no call for it and keeps it completed", async () => {
    const fake = db({ used: true, extra: [{ id: B, name: "yeni.pdf" }] });
    model.impl = () => good(1);
    const done = await until({ documentId: A, courseDocumentIds: [A, B], examType: "KPSS", retryMap: true });
    expect(done.status).toBe(200);
    // Only the new file was mapped (one call); A kept its map untouched.
    expect(model.calls).toHaveLength(1);
    expect(model.calls[0]!.prompt).not.toContain("kpss.pdf");
    expect(docA(fake)).toMatchObject({ status: "completed", topic_map_status: "ready" });
    expect(nodesA(fake)).toEqual(["on1", "on2"]);
    expect(fake.db.tables.documents!.find((d: any) => d.id === B)).toMatchObject({ status: "completed", topic_map_status: "ready" });
    expect(outlineRes(fake).map((r: any) => r.status)).toEqual(["committed"]);
  });

  it("an in-use map left 'failed' by the old code heals to ready on Tekrar dene, with no call", async () => {
    const fake = db({ used: true, tms: "failed", error: "topic_map_in_use" });
    const retried = await until({ documentId: A, retryMap: true });
    expect(retried.status).toBe(200);
    expect(model.calls).toHaveLength(0);
    expect(docA(fake)).toMatchObject({ status: "completed", topic_map_status: "ready", topic_map_error: null });
    expect(nodesA(fake)).toEqual(["on1", "on2"]);
  });

  it("a plan linked mid-rebuild: persist refuses, every outline reservation is refunded, the old map stays", async () => {
    const fake = db({ used: false });
    model.impl = () => {
      // The student builds a plan from this map while the rebuild's call runs.
      fake.db.tables.exam_preps!.push({ id: "p2", user_id: "u1", document_id: A, source_document_ids: [A] });
      return good();
    };
    const r = await rebuild();
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ code: "topic_map_in_use" });
    expect(model.calls).toHaveLength(1);
    expect(outlineRes(fake).map((x: any) => x.status)).toEqual(["refunded"]);
    expect(fake.chargedCredits("u1")).toBe(5); // only the original document credit
    expect(docA(fake)).toMatchObject({ status: "completed", topic_map_status: "ready", topic_map_error: null });
    expect(nodesA(fake)).toEqual(["on1", "on2"]);
    expect(fake.db.tables.document_topic_map_jobs!.filter((j: any) => (j.topics as unknown[] | null)?.length)).toHaveLength(0);
  });
});

describe("V4: rebuild of an unused map whose drafts are all rejected", () => {
  it("keeps the old map as ready (no error left on it), charges nothing, polls make no call", async () => {
    const fake = db({ used: false });
    model.impl = () => JUNK;
    const r = await rebuild();
    expect(r.status).toBe(202);
    const cont = await until({ documentId: A });
    expect(cont.status).not.toBe(202);
    const spent = model.calls.length;
    expect(spent).toBeLessThanOrEqual(3);
    expect(docA(fake)).toMatchObject({ status: "completed", topic_map_status: "ready", topic_map_error: null });
    expect(nodesA(fake)).toEqual(["on1", "on2"]);
    expect(outlineRes(fake).every((x: any) => x.status === "refunded")).toBe(true);
    for (let i = 0; i < 5; i += 1) await post({ documentId: A });
    expect(model.calls).toHaveLength(spent);
  });
});
