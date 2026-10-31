// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }) }));

import { PendingMaterialsBanner } from "@/components/parity/pending-materials-banner";

/*
  Hızlı başlatmanın şeridi (31 Ekim 2026): hazırlık sayfasında bekleyen belge okunur, hazırlığın konu adlarıyla
  haritalanır ve add-source ile eklenir. Bekleyen yoksa hiçbir şey çizilmez.
*/

const PREP = "22222222-2222-4222-8222-222222222222";
const DOC = "33333333-3333-4333-8333-333333333333";

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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

  it("eklendi bildirimi sayfa yenilenip bekleyen 0 olsa da görünür kalır, sonra kalkar", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let listed = 0;
    mockFetch((call) => {
      if (call.url.startsWith("/api/learning/exam-prep/pending-materials")) {
        listed += 1;
        return { status: 200, body: { materials: listed === 1 ? [{ documentId: DOC, fileName: "a.pdf", status: "completed", error: null, pagesDone: 20, pageCount: 20 }] : [] } };
      }
      if (call.url === "/api/documents/process") {
        return call.body?.courseDocumentIds
          ? { status: 200, body: { documentId: DOC, status: "completed", topics: 3 } }
          : { status: 200, body: { documentId: DOC, status: "completed", mapDeferred: true, pageCount: 20 } };
      }
      if (call.url === "/api/learning/exam-prep/add-source") return { status: 200, body: { ok: true, addedDocuments: 1, addedTopics: 27, mergedTopics: 0 } };
      return { status: 404, body: {} };
    });
    const view = render(<PendingMaterialsBanner prepId={PREP} initialPending={1} />);
    expect(await screen.findByText("✓ Kalan tüm sayfalar ve 27 yeni konu çalışma yoluna eklendi!")).toBeTruthy();
    // Sayfa yenilendi: sunucu artık bekleyen 0 diyor; şerit aynı yerde kalır ve bildirim durur.
    view.rerender(<PendingMaterialsBanner prepId={PREP} initialPending={0} />);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(screen.getByText("✓ Kalan tüm sayfalar ve 27 yeni konu çalışma yoluna eklendi!")).toBeTruthy();
    await vi.advanceTimersByTimeAsync(2_500);
    expect(screen.queryByText(/çalışma yoluna eklendi/)).toBeNull();
    vi.useRealTimers();
  });

  it("bekleyen yoksa çizilmez", async () => {
    const calls = mockFetch(() => ({ status: 200, body: { materials: [] } }));
    const { container } = render(<PendingMaterialsBanner prepId={PREP} />);
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(container.textContent).toBe("");
  });

  it("okutur, hazırlığın adlarıyla haritalar, ekler ve sayfayı yeniler", async () => {
    let listed = 0;
    const calls = mockFetch((call) => {
      if (call.url.startsWith("/api/learning/exam-prep/pending-materials")) {
        listed += 1;
        return {
          status: 200,
          body: {
            materials: listed === 1
              ? [{ documentId: DOC, fileName: "Ders Notu Fotoğrafları (Sayfa 11–30).pdf", status: "processing", error: null, pagesDone: 4, pageCount: 20 }]
              : [],
          },
        };
      }
      if (call.url === "/api/documents/process") {
        return call.body?.courseDocumentIds
          ? { status: 200, body: { documentId: DOC, status: "completed", topics: 3 } }
          : { status: 200, body: { documentId: DOC, status: "completed", mapDeferred: true, pageCount: 20 } };
      }
      if (call.url === "/api/learning/exam-prep/add-source") {
        return { status: 200, body: { ok: true, addedDocuments: 1, addedTopics: 3, mergedTopics: 1, warnings: [] } };
      }
      return { status: 404, body: {} };
    });
    render(<PendingMaterialsBanner prepId={PREP} />);
    expect(await screen.findByText("✓ Kalan tüm sayfalar ve 3 yeni konu çalışma yoluna eklendi!")).toBeTruthy();
    expect(screen.getByText("1 konuya yeni kaynak eklendi. İlerlemen duruyor.")).toBeTruthy();
    const process = calls.filter((call) => call.url === "/api/documents/process");
    expect(process[0]!.body).toMatchObject({ documentId: DOC, prepId: PREP, deferMap: true });
    expect(process.at(-1)!.body).toMatchObject({ courseDocumentIds: [DOC], prepId: PREP, retryMap: true });
    const attach = calls.find((call) => call.url === "/api/learning/exam-prep/add-source");
    expect(attach!.body).toEqual({ prepId: PREP, documentIds: [DOC] });
    expect(refresh).toHaveBeenCalled();
  });

  it("okuma sürerken başlık ve sayfa sayacı görünür", async () => {
    mockFetch((call) => {
      if (call.url.startsWith("/api/learning/exam-prep/pending-materials")) {
        return {
          status: 200,
          body: { materials: [{ documentId: DOC, fileName: "set.pdf", status: "processing", error: null, pagesDone: 2, pageCount: 20 }] },
        };
      }
      if (call.url === "/api/documents/process") {
        return { status: 202, body: { documentId: DOC, status: "processing", phase: "extract", pageCount: 20, nextPage: 9 } };
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
      if (call.url.startsWith("/api/learning/exam-prep/pending-materials")) {
        if (call.method === "DELETE") {
          deleted = true;
          return { status: 200, body: { ok: true } };
        }
        return {
          status: 200,
          body: {
            materials: deleted ? [] : [{ documentId: DOC, fileName: "bozuk.pdf", status: "processing", error: null, pagesDone: null, pageCount: null }],
          },
        };
      }
      if (call.url === "/api/documents/process") {
        return { status: 422, body: { error: "Belge okunamadı.", code: "empty_content", retryable: false } };
      }
      return { status: 404, body: {} };
    });
    render(<PendingMaterialsBanner prepId={PREP} />);
    expect(await screen.findByText(/bozuk\.pdf okunamadı/)).toBeTruthy();
    screen.getByText("Okunamayanları kaldır").click();
    await waitFor(() => expect(deleted).toBe(true));
  });
});
