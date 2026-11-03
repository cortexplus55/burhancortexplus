import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { OPENAI_API_KEY: "k", OPENAI_STANDARD_MODEL: "gpt-4o-mini" } }));
const create = vi.fn((_body: unknown, opts: { signal: AbortSignal }) => new Promise((_, reject) => opts.signal.addEventListener("abort", () => reject(new Error("aborted")))));
vi.mock("@/lib/ai/openai-client", () => ({ openaiClient: () => ({ chat: { completions: { create } } }) }));

import { openRewriteLeadStream } from "@/lib/learning/node/rewrite-lead-stream";

describe("Farklı anlat girişi kredi ayırmayla paralel açılır", () => {
  it("akış hemen açılır, başlangıç anı ölçülür, ayırma düşerse kesilir (işlenmemiş ret yok)", async () => {
    const lead = openRewriteLeadStream({ topicLabel: "Tarih", basis: "KAZANIMLAR:\n- T.1", requestStarted: Date.now() - 500 });
    expect(create).toHaveBeenCalledTimes(1);
    const body = create.mock.calls[0][0] as { stream: boolean; model: string; messages: Array<{ content: string }> };
    expect(body.stream).toBe(true);
    expect(body.messages[1].content).toContain("KONU: Tarih");
    expect(lead.startedMs).toBeGreaterThanOrEqual(500);
    lead.abort();
    await expect(lead.stream).rejects.toThrow("aborted");
  });
});
