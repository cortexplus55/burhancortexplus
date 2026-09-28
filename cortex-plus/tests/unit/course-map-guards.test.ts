/**
 * Round-4 regressions for the ONE course-level map pipeline, driven through
 * the process route with the real credits service:
 * - M3: a status poller never maps a wizard-deferred file on its own, not
 *   before the course call and not between its rounds; one outline charge.
 * - M2: a map that runs out of attempts is final ("Tekrar dene"): polls make
 *   no model call; an explicit retry starts one fresh attempt.
 * - The rebuild button's rounds really continue until the map is rebuilt.
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

const COST = 3;
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

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
const courseOutline = titledOutline([[heading(0, 2), 2, 2, 0], [heading(0, 5), 5, 5, 0], [heading(1, 3), 3, 3, 1]]);

function db(docs: { id: string; name: string; pages: string[]; mime?: string }[]) {
  const fake = makeFakeDb(routeTables(docs), { creditCost: COST });
  route.service = fake.client;
  return fake;
}
const outlineCharges = (fake: ReturnType<typeof makeFakeDb>) =>
  fake.reservations().filter((r: any) => r.action_code === "STUDY_PLAN_GENERATE" && r.status === "committed").length;

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

beforeEach(() => {
  model.calls.length = 0;
  model.impl = () => null;
});

describe("M3: wizard-deferred files wait for the ONE course outline", () => {
  it("poller posts make no call before or during the course; one course call; one outline charge", async () => {
    const fake = db([{ id: A, name: "kimya12.pdf", pages: pages(0, 12) }, { id: B, name: "kimya16.pdf", pages: pages(1, 16) }]);
    // Mini's draft is rejected, so the course needs a second round (escalate).
    model.impl = (p) => (p.modelOverride === "gpt-4o-mini" ? JUNK : courseOutline);

    expect((await post({ documentId: A, deferMap: true })).body).toMatchObject({ mapDeferred: true });
    expect((await post({ documentId: B, deferMap: true })).body).toMatchObject({ mapDeferred: true });
    // /dokumanlar DocumentStatusPoller: plain { documentId } for every processing doc.
    for (const id of [A, B, A, B]) {
      const tick = await post({ documentId: id });
      expect(tick).toMatchObject({ status: 200, body: { mapDeferred: true } });
    }
    expect(model.calls).toHaveLength(0);

    const round1 = await post({ documentId: A, courseDocumentIds: [A, B], examType: "KPSS" });
    expect(round1.status).toBe(202);
    expect(model.calls).toHaveLength(1);
    // Between course rounds the poller neither hijacks A's course job nor maps B alone.
    for (const id of [A, B]) {
      const tick = await post({ documentId: id });
      expect(tick.status).toBe(202);
      expect(tick.body).toMatchObject({ leaseBusy: true });
    }
    expect(model.calls).toHaveLength(1);

    const done = await until({ documentId: A, courseDocumentIds: [A, B], examType: "KPSS" });
    expect(done.status).toBe(200);
    expect(model.calls.map((c) => c.model)).toEqual(["gpt-4o-mini", "gpt-4.1"]);
    expect(model.calls[1]!.prompt).toContain("kimya16.pdf");
    expect(outlineCharges(fake)).toBe(1);
    expect(fake.chargedCredits("u1")).toBe(5 + 5 + COST);
    expect(fake.db.tables.documents!.map((d: any) => `${d.status}/${d.topic_map_status}`)).toEqual([
      "completed/ready",
      "completed/ready",
    ]);
    // Wait markers are gone; later polls are no-ops.
    expect(fake.db.tables.document_topic_map_jobs).toHaveLength(0);
    expect((await post({ documentId: B })).status).toBe(200);
    expect(model.calls).toHaveLength(2);
  });

  it("a wizard abandoned for more than 30 minutes still gets a map from the poller, charged once", async () => {
    const fake = db([{ id: A, name: "kimya12.pdf", pages: pages(0, 12) }]);
    model.impl = () => titledOutline([[heading(0, 2), 2, 2], [heading(0, 7), 7, 7]]);
    await post({ documentId: A, deferMap: true });
    const marker = (fake.db.tables.document_topic_map_jobs![0]!.topics as any[])[0];
    marker.at = new Date(Date.now() - 31 * 60_000).toISOString();
    const done = await until({ documentId: A });
    expect(done.status).toBe(200);
    expect(model.calls).toHaveLength(1);
    expect(outlineCharges(fake)).toBe(1);
    expect(fake.db.tables.documents![0]).toMatchObject({ status: "completed", topic_map_status: "ready" });
  });
});

describe("M2: running out of attempts is final until the student retries", () => {
  it("poller ticks after exhaustion make 0 calls; an explicit retry makes one fresh attempt; re-upload works", async () => {
    const fake = db([{ id: A, name: "notlar.pdf", pages: pages(0, 12) }, { id: C, name: "notlar.pdf", pages: pages(0, 12) }]);
    model.impl = () => JUNK;
    const exhausted = await until({ documentId: A });
    expect(exhausted.status).toBe(422);
    expect(exhausted.body).toMatchObject({ code: "topic_map_unavailable", retryable: false, canRetry: true });
    expect(model.calls).toHaveLength(3); // first → escalate → repair, then final
    expect(fake.db.tables.documents![0]).toMatchObject({
      status: "processing",
      topic_map_status: "failed",
      topic_map_error: "topic_map_unavailable",
    });

    for (let tick = 0; tick < 20; tick += 1) {
      const r = await post({ documentId: A });
      expect(r.status).toBe(422);
    }
    expect(model.calls).toHaveLength(3);
    expect(fake.chargedCredits("u1")).toBe(0);

    model.impl = () => titledOutline([[heading(0, 2), 2, 2], [heading(0, 7), 7, 7]]);
    const retried = await until({ documentId: A, retryMap: true });
    expect(retried.status).toBe(200);
    expect(model.calls).toHaveLength(4);
    expect(fake.db.tables.documents![0]).toMatchObject({ status: "completed", topic_map_status: "ready" });

    const reupload = await until({ documentId: C });
    expect(reupload.status).toBe(200);
    expect(model.calls).toHaveLength(5);
    expect(outlineCharges(fake)).toBe(2);
  });
});

describe("rebuild button", () => {
  it("keeps the rounds going until the rebuilt map is saved (no premature 'yenilendi')", async () => {
    const fake = db([{ id: A, name: "notlar.pdf", pages: pages(0, 12) }]);
    model.impl = () => titledOutline([[heading(0, 2), 2, 2]]);
    expect((await until({ documentId: A })).status).toBe(200);
    const firstNodes = fake.db.tables.document_topic_nodes!.map((n: any) => n.title);

    model.impl = (p) => (p.modelOverride === "gpt-4o-mini" ? JUNK : titledOutline([[heading(0, 4), 4, 4], [heading(0, 9), 9, 9]]));
    const { POST } = await import("@/app/api/documents/[documentId]/topic-map/route");
    const rebuild = await POST(
      new Request(`http://test.local/api/documents/${A}/topic-map`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "rebuild" }),
      }),
      { params: Promise.resolve({ documentId: A }) },
    );
    expect(rebuild.status).toBe(202);
    // The editor continues through the process route until it is done.
    expect((await until({ documentId: A })).status).toBe(200);
    const leaves = fake.db.tables.document_topic_nodes!.filter((n: any) => n.parent_id).map((n: any) => n.title);
    expect(leaves).toEqual([heading(0, 4), heading(0, 9)]);
    expect(leaves).not.toEqual(firstNodes);
    expect(outlineCharges(fake)).toBe(2);
  });
});
