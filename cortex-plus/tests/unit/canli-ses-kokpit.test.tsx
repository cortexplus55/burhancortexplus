import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import { cockpitWindows } from "@/lib/admin/cockpit-math";
import { subscriptionPlan, voiceCockpit } from "@/lib/admin/voice-cockpit-math";
import { loadVoiceCockpit } from "@/lib/admin/voice-cockpit";
import { VoiceTutorCard } from "@/components/admin/voice-tutor-card";

/*
  Kokpitin "Canlı sesli öğretmen" kartı (21 Kasım 2026): pencereler, dakika ve oturum, gerçek gider, deneme ve denemeden
  sonra Plus'a geçiş; kaynak başına bağımsız okuma.
*/

// 21 Kasım 2026, 15:00 Türkiye (12:00 UTC).
const NOW = new Date("2026-11-21T12:00:00Z");
const windows = cockpitWindows(NOW);
const TODAY = "2026-11-21T08:00:00Z";
const LAST_WEEK = "2026-11-17T08:00:00Z";
const LAST_MONTH = "2026-11-01T08:00:00Z";
const LONG_AGO = "2026-09-01T08:00:00Z";

describe("hesap (saf)", () => {
  it("dakika: ödenen dakika + deneme başına bir dakika; iade edilen sayılmaz", () => {
    const result = voiceCockpit({
      windows,
      reservations: [
        { userId: "a", key: "realtime_voice:s1:m1", status: "committed", at: TODAY },
        { userId: "a", key: "realtime_voice:s1:m2", status: "committed", at: TODAY },
        { userId: "a", key: "realtime_voice:s1:m3", status: "refunded", at: TODAY },
        { userId: "b", key: "realtime_voice:s2:m1", status: "committed", at: LAST_WEEK },
        { userId: "c", key: "realtime_voice:s3:m1", status: "refunded", at: LAST_WEEK },
        { userId: "c", key: "realtime_voice:s4:m1", status: "pending", at: TODAY },
      ],
      trials: [
        { userId: "t1", at: TODAY },
        { userId: "t2", at: LAST_MONTH },
      ],
      usage: [],
      prices: new Map(),
      payments: [],
    });
    expect(result.minutes).toEqual({ today: 3, week: 4, month: 5 });
    expect(result.sessions).toEqual({ today: 2, week: 3, month: 4 });
    expect(result.trialUsers).toEqual({ today: 1, week: 1, month: 2 });
  });

  it("gerçek maliyet fiyat satırından; fiyatsız satır sayılır, kendi tahmini varsa o kullanılır", () => {
    const result = voiceCockpit({
      windows,
      reservations: [],
      trials: [],
      usage: [
        { model: "gpt-realtime-2.1-mini-audio", tokensIn: 1000, tokensOut: 2000, estimate: null, at: TODAY },
        { model: "gpt-realtime-2.1-mini", tokensIn: 10_000, tokensOut: 0, estimate: null, at: LAST_WEEK },
        { model: "bilinmeyen", tokensIn: 5, tokensOut: 5, estimate: 0.5, at: LAST_MONTH },
        { model: "bilinmeyen", tokensIn: 5, tokensOut: 5, estimate: null, at: LAST_MONTH },
      ],
      prices: new Map([
        ["gpt-realtime-2.1-mini-audio", { input: 0.01, output: 0.02 }],
        ["gpt-realtime-2.1-mini", { input: 0.0006, output: 0.0024 }],
      ]),
      payments: [],
    });
    expect(result.costUsd).toEqual({ today: 0.05, week: 0.056, month: 0.556 });
    expect(result.unpriced).toEqual({ today: 0, week: 0, month: 1 });
  });

  it("denemeden sonra Plus'a geçen: denemeden SONRAKİ ilk başarılı paket ödemesi; kişi hakkın sahibi", () => {
    const result = voiceCockpit({
      windows,
      reservations: [],
      trials: [
        { userId: "ogr-1", at: LONG_AGO },
        { userId: "ogr-2", at: LAST_WEEK },
        { userId: "ogr-3", at: TODAY },
        { userId: "ogr-4", at: LAST_WEEK },
      ],
      usage: [],
      prices: new Map(),
      payments: [
        // Uzun önce deneyip bugün Plus alan sayılır.
        { userId: "ogr-1", beneficiaryId: "ogr-1", status: "paid", at: TODAY, planSlug: "plus-aylik" },
        // Veli ödemesi: kişi öğrenci.
        { userId: "veli-1", beneficiaryId: "ogr-2", status: "paid", at: LAST_WEEK.replace("08:", "10:"), planSlug: "plus-haftalik" },
        // Denemeden ÖNCEKİ ödeme sayılmaz.
        { userId: "ogr-3", beneficiaryId: "ogr-3", status: "paid", at: "2026-11-20T08:00:00Z", planSlug: "sigma-aylik" },
        // Ek paket Plus'a geçiş değildir; başarısız ödeme sayılmaz.
        { userId: "ogr-4", beneficiaryId: "ogr-4", status: "paid", at: TODAY, planSlug: "ek-kredi-50" },
        { userId: "ogr-4", beneficiaryId: "ogr-4", status: "failed", at: TODAY, planSlug: "plus-aylik" },
      ],
    });
    expect(result.convertedAfterTrial).toEqual({ today: 1, week: 2, month: 2 });
    expect(subscriptionPlan("sigma-yillik")).toBe(true);
    expect(subscriptionPlan("ek-kredi-150")).toBe(false);
  });

  it("kaynak okunamadıysa ona dayanan sayı null (okunamadı)", () => {
    const result = voiceCockpit({ windows, reservations: null, trials: [], usage: null, prices: null, payments: null });
    expect(result.minutes.today).toBeNull();
    expect(result.costUsd.month).toBeNull();
    expect(result.trialUsers.today).toBe(0);
    expect(result.convertedAfterTrial.week).toBeNull();
  });
});

