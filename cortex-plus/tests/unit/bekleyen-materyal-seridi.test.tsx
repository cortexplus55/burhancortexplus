// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }) }));

import { PendingMaterialsBanner } from "@/components/parity/pending-materials-banner";

/*
  Hızlı başlatmanın şeridi (31 Ekim 2026). Pencereli işlemeden beri (ikinci tur) okuma, harita ve ekleme sunucudaki
  pencere işçisinde; şerit işçiyi dürter (advance), ilerlemeyi okur, her yeni pencerede yolu yeniler. Bekleyen yoksa
  hiçbir şey çizilmez.
*/

const PREP = "22222222-2222-4222-8222-222222222222";
const DOC = "33333333-3333-4333-8333-333333333333";
const ADVANCE = "/api/learning/exam-prep/pending-materials/advance";

type Call = { url: string; method: string; body: Record<string, unknown> | null };

function mockFetch(handler: (call: Call) => { status: number; body: unknown }) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
    const call = {
      url: String(input),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    };
    calls.push(call);
    const { status, body } = handler(call);
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }));
  return calls;
}

function material(extra: Record<string, unknown>) {
  return { documentId: DOC, fileName: "Kitap.pdf", status: "processing", error: null, pagesDone: 0, pageCount: 500, ...extra };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  refresh.mockReset();
  window.localStorage.clear();
});

