import { describe, expect, it } from "vitest";
import { rememberMockTiming, takeMockTiming } from "@/lib/learning/mock-exam/client-timing";

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

describe("deneme istemci zamanlaması", () => {
  it("aynı sınavda bir kez okunur", () => {
    const s = mem();
    rememberMockTiming({ examId: "e1", clickAt: 1000, postMs: 900 }, s);
    expect(takeMockTiming("e2", 2000, s)).toBeNull();
    expect(takeMockTiming("e1", 2500, s)).toEqual({ clickToScreenMs: 1500, requestMs: 900 });
    expect(takeMockTiming("e1", 2600, s)).toBeNull();
  });
  it("bayat kayıt gönderilmez", () => {
    const s = mem();
    rememberMockTiming({ examId: "e1", clickAt: 0, postMs: 1 }, s);
    expect(takeMockTiming("e1", 500_000, s)).toBeNull();
  });
});
