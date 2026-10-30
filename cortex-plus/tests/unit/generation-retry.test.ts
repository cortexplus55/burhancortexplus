import { readFileSync } from "node:fs";
import { readSource } from "./helpers/node-sources";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isRetryableFailure, postJsonWithRetry } from "@/lib/learning/generation-retry";

/*
  19 Ekim 2026, ürün sahibi: "kullanıcı istediyse üretilsin; 'üretilemedi / oluşturulamadı' gibi
  uyarılar olmasın". İçerik isteği düşünce her ekran bir kez kendiliğinden yeniden ister; hak,
  paket, hız sınırı ve "işlem sürüyor" cevapları yeniden denenmez.
*/
afterEach(() => vi.unstubAllGlobals());

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("yeniden denenecek düşüşler", () => {
  it("5xx üretim kodları evet; hak, paket, sürüyor, hız sınırı hayır", () => {
    expect(isRetryableFailure(503, "generation_failed")).toBe(true);
    expect(isRetryableFailure(502, undefined)).toBe(true);
    expect(isRetryableFailure(503, "content_verification_failed")).toBe(true);
    expect(isRetryableFailure(402, "insufficient_credits")).toBe(false);
    expect(isRetryableFailure(409, "generation_failed_retry")).toBe(false);
    expect(isRetryableFailure(429, "rate_limited")).toBe(false);
    expect(isRetryableFailure(503, "source_unavailable")).toBe(false);
  });
});

describe("postJsonWithRetry", () => {
  it("ilk istek düşerse yeni gövdeyle bir kez daha; ikincinin cevabı döner", async () => {
    const bodies: string[] = [];
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async (_url: string, init: RequestInit) => {
        bodies.push(String(init.body));
        return json(503, { error: "x", code: "generation_failed" });
      })
      .mockImplementationOnce(async (_url: string, init: RequestInit) => {
        bodies.push(String(init.body));
        return json(200, { chapters: [1] });
      });
    vi.stubGlobal("fetch", fetchMock);
    let n = 0;
    const out = await postJsonWithRetry("/api/x", () => ({ id: ++n }), { delayMs: 1 });
    expect(out.res.status).toBe(200);
    expect(out.retried).toBe(true);
    expect(out.data).toEqual({ chapters: [1] });
    expect(bodies).toEqual(['{"id":1}', '{"id":2}']);
  });

  it("hak bitince yeniden denemez", async () => {
    const fetchMock = vi.fn(async () => json(402, { code: "insufficient_credits" }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await postJsonWithRetry("/api/x", () => ({}), { delayMs: 1 });
    expect(out.retried).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("bütün içerik ekranları aynı kuralı kullanır", () => {
  it("podcast sayfası, araçlar, video, deneme, zor sorular, düğüm ekranı", () => {
    for (const file of [
      "src/components/parity/prep-podcast-session.tsx",
      "src/components/learning/studio/studio-shared.tsx",
      "src/components/parity/video-lesson.tsx",
      // Deneme kurulumu ilerlemeyi akıtan yardımcıdan geçer (25 Ekim 2026); yardımcı aynı kuralı kullanır.
      "src/lib/learning/mock-exam/progress.ts",
      "src/components/parity/challenge-set-play.tsx",
      "src/components/parity/exam-node-session.tsx",
    ]) {
      expect(readSource(file), file).toContain('from "@/lib/learning/generation-retry"');
    }
  });

  it("podcast sayfası boş yazı yerine bekleme ekranı gösterir", () => {
    const page = readSource("src/components/parity/prep-podcast-session.tsx");
    expect(page).toContain('<NodeGenerationProgress');
    expect(page).toContain('title="Podcast hazırlanıyor…"');
  });
});
