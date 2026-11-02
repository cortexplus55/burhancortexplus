import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unitCheckOffer } from "@/lib/level-check/unit-offer";

/** UX tur 2, bulgu 10: Ünite Seviye Kontrolü yalnız ünitede ≥3 doğrulanmış soru varsa ve bu hazırlıkta yapılmadıysa önerilir. */
function fakeService(opts: { verified: number; done?: boolean }) {
  const calls: Record<string, unknown>[] = [];
  const service = {
    from(table: string) {
      const filters: Record<string, unknown> = { table };
      calls.push(filters);
      const q = {
        select(_cols: string, o?: { head?: boolean }) {
          filters.head = Boolean(o?.head);
          return q;
        },
        eq(col: string, val: unknown) {
          filters[col] = val;
          return q;
        },
        limit() {
          if (table === "item_responses" && filters.source === "unit_check") {
            return Promise.resolve({ data: opts.done ? [{ id: "r" }] : [], error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
        then(resolve: (v: unknown) => void) {
          resolve({ count: opts.verified, error: null });
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { service, calls };
}

const prefs = { officialPlan: { units: [{ topic: "9. Sınıf · Tarih ve Zaman", unitId: "yks-2026-tarih#0" }] } };
const input = { userId: "u1", prepId: "p1", prefs, topicLabel: "9. Sınıf ·  Tarih ve Zaman" };

describe("unitCheckOffer", () => {
  it("≥3 doğrulanmış soruda önerir; havuz kimliği 1 tabanlı, yalnız verified sayılır", async () => {
    const { service, calls } = fakeService({ verified: 3 });
    const offer = await unitCheckOffer(service, input);
    expect(offer?.unitId).toBe("yks-2026-tarih#1");
    expect(calls.find((c) => c.table === "item_bank")).toMatchObject({ unit_id: "yks-2026-tarih#1", status: "verified", head: true });
  });
  it("2 doğrulanmış soruda önermez", async () => {
    expect(await unitCheckOffer(fakeService({ verified: 2 }).service, input)).toBeNull();
  });
  it("bu hazırlıkta yapıldıysa önermez", async () => {
    expect(await unitCheckOffer(fakeService({ verified: 9, done: true }).service, input)).toBeNull();
  });
  it("resmî kurulum ünitesi değilse önermez", async () => {
    expect(await unitCheckOffer(fakeService({ verified: 9 }).service, { ...input, topicLabel: "Serbest konu" })).toBeNull();
  });
});
