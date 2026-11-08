import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  Plus yaşam döngüsü ve ekip anketi: davranış testleri (8 Kasım 2026, ürün sahibinin isteği: kritik bekçiler kod
  metnine değil davranışa baksın). Uç noktalar gerçek koduyla çağrılır; yalnız dış bağımlılıklar (oturum, abonelik,
  ses önbelleği, veritabanı) taklit edilir.
*/
const state = {
  premium: false,
  newChars: 0,
  staff: false,
  synthCalls: 0,
  inserts: [] as unknown[],
};
const service = {
  from: () => ({
    insert: async (row: unknown) => {
      state.inserts.push(row);
      return { error: null };
    },
  }),
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/guards", async () => {
  const { NextResponse } = await import("next/server");
  return {
    withUser: async () => ({ ok: true, ctx: { userId: "u1", service } }),
    errorResponse: (status: number, code: string) => NextResponse.json({ code }, { status }),
  };
});
vi.mock("@/lib/billing/entitlements", () => ({
  getUserEntitlements: async () => ({ isPremium: state.premium }),
  requireFeature: () => state.premium,
}));
vi.mock("@/lib/learning/audio-cache", () => ({
  countNewAudioChars: async () => state.newChars,
  synthesizeCharged: async (_service: unknown, _user: unknown, lines: unknown[]) => {
    state.synthCalls += 1;
    return { ok: true, creditsSpent: 0, tracks: lines.map((_, i) => ({ url: `https://ses/${i}.mp3`, durationMs: 1000 })) };
  },
  synthesizeShared: async () => ({ ok: true, creditsSpent: 0, tracks: [] }),
}));
vi.mock("@/lib/content-pool/shared-media", () => ({
  isSharedPodcastScript: async () => false,
  sharedBudgetAllows: async () => false,
}));
vi.mock("@/lib/auth/roles", () => ({ isAdminUser: async () => state.staff }));
vi.mock("@/lib/feedback/weekly-survey-server", () => ({
  surveyEligibility: async () => ({ show: true, week: "2026-W45" }),
  surveySegment: async () => "free",
}));

const { POST: audioPost } = await import("@/app/api/learning/podcast/audio/route");
const { GET: surveyGet, POST: surveyPost } = await import("@/app/api/feedback/weekly/route");

const audioRequest = () =>
  new Request("http://x/api/learning/podcast/audio", {
    method: "POST",
    body: JSON.stringify({ chapters: [{ title: "Bölüm", lines: [{ speaker: "ada", text: "Mitoz eş hücre verir." }] }] }),
  });

beforeEach(() => {
  state.premium = false;
  state.newChars = 0;
  state.staff = false;
  state.synthCalls = 0;
  state.inserts = [];
});

describe("Plus'tan dönen öğrenci kendi podcast sesini dinler", () => {
  it("ücretsiz hesap: ses önbellekteyse çalar (maliyet yok)", async () => {
    const response = await audioPost(audioRequest());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { lines: { url: string }[] };
    expect(body.lines[0]!.url).toBe("https://ses/0.mp3");
    expect(state.synthCalls).toBe(1);
  });

  it("ücretsiz hesap: tek satır yeni ses gerekiyorsa Plus ister, üretim başlamaz", async () => {
    state.newChars = 42;
    const response = await audioPost(audioRequest());
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ code: "premium_required" });
    expect(state.synthCalls).toBe(0);
  });

  it("Plus hesap: önbellek sorulmadan üretim yoluna gider", async () => {
    state.premium = true;
    state.newChars = 42;
    const response = await audioPost(audioRequest());
    expect(response.status).toBe(200);
    expect(state.synthCalls).toBe(1);
  });
});

describe("haftalık anket ekibe çıkmaz", () => {
  it("öğrenciye gösterilir, kurucu ve yöneticiye gösterilmez", async () => {
    const student = await surveyGet(new Request("http://x/api/feedback/weekly"));
    expect(await student.json()).toEqual({ show: true, week: "2026-W45" });
    state.staff = true;
    const staff = await surveyGet(new Request("http://x/api/feedback/weekly"));
    expect(await staff.json()).toEqual({ show: false, week: "2026-W45" });
  });

  const dismiss = () =>
    new Request("http://x/api/feedback/weekly", { method: "POST", body: JSON.stringify({ action: "dismiss" }) });

  it("öğrencinin «Şimdi değil»i haftanın satırını yazar", async () => {
    const response = await surveyPost(dismiss());
    expect(await response.json()).toEqual({ ok: true, recorded: true });
    expect(state.inserts).toEqual([{ user_id: "u1", week_key: "2026-W45", segment: "free", dismissed: true }]);
  });

  it("ekibin gönderimi yazılmaz (öğrenci sonuçlarına karışmaz)", async () => {
    state.staff = true;
    const response = await surveyPost(dismiss());
    expect(await response.json()).toEqual({ ok: true, recorded: false });
    expect(state.inserts).toEqual([]);
  });
});
