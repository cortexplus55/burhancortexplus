// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExamFinishButton } from "@/components/parity/exam-finish-button";
import { nodeForTopic } from "@/lib/learning/exam-prep-ui-path";

/*
  30 Ekim 2026, Astra ile yan yana tur: ders sonundaki kart "Kendini test et · Bu dersi hızlı bir bilgi kontrolüyle
  tamamla · Sınavla bitir" diyordu ama düğme Eylül'den beri bütün hazırlığın yazılı deneme kurulumuna gidiyordu.
  Astra'da aynı kart o dersin testini 1 sn'de açıyor. Düğme artık dersin konusunun ilk bitmemiş testini açar.
*/

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  push.mockReset();
  vi.unstubAllGlobals();
});

describe("ders sonu 'Sınavla bitir' dersin kendi testini açar", () => {
  it("konu verilince uçtan konunun testini sorar ve oraya gider", async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({ href: "/deneme-sinavlari/p1/dugum/q1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ExamFinishButton prepId="p1" topicId="t1" />);
    fireEvent.click(screen.getByRole("button", { name: "Sınavla bitir" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/deneme-sinavlari/p1/dugum/q1"));
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/learning/exam-prep/topic-test?prepId=p1&topicId=t1");
  });

  it("konunun testi yoksa ya da uç düşerse yazılı deneme kurulumu (bugünkü yol)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ href: null }), { status: 200 })));
    render(<ExamFinishButton prepId="p1" topicId="t1" />);
    fireEvent.click(screen.getByRole("button", { name: "Sınavla bitir" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/deneme-sinavlari/p1/deneme/kurulum"));
    cleanup();
    push.mockReset();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("ağ"))));
    render(<ExamFinishButton prepId="p1" topicId="t1" />);
    fireEvent.click(screen.getByRole("button", { name: "Sınavla bitir" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/deneme-sinavlari/p1/deneme/kurulum"));
  });

  it("uç konunun ilk bitmemiş testini seçer (iki konu kimliği de tanınır)", () => {
    const nodes = [
      { id: "q-done", sortOrder: 2, status: "done" as const, sessionMeta: { topicId: "doc-node-1" } },
      { id: "q-open", sortOrder: 4, status: "locked" as const, sessionMeta: { topicId: "doc-node-1" } },
      { id: "q-other", sortOrder: 1, status: "ready" as const, sessionMeta: { topicId: "doc-node-2" } },
    ];
    expect(nodeForTopic(nodes, { ids: ["prep-topic-1", "doc-node-1"] })?.id).toBe("q-open");
    const route = readFileSync("src/app/api/learning/exam-prep/topic-test/route.ts", "utf8");
    expect(route).toContain('.eq("kind", "quiz")');
    expect(route).toContain("ids: [topicId, topic?.id, topic?.document_topic_node_id]");
    const result = readFileSync("src/components/parity/exam-node/result.tsx", "utf8");
    expect(result).toContain("<ExamFinishButton prepId={prepId} topicId={topicId}");
  });
});
