import { describe, expect, it, vi } from "vitest";
import { failoverAfterMs, guardedFetch, DEFAULT_FAILOVER_AFTER_MS } from "@/lib/ai/openai-client";
import { parseModelOutput } from "@/lib/ai/json-repair";
import { deterministicCreditKey, likePrefix, slotKey } from "@/lib/credits/slot-key";
import { pendingWindowNextLine, pendingWindowTitle } from "@/lib/learning/pending-materials-copy";
import { mergeNoteWarnings, noteNeedsRuleCheck, readNoteRuleWarnings } from "@/lib/learning/note-rule-check";

const URL_CHAT = "https://api.openai.com/v1/chat/completions";
const body = (model: string) => JSON.stringify({ model, messages: [], reasoning_effort: "low" });

describe("#8 yedek model: zaman aşımı", () => {
  it("süre ayarı: varsayılan, kapalı, sayı", () => {
    expect(failoverAfterMs({})).toBe(DEFAULT_FAILOVER_AFTER_MS);
    expect(failoverAfterMs({ OPENAI_FAILOVER_AFTER_MS: "off" })).toBeNull();
    expect(failoverAfterMs({ OPENAI_FAILOVER_AFTER_MS: "0" })).toBeNull();
    expect(failoverAfterMs({ OPENAI_FAILOVER_AFTER_MS: "5000" })).toBe(5000);
  });

  it("asıl model başlık göndermeden takılırsa aynı istek yedek modelle yinelenir", async () => {
    const seen: string[] = [];
    const inner = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const model = JSON.parse(String(init?.body)).model as string;
      seen.push(model);
      if (model === "gpt-4.1") return new Response("{}", { status: 200 });
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetcher = guardedFetch(inner as never, 30);
    const response = await fetcher(URL_CHAT, { method: "POST", body: body("luna-x") });
    expect(response.status).toBe(200);
    expect(seen).toEqual(["luna-x", "gpt-4.1"]);
    expect(warn).toHaveBeenCalledWith("openai_failover", expect.objectContaining({ reason: "timeout" }));
    warn.mockRestore();
  });

  it("çağıranın kendi iptali yedeğe geçirmez", async () => {
    const controller = new AbortController();
    const inner = vi.fn(async (_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }),
    );
    const fetcher = guardedFetch(inner as never, 10_000);
    const pending = fetcher(URL_CHAT, { method: "POST", body: body("luna-x"), signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it("zamanında gelen yanıt olduğu gibi döner", async () => {
    const inner = vi.fn(async () => new Response("ok", { status: 200 }));
    const response = await guardedFetch(inner as never, 1_000)(URL_CHAT, { method: "POST", body: body("luna-x") });
    expect(await response.text()).toBe("ok");
    expect(inner).toHaveBeenCalledTimes(1);
  });
});

describe("#8 yarım JSON onarımı", () => {
  it("sağlam JSON aynen", () => {
    expect(parseModelOutput('{"a":1}')).toEqual({ a: 1 });
  });
  it("yarım kalan sonu onarır", () => {
    expect(parseModelOutput('{"items":[{"x":1},{"x":2},{"x":')).toEqual({ items: [{ x: 1 }, { x: 2 }] });
  });
  it("onarılamıyorsa ilk hatayı fırlatır", () => {
    expect(() => parseModelOutput("bu json değil")).toThrow(SyntaxError);
  });
});

describe("#9 belirlenimli kredi anahtarı", () => {
  function fakeService(count: number | null, error: unknown = null) {
    const calls: Record<string, unknown> = {};
    const chain = {
      select: () => chain,
      eq: (key: string, value: unknown) => ((calls[key] = value), chain),
      like: (key: string, value: unknown) => {
        calls[key] = value;
        return Promise.resolve({ count, error });
      },
    };
    return { service: { from: () => chain } as never, calls };
  }

  it("sonuçlanmış ayırma sayısı yuvayı belirler; aynı anda iki istek aynı anahtar", async () => {
    const a = fakeService(2);
    const b = fakeService(2);
    const first = await deterministicCreditKey(a.service, "u1", "podcast:u1:p:t:short:check");
    const second = await deterministicCreditKey(b.service, "u1", "podcast:u1:p:t:short:check");
    expect(first).toBe("podcast:u1:p:t:short:check:slot2");
    expect(second).toBe(first);
    expect(a.calls.status).toBe("committed");
    expect(a.calls.idempotency_key).toBe("podcast:u1:p:t:short:check:slot%");
  });

  it("sayım okunamazsa eski davranış (rastgele son ek)", async () => {
    const { service } = fakeService(null, { message: "x" });
    expect(await deterministicCreditKey(service, "u1", "video:a", () => "r1")).toBe("video:a:r1");
  });

  it("LIKE jokerleri kaçırılır", () => {
    expect(likePrefix("a_b%c")).toBe("a\\_b\\%c:slot%");
    expect(slotKey("k", 0)).toBe("k:slot0");
  });
});

describe("#7 şerit başlığı", () => {
  it("maddedeki tek cümle", () => {
    expect(pendingWindowTitle(110, 500)).toBe("⚡ Kitabın işleniyor: 110 / 500 sayfa yoluna eklendi…");
    expect(pendingWindowTitle(600, 500)).toContain("500 / 500");
    expect(pendingWindowNextLine(500)).toMatch(/Sıradaki bölüm/);
  });
});

describe("#13 genel not denetimi", () => {
  const note = "Bölüm 2\nTemel bağıntı: y = k / x²\nÖrnek: k = 4";
  it("notta birebir geçen, yüksek kesinlikli eşitlik kabul edilir", () => {
    const out = readNoteRuleWarnings(
      { items: [{ found: "y = k / x²", standard: "y = k · x²", confidence: "yuksek" }] },
      note,
    );
    expect(out).toEqual([{ id: "model", found: "y = k / x²", standard: "y = k · x²" }]);
  });
  it("notta olmayan, düşük kesinlikli, eşitlik olmayan ya da aynı öğe atılır", () => {
    const out = readNoteRuleWarnings(
      {
        items: [
          { found: "z = 3", standard: "z = 4", confidence: "yuksek" },
          { found: "y = k / x²", standard: "y = k · x²", confidence: "orta" },
          { found: "Temel bağıntı", standard: "Başka", confidence: "yuksek" },
          { found: "k = 4", standard: "k  =  4", confidence: "yuksek" },
        ],
      },
      note,
    );
    expect(out).toEqual([]);
  });
  it("katalogla birleşim: tekrar yok, tavan 3", () => {
    const catalog = [{ id: "c", found: "a = b", standard: "a = c" }];
    const model = [
      { id: "model", found: "a  =  b", standard: "a = c" },
      { id: "model", found: "p = q", standard: "p = r" },
      { id: "model", found: "s = t", standard: "s = u" },
      { id: "model", found: "v = w", standard: "v = x" },
    ];
    expect(mergeNoteWarnings(catalog, model).map((w) => w.found)).toEqual(["a = b", "p = q", "s = t"]);
  });
  it("eşitlik yoksa model çağrılmaz", () => {
    expect(noteNeedsRuleCheck("yalnız düz metin")).toBe(false);
    expect(noteNeedsRuleCheck("a = b")).toBe(true);
  });
});
