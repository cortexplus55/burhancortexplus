/**
 * Çizimli video (sketch_reel) ikinci izleme ücretsiz (19 Kasım 2026, Faz 4 denetimi). Bedel 22 kredi; aynı konunun
 * çizimli videosu varken giriş yeniden açılınca kredi ayrılmaz, model çağrılmaz, var olan video döner.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const runVideoLesson = vi.fn(async (..._args: unknown[]) => ({ ok: true as const, videoId: "yeni-video" }));
const stored: { id: string; style: string; scenes: unknown[] }[] = [];

function fakeService() {
  const make = (table: string) => {
    const builder: Record<string, unknown> = {};
    for (const name of ["select", "eq", "in", "order", "limit", "gte", "neq"]) builder[name] = () => builder;
    builder.maybeSingle = async () =>
      table === "exam_preps" ? { data: { id: "p1", title: "Fizik", document_id: null }, error: null } : { data: null, error: null };
    builder.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(table === "prep_videos" ? { data: stored, error: null } : { data: [], error: null }).then(resolve);
    return builder;
  };
  return { from: make } as never;
}

vi.mock("@/lib/api/guards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/guards")>()),
  withUser: vi.fn(async () => ({ ok: true, ctx: { userId: "u1", service: fakeService() } })),
}));
vi.mock("@/lib/billing/entitlements", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing/entitlements")>()),
  getUserEntitlements: vi.fn(async () => ({})),
  requireFeature: vi.fn(() => true),
}));
vi.mock("@/lib/learning/prep-topic-lookup", () => ({
  resolvePrepTopicRow: vi.fn(async () => ({ id: "t1", label: "Kuvvet" })),
}));
vi.mock("@/lib/learning/video-run", () => ({ runVideoLesson }));
vi.mock("@/lib/content-pool/shared-media", () => ({
  readSharedMedia: vi.fn(async () => null),
  SHARED_BUDGET_MESSAGE: "",
  SHARED_MEDIA_CODE: "SHARED",
  sharedBudgetAllows: vi.fn(async () => true),
  sharedMediaUnit: vi.fn(async () => null),
  writeSharedMedia: vi.fn(async () => undefined),
}));
vi.mock("@/lib/learning/prep-topic-source", () => ({ prepTopicSource: vi.fn(async () => ({ mode: "topic", pages: [] })) }));
vi.mock("@/lib/credits/slot-key", () => ({ deterministicCreditKey: vi.fn(async () => "anahtar") }));

const post = async (body: Record<string, unknown>) => {
  const { POST } = await import("@/app/api/learning/exam-prep/video/route");
  const response = await POST(
    new Request("http://localhost/api/learning/exam-prep/video", { method: "POST", body: JSON.stringify(body) }),
  );
  return (await response.json()) as { ok?: boolean; videoId?: string; reused?: boolean };
};

describe("çizimli video: ikinci izleme 0 kredi", () => {
  beforeEach(() => {
    runVideoLesson.mockClear();
    stored.length = 0;
  });

  it("bedel 22 kredi (kod ve Faz 4 göçü)", async () => {
    const { CREDIT_PRICE_TABLE } = await import("@/lib/credits/price-table");
    expect(CREDIT_PRICE_TABLE.SKETCH_VIDEO_GENERATE.credits).toBe(22);
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("supabase/migrations/20261119120000_faz4_credit_economy.sql", "utf8")).toContain(
      "('SKETCH_VIDEO_GENERATE', 22,",
    );
  });

  it("aynı konunun çizimli videosu varsa üretim yok (kredi ayırma ve model çağrısı runVideoLesson içinde)", async () => {
    stored.push({ id: "eski-cizimli", style: "sketch_reel", scenes: [{ imagePath: "", diagram: {} }] });
    const body = await post({ prepId: "11111111-1111-4111-8111-111111111111", topicId: "22222222-2222-4222-8222-222222222222", mode: "sketch_reel" });
    expect(body).toEqual({ ok: true, videoId: "eski-cizimli", reused: true });
    expect(runVideoLesson).not.toHaveBeenCalled();
  });

  it("eski kayıt (tarz 'whiteboard', resimsiz şemalı sahne) da çizimli sayılır", async () => {
    stored.push({ id: "eski-tahta", style: "whiteboard", scenes: [{ imagePath: "", reel: {} }] });
    const body = await post({ prepId: "11111111-1111-4111-8111-111111111111", topicId: "22222222-2222-4222-8222-222222222222", mode: "sketch_reel" });
    expect(body.videoId).toBe("eski-tahta");
    expect(runVideoLesson).not.toHaveBeenCalled();
  });

  it("ilk izlemede üretilir (22 kredi runVideoLesson'da ayrılır)", async () => {
    const body = await post({ prepId: "11111111-1111-4111-8111-111111111111", topicId: "22222222-2222-4222-8222-222222222222", mode: "sketch_reel" });
    expect(body.videoId).toBe("yeni-video");
    expect(runVideoLesson).toHaveBeenCalledTimes(1);
    expect(runVideoLesson.mock.calls[0]![1]).toMatchObject({ renderMode: "sketch_reel" });
  });
});