function service(failing: string[] = []) {
  const rows: Record<string, unknown[]> = {
    credit_reservations: [{ user_id: "a", idempotency_key: "realtime_voice:s:m1", status: "committed", created_at: TODAY }],
    ai_usage_events: [],
    ai_model_prices: [],
    payments: [],
    plans: [],
  };
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const name of ["select", "eq", "gte", "limit", "order"]) chain[name] = () => chain;
      chain.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve(failing.includes(table) ? { data: null, error: { message: "boom" } } : { data: rows[table] ?? [], error: null }).then(resolve);
      return chain;
    },
  } as unknown as SupabaseClient;
}

describe("okuma ve kart", () => {
  it("bir kaynak düşerse sayfa düşmez; kart 'okunamadı' der ve kaynağı Türkçe adıyla söyler", async () => {
    const voice = await loadVoiceCockpit(service(["ai_usage_events"]), NOW);
    expect(voice.failed).toEqual(["sesli ders gider satırları", "deneme kayıtları"]);
    expect(voice.costUsd.today).toBeNull();
    const html = renderToStaticMarkup(<VoiceTutorCard voice={voice} />);
    expect(html).toContain("Canlı sesli öğretmen");
    expect(html).toContain("okunamadı");
    expect(html).toContain("sesli ders gider satırları");
    for (const label of ["Bugün", "Son 7 gün", "Son 30 gün", "Sesli dakika", "Oturum", "Gerçek maliyet", "Denemeyi kullanan öğrenci", "Denemeden sonra Plus'a geçen"]) {
      expect(html).toContain(label.replace("'", "&#x27;"));
    }
    // Ham kod yok.
    expect(html).not.toMatch(/REALTIME_VOICE|credit_reservations|ai_usage_events/);
  });

  it("kokpit sayfasında, yalnız okur", () => {
    const page = readFileSync("src/app/admin/page.tsx", "utf8");
    expect(page).toContain("loadVoiceCockpit(service)");
    expect(page).toContain("<VoiceTutorCard voice={voice} />");
    const loader = readFileSync("src/lib/admin/voice-cockpit.ts", "utf8");
    expect(loader).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
  });
});
