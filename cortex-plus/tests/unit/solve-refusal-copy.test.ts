import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/billing/entitlements", () => ({ isPremiumUser: vi.fn(async () => false) }));
const reserveCredits = vi.fn();
vi.mock("@/lib/credits/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/credits/service")>()),
  reserveCredits: (...args: unknown[]) => reserveCredits(...args),
}));

const { runSolve } = await import("@/lib/solve/solve-run");

/**
 * Soru çözücünün ücretsiz sınır metni öğrenciye olduğu gibi gider (kapı ve sohbet balonu). İnceleme,
 * 24 Ekim 2026: "Plus'ta sınır yok" yazıyordu; Plus'ın da aylık hakkı var.
 */
async function refusalFor(meter: "photo" | "chat") {
  reserveCredits.mockResolvedValueOnce({ ok: false, reason: "insufficient_credits", refusal: { kind: "free_limit", meter } });
  const events: { type: string; code?: string; message?: string; status?: number }[] = [];
  await runSolve(
    {
      service: {} as never,
      userId: "user-1",
      idempotencyKey: "solve-1",
      ...(meter === "photo" ? { imageDataUrl: "data:image/png;base64,AAAA" } : { text: "2x + 3 = 7 ise x kaçtır?" }),
    },
    (event) => events.push(event as never),
  );
  return events;
}

describe("soru çözücünün ücretsiz sınır metni", () => {
  it("fotoğraf ve mesaj sınırı Plus'ı sınırsız göstermez", async () => {
    for (const meter of ["photo", "chat"] as const) {
      const [event, ...rest] = await refusalFor(meter);
      expect(rest).toEqual([]);
      expect(event).toMatchObject({ type: "error", code: `free_${meter}_limit`, status: 402 });
      expect(event.message, meter).toContain("Gece yarısı yenilenir; dilersen Plus'a geçip beklemeden devam edebilirsin.");
      expect(event.message!.toLocaleLowerCase("tr"), meter).not.toMatch(/sınır yok|sınırsız|kredi/);
    }
  });
});