describe("bekleyen materyal şeridi", () => {
  it("açılışta bekleyen yoksa (sunucu 0 dedi) istek atmaz ve çizmez", async () => {
    const calls = mockFetch(() => ({ status: 200, body: { materials: [] } }));
    const { container } = render(<PendingMaterialsBanner prepId={PREP} initialPending={0} />);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(calls).toHaveLength(0);
    expect(container.textContent).toBe("");
  });

  it("bekleyen yoksa çizilmez", async () => {
    const calls = mockFetch(() => ({ status: 200, body: { materials: [], topicCount: 4 } }));
    const { container } = render(<PendingMaterialsBanner prepId={PREP} />);
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(container.textContent).toBe("");
  });

  it("işçiyi dürter; pencere eklendikçe yolu yeniler ve hangi sayfaların eklendiğini söyler", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let listed = 0;
    const calls = mockFetch((call) => {
      if (call.url === ADVANCE) return { status: 200, body: { state: "busy", windowsAdded: 0, addedTopics: 0, mergedTopics: 0 } };
      if (call.url.startsWith("/api/learning/exam-prep/pending-materials")) {
        listed += 1;
        return listed === 1
          ? { status: 200, body: { materials: [material({ pagesDone: 100, attachedThrough: 92, windowed: true, paused: false })], topicCount: 20 } }
          : { status: 200, body: { materials: [material({ pagesDone: 140, attachedThrough: 132, windowed: true, paused: false })], topicCount: 26 } };
      }
      return { status: 404, body: {} };
    });
    render(<PendingMaterialsBanner prepId={PREP} initialPending={1} />);
    expect(await screen.findByText(/⚡ Kitabın işleniyor/)).toBeTruthy();
    expect(screen.getByText("⚡ Kitabın işleniyor: 92 / 500 sayfa yoluna eklendi…")).toBeTruthy();
    await waitFor(() => expect(calls.some((call) => call.url === ADVANCE)).toBe(true));
    expect(calls.find((call) => call.url === ADVANCE)!.body).toEqual({ prepId: PREP });
    await vi.advanceTimersByTimeAsync(4_100);
    expect(await screen.findByText("✓ 93–132. sayfalar yoluna eklendi (+6 konu).")).toBeTruthy();
    expect(screen.getByText("⚡ Kitabın işleniyor: 132 / 500 sayfa yoluna eklendi…")).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
  });

  it("son pencere eklenince bildirim yeni konu sayısıyla en az 8 sn görünür, sonra kalkar", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let listed = 0;
    mockFetch((call) => {
      if (call.url === ADVANCE) return { status: 200, body: { state: "busy" } };
      if (call.url.startsWith("/api/learning/exam-prep/pending-materials")) {
        listed += 1;
        return listed === 1
          ? { status: 200, body: { materials: [material({ pagesDone: 460, attachedThrough: 452, windowed: true })], topicCount: 10 } }
          : { status: 200, body: { materials: [], topicCount: 37 } };
      }
      return { status: 404, body: {} };
    });
    render(<PendingMaterialsBanner prepId={PREP} initialPending={1} />);
    expect(await screen.findByText(/⚡ Kitabın işleniyor/)).toBeTruthy();
    await vi.advanceTimersByTimeAsync(4_100);
    expect(await screen.findByText("✓ Kalan tüm sayfalar ve 27 yeni konu çalışma yoluna eklendi!")).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(8_000);
    expect(screen.getByText("✓ Kalan tüm sayfalar ve 27 yeni konu çalışma yoluna eklendi!")).toBeTruthy();
    await vi.advanceTimersByTimeAsync(2_500);
    await waitFor(() => expect(screen.queryByText(/çalışma yoluna eklendi/)).toBeNull());
  });

  it("taranmış kitap öğrenci ilerledikçe okunur; 'Hepsini şimdi oku' beklemeden okutur", async () => {
    const calls = mockFetch((call) => {
      if (call.url === ADVANCE) return { status: 200, body: { state: "paused", windowsAdded: 0, addedTopics: 0, mergedTopics: 0 } };
      if (call.url.startsWith("/api/learning/exam-prep/pending-materials")) {
        return { status: 200, body: { materials: [material({ pagesDone: 92, attachedThrough: 92, windowed: true, paused: true })], topicCount: 14 } };
      }
      return { status: 404, body: {} };
    });
    render(<PendingMaterialsBanner prepId={PREP} initialPending={1} />);
    expect(await screen.findByText("📖 Kitabının ilk bölümleri yolunda")).toBeTruthy();
    expect(screen.getByText(/92 \/ 500 sayfa yolunda\. Kalan 408 taranmış sayfa sen ilerledikçe okunacak/)).toBeTruthy();
    fireEvent.click(screen.getByText("Hepsini şimdi oku"));
    await waitFor(() => expect(calls.some((call) => call.url === ADVANCE && call.body?.eager === true)).toBe(true));
    expect(window.localStorage.getItem(`cp:pending-eager:${PREP}`)).toBe("1");
  });

  it("küçük belgede okuma sayacı görünür (pencereye bölünmeyen)", async () => {
    mockFetch((call) => {
      if (call.url === ADVANCE) return { status: 200, body: { state: "busy" } };
      if (call.url.startsWith("/api/learning/exam-prep/pending-materials")) {
        return { status: 200, body: { materials: [material({ fileName: "set.pdf", pagesDone: 8, pageCount: 20, attachedThrough: 0, windowed: false })] } };
      }
      return { status: 404, body: {} };
    });
    render(<PendingMaterialsBanner prepId={PREP} />);
    expect(await screen.findByText("⚡ İlk konuların hazır!")).toBeTruthy();
    expect(await screen.findByText("Kalan sayfalar arka planda işleniyor (8/20)…")).toBeTruthy();
  });

  it("okunamayan belge söylenir; kaldırılabilir", async () => {
    let deleted = false;
    mockFetch((call) => {
      if (call.url === ADVANCE) {
        return deleted
          ? { status: 200, body: { state: "done" } }
          : { status: 200, body: { state: "failed", failed: { documentId: DOC, fileName: "bozuk.pdf", code: "empty_content", retryable: false } } };
      }
      if (call.url.startsWith("/api/learning/exam-prep/pending-materials")) {
        if (call.method === "DELETE") {
          deleted = true;
          return { status: 200, body: { ok: true } };
        }
        return { status: 200, body: { materials: deleted ? [] : [material({ fileName: "bozuk.pdf", pagesDone: null, pageCount: null })] } };
      }
      return { status: 404, body: {} };
    });
    render(<PendingMaterialsBanner prepId={PREP} />);
    expect(await screen.findByText(/bozuk\.pdf okunamadı/)).toBeTruthy();
    fireEvent.click(screen.getByText("Okunamayanları kaldır"));
    await waitFor(() => expect(deleted).toBe(true));
  });
});
