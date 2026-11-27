import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => void task,
}));

import {
  createRealtimeSession,
  endRealtimeSession,
  runRealtimeWatchdog,
  tickRealtimeSession,
  type RealtimeDeps,
} from "@/lib/tutor/realtime/session";
import { memoryStore, type RealtimeStore } from "@/lib/tutor/realtime/store";
import {
  billedSeconds,
  minuteChargeable,
  minuteReservationKey,
  settlePlan,
  tickDecision,
  unconnectedRefundEligible,
  watchdogDueMs,
} from "@/lib/tutor/realtime/billing";
import { REALTIME_MAX_MINUTES, REALTIME_TRIAL_SECONDS, REFUSAL_MESSAGE } from "@/lib/tutor/realtime/config";
import { CREDIT_PRICE_TABLE } from "@/lib/credits/price-table";

/*
  Canlı sesli öğretmenin sunucu akışı (21 Kasım 2026): kapı, dakika başı kredi, /tick, bekçi, bitiş ve kayıt. Bütün dış
  bağımlılıklar sahte (`RealtimeDeps`): OpenAI çağrısı, kredi RPC'leri, veritabanı yazımı ve saat.
*/

const service = {} as SupabaseClient;
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const SDP = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n";

type Harness = {
  deps: RealtimeDeps;
  clock: { now: number };
  scheduled: (() => Promise<void>)[];
  store: RealtimeStore;
  ids: string[];
};

function harness(overrides: Partial<RealtimeDeps> = {}): Harness {
  const clock = { now: 1_000_000 };
  const scheduled: (() => Promise<void>)[] = [];
  const store = memoryStore();
  let seq = 0;
  const ids: string[] = [];
  const deps: RealtimeDeps = {
    store,
    apiKey: "sk-test",
    now: () => clock.now,
    newId: () => {
      seq += 1;
      const id = `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
      ids.push(id);
      return id;
    },
    schedule: (task) => {
      scheduled.push(task);
    },
    sleep: async (ms) => {
      clock.now += ms;
    },
    access: vi.fn(async () => ({ kind: "paid" as const })),
    claimTrial: vi.fn(async () => ({ ok: true as const, markerId: "marker-1" })),
    releaseTrial: vi.fn(async () => undefined),
    reserve: vi.fn(async (_s, _u, key: string) => ({ ok: true as const, reservationId: `res:${key}`, cost: 60 })),
    commit: vi.fn(async () => undefined),
    refund: vi.fn(async () => undefined),
    loadContext: vi.fn(async (_s, _u, input) => ({
      instructions: `talimat${input.trial ? " (deneme)" : ""}`,
      conversationId: input.conversationId,
      prepId: input.prepId,
    })),
    createCall: vi.fn(async () => ({ ok: true as const, answer: "v=0\r\nanswer", callId: "rtc_abc123" })),
    hangup: vi.fn(async () => true),
    saveConversation: vi.fn(async () => "conv-1"),
    recordUsage: vi.fn(async () => undefined),
    ...overrides,
  };
  return { deps, clock, scheduled, store, ids };
}

async function open(h: Harness, body: Record<string, unknown> = {}) {
  return createRealtimeSession(service, h.deps, { userId: USER, body: { sdp: SDP, ...body } as never });
}

const sessionIdOf = (outcome: Awaited<ReturnType<typeof open>>) => (outcome.body.ok ? outcome.body.sessionId : "");

describe("ücret kuralı (saf)", () => {
  it("dakikası 60 kredi; anahtar oturum + dakika", () => {
    expect(CREDIT_PRICE_TABLE.REALTIME_VOICE_MINUTE).toEqual({ credits: 60, per: "dakika" });
    expect(minuteReservationKey("s1", 3)).toBe("realtime_voice:s1:m3");
  });

  it("başlayan dakika ödenir: dakikanın ilk 5 saniyesi geçtiyse", () => {
    const start = 0;
    // 3. dakika 120. saniyede başlar.
    expect(minuteChargeable(start, 3, 124_999)).toBe(false);
    expect(minuteChargeable(start, 3, 125_000)).toBe(true);
    const plan = settlePlan({
      startedAt: start,
      endedAt: 124_000,
      minutes: [
        { minute: 1, reservationId: "a", settle: "committed" },
        { minute: 2, reservationId: "b", settle: "pending" },
        { minute: 3, reservationId: "c", settle: "pending" },
      ],
    });
    expect(plan.commit.map((m) => m.minute)).toEqual([2]);
    expect(plan.refund.map((m) => m.minute)).toEqual([3]);
    expect(plan.chargedMinutes).toBe(2);
  });

  it("bağlantı kurulmadıysa hepsi iade (refundAll)", () => {
    const plan = settlePlan({
      startedAt: 0,
      endedAt: 30_000,
      refundAll: true,
      minutes: [{ minute: 1, reservationId: "a", settle: "pending" }],
    });
    expect(plan.refund).toHaveLength(1);
    expect(plan.chargedMinutes).toBe(0);
    expect(unconnectedRefundEligible({ connected: false, startedAt: 0, endedAt: 30_000, paidMinutes: 1 })).toBe(true);
    expect(unconnectedRefundEligible({ connected: true, startedAt: 0, endedAt: 30_000, paidMinutes: 1 })).toBe(false);
    expect(unconnectedRefundEligible({ connected: false, startedAt: 0, endedAt: 50_000, paidMinutes: 1 })).toBe(false);
  });

  it("/tick kararı: sıra, erken istek, tekrar ve tavan", () => {
    expect(tickDecision({ startedAt: 0, paidMinutes: 1, requested: 2, now: 55_000 })).toEqual({ kind: "reserve", minute: 2 });
    expect(tickDecision({ startedAt: 0, paidMinutes: 1, requested: 2, now: 10_000 })).toEqual({ kind: "early" });
    expect(tickDecision({ startedAt: 0, paidMinutes: 2, requested: 2, now: 55_000 })).toEqual({ kind: "already", minute: 2 });
    expect(tickDecision({ startedAt: 0, paidMinutes: 1, requested: 3, now: 115_000 })).toEqual({ kind: "invalid" });
    expect(
      tickDecision({ startedAt: 0, paidMinutes: REALTIME_MAX_MINUTES, requested: REALTIME_MAX_MINUTES + 1, now: REALTIME_MAX_MINUTES * 60_000 }),
    ).toEqual({ kind: "max_duration" });
  });

  it("bekçi ödenen sürenin bitiminden 15 sn sonra; denemede 60 + 5 sn", () => {
    expect(watchdogDueMs(0, "paid", 2)).toBe(135_000);
    expect(watchdogDueMs(0, "trial", 0)).toBe(REALTIME_TRIAL_SECONDS * 1000 + 5_000);
    expect(billedSeconds(0, "trial", 0, 90_000)).toBe(REALTIME_TRIAL_SECONDS);
  });
});

describe("oturum açılışı", () => {
  it("anahtar yoksa kullanılamıyor (OpenAI çağrısı yok)", async () => {
    const h = harness({ apiKey: undefined });
    const outcome = await open(h);
    expect(outcome.status).toBe(503);
    expect(h.deps.createCall).not.toHaveBeenCalled();
  });

  it("ücretli: ilk dakikanın kredisi ayrılır, çağrı açılır, bekçi kurulur, cevap SDP'si döner", async () => {
    const h = harness();
    const outcome = await open(h, { conversationId: null, prepId: null });
    expect(outcome.status).toBe(200);
    expect(outcome.body).toMatchObject({ ok: true, sdp: "v=0\r\nanswer", access: "paid", trialSeconds: null, minuteSeconds: 60 });
    const id = sessionIdOf(outcome);
    expect(h.deps.reserve).toHaveBeenCalledWith(service, USER, `realtime_voice:${id}:m1`);
    expect(h.deps.claimTrial).not.toHaveBeenCalled();
    expect(h.scheduled).toHaveLength(1);
    const state = await h.store.get(id);
    expect(state.ok && state.value?.minutes).toEqual([{ minute: 1, reservationId: `res:realtime_voice:${id}:m1`, settle: "pending" }]);
    // İstemciye anahtar gitmez.
    expect(JSON.stringify(outcome.body)).not.toContain("sk-test");
  });

  it("öğrencinin konuları OpenAI çağrısına gider: dil tr, terim ipucu, yakın alan, 700 ms sessizlik", async () => {
    const h = harness({
      loadContext: vi.fn(async (_s, _u, input) => ({
        instructions: "talimat",
        conversationId: input.conversationId,
        prepId: input.prepId,
        sttTerms: ["Trafo Bağlantı Grupları", "Asenkron Motorlar"],
      })),
    });
    expect((await open(h)).status).toBe(200);
    const sent = (h.deps.createCall as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      session: { audio: { input: { transcription: { model: string; language: string; prompt: string }; noise_reduction: unknown; turn_detection: Record<string, unknown> } } };
    };
    const { transcription, noise_reduction, turn_detection } = sent.session.audio.input;
    expect(transcription.model).toBe("gpt-4o-transcribe");
    expect(transcription.language).toBe("tr");
    expect(transcription.prompt).toContain("Trafo Bağlantı Grupları");
    expect(transcription.prompt).toContain("Asenkron Motorlar");
    expect(transcription.prompt).toContain("KOAH");
    expect(noise_reduction).toEqual({ type: "near_field" });
    expect(turn_detection).toMatchObject({ type: "server_vad", silence_duration_ms: 700, prefix_padding_ms: 350 });
  });

  it("bağlam terim döndürmezse (eski sürüm, okuma düştü) çağrı yine açılır; ipucu evrensel terimlerle kalır", async () => {
    const h = harness();
    expect((await open(h)).status).toBe(200);
    const sent = (h.deps.createCall as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      session: { audio: { input: { transcription: { prompt: string } } } };
    };
    expect(sent.session.audio.input.transcription.prompt).toContain("TBMM");
    expect(sent.session.audio.input.transcription.prompt).not.toContain("Öğrencinin çalıştığı konular");
  });

  it("ücretsiz ilk sefer: deneme sahiplenilir, kredi ayrılmaz", async () => {
    const h = harness({ access: vi.fn(async () => ({ kind: "trial" as const })) });
    const outcome = await open(h);
    expect(outcome.body).toMatchObject({ ok: true, access: "trial", trialSeconds: REALTIME_TRIAL_SECONDS, maxSeconds: REALTIME_TRIAL_SECONDS });
    expect(h.deps.claimTrial).toHaveBeenCalledTimes(1);
    expect(h.deps.reserve).not.toHaveBeenCalled();
    expect(h.deps.loadContext).toHaveBeenCalledWith(service, USER, expect.objectContaining({ trial: true }));
  });

  it("ücretsiz hesap (27 Kasım 2026'dan beri deneme yok): Plus daveti (402), kredi ayrılmaz, çağrı açılmaz", async () => {
    const h = harness({ access: vi.fn(async () => ({ kind: "plus_required" as const })) });
    const outcome = await open(h);
    expect(outcome.status).toBe(402);
    expect(outcome.body).toEqual({ ok: false, code: "plus_required", message: REFUSAL_MESSAGE.plus_required });
    expect(REFUSAL_MESSAGE.plus_required).toBe("Canlı sesli öğretmen Sınav Haftası, Plus ve Sigma'da açık.");
    expect(h.deps.reserve).not.toHaveBeenCalled();
    expect(h.deps.claimTrial).not.toHaveBeenCalled();
    expect(h.deps.createCall).not.toHaveBeenCalled();
  });

  it("ücretsiz ikinci sefer: Plus daveti (402), çağrı açılmaz", async () => {
    const h = harness({ access: vi.fn(async () => ({ kind: "trial_used" as const })) });
    const outcome = await open(h);
    expect(outcome.status).toBe(402);
    expect(outcome.body).toEqual({ ok: false, code: "trial_used", message: REFUSAL_MESSAGE.trial_used });
    expect(h.deps.createCall).not.toHaveBeenCalled();
  });

  it("aynı anda gelen ikinci deneme de 402 (ilk satır kazanır)", async () => {
    const h = harness({
      access: vi.fn(async () => ({ kind: "trial" as const })),
      claimTrial: vi.fn(async () => ({ ok: false as const, reason: "used" as const })),
    });
    expect((await open(h)).status).toBe(402);
  });

  it("hak yetmezse 402 quota; çağrı açılmaz", async () => {
    const h = harness({ reserve: vi.fn(async () => ({ ok: false as const, reason: "insufficient_credits" as const })) });
    const outcome = await open(h);
    expect(outcome.status).toBe(402);
    expect(outcome.body).toMatchObject({ ok: false, code: "quota" });
    expect(h.deps.createCall).not.toHaveBeenCalled();
  });

  it("OpenAI çağrısı kurulamazsa ilk dakika iade, deneme geri verilir", async () => {
    const paid = harness({ createCall: vi.fn(async () => ({ ok: false as const, status: 500, quotaExhausted: false, message: "x" })) });
    expect((await open(paid)).status).toBe(502);
    expect(paid.deps.refund).toHaveBeenCalledTimes(1);
    const trial = harness({
      access: vi.fn(async () => ({ kind: "trial" as const })),
      createCall: vi.fn(async () => ({ ok: false as const, status: 429, quotaExhausted: true, message: "insufficient_quota" })),
    });
    const outcome = await open(trial);
    expect(outcome.status).toBe(503);
    expect(outcome.body).toMatchObject({ code: "unavailable" });
    expect(trial.deps.releaseTrial).toHaveBeenCalledWith(service, USER, "marker-1");
  });

  it("durum yazılamazsa (süre sayılamaz) çağrı kapatılır ve iade edilir", async () => {
    const store = memoryStore();
    const h = harness({ store: { ...store, put: async () => false } });
    const outcome = await open(h);
    expect(outcome.status).toBe(503);
    expect(h.deps.hangup).toHaveBeenCalledWith("sk-test", "rtc_abc123");
    expect(h.deps.refund).toHaveBeenCalledTimes(1);
  });

  it("yeni oturum açılınca öğrencinin açık oturumu kapanır (sayfa yenilendi)", async () => {
    const h = harness();
    const first = sessionIdOf(await open(h));
    h.clock.now += 30_000;
    const second = sessionIdOf(await open(h));
    expect(second).not.toBe(first);
    const previous = await h.store.get(first);
    expect(previous.ok && previous.value).toMatchObject({ status: "ended", endReason: "replaced" });
    expect(h.deps.hangup).toHaveBeenCalledWith("sk-test", "rtc_abc123");
    // 30 sn konuşulmuştu: 1. dakika ödenir.
    expect(h.deps.commit).toHaveBeenCalledWith(service, `res:realtime_voice:${first}:m1`);
  });
});

describe("/tick", () => {
  let h: Harness;
  let id: string;
  beforeEach(async () => {
    h = harness();
    id = sessionIdOf(await open(h));
  });

  it("bir sonraki dakikayı ayırır, geçen dakikayı kesinleştirir, bekçiyi yeniden kurar", async () => {
    h.clock.now += 55_000;
    const outcome = await tickRealtimeSession(service, h.deps, { userId: USER, body: { sessionId: id, minute: 2 } });
    expect(outcome.body).toEqual({ ok: true, minute: 2, paidSeconds: 120 });
    expect(h.deps.reserve).toHaveBeenLastCalledWith(service, USER, `realtime_voice:${id}:m2`);
    expect(h.deps.commit).toHaveBeenCalledWith(service, `res:realtime_voice:${id}:m1`);
    expect(h.scheduled).toHaveLength(2);
  });

  it("aynı dakika ikinci kez istenirse ikinci kez ayrılmaz", async () => {
    h.clock.now += 55_000;
    await tickRealtimeSession(service, h.deps, { userId: USER, body: { sessionId: id, minute: 2 } });
    const again = await tickRealtimeSession(service, h.deps, { userId: USER, body: { sessionId: id, minute: 2 } });
    expect(again.body).toEqual({ ok: true, minute: 2, paidSeconds: 120 });
    expect(h.deps.reserve).toHaveBeenCalledTimes(2);
  });

  it("hak biterse çağrıyı kapatır ve söyler", async () => {
    h.clock.now += 55_000;
    h.deps.reserve = vi.fn(async () => ({ ok: false as const, reason: "insufficient_credits" as const }));
    const outcome = await tickRealtimeSession(service, h.deps, { userId: USER, body: { sessionId: id, minute: 2 } });
    expect(outcome.status).toBe(402);
    expect(outcome.body).toMatchObject({ ok: false, code: "quota" });
    expect(h.deps.hangup).toHaveBeenCalledWith("sk-test", "rtc_abc123");
    expect(h.deps.commit).toHaveBeenCalledWith(service, `res:realtime_voice:${id}:m1`);
    const state = await h.store.get(id);
    expect(state.ok && state.value?.status).toBe("ended");
  });

  it("çok erken istek ayırmaz; başkasının oturumu 404", async () => {
    h.clock.now += 5_000;
    expect((await tickRealtimeSession(service, h.deps, { userId: USER, body: { sessionId: id, minute: 2 } })).status).toBe(409);
    expect((await tickRealtimeSession(service, h.deps, { userId: OTHER, body: { sessionId: id, minute: 2 } })).status).toBe(404);
    expect(h.deps.reserve).toHaveBeenCalledTimes(1);
  });

  it("denemede dakika uzatılmaz", async () => {
    const t = harness({ access: vi.fn(async () => ({ kind: "trial" as const })) });
    const trialId = sessionIdOf(await open(t));
    t.clock.now += 55_000;
    const outcome = await tickRealtimeSession(service, t.deps, { userId: USER, body: { sessionId: trialId, minute: 2 } });
    expect(outcome.body).toMatchObject({ ok: false, code: "trial_over" });
    expect(t.deps.reserve).not.toHaveBeenCalled();
  });
});

describe("bekçi", () => {
  it("süre uzamadıysa çağrıyı kapatır ve dakikayı kesinleştirir", async () => {
    const h = harness();
    const id = sessionIdOf(await open(h));
    await h.scheduled[0]!();
    expect(h.deps.hangup).toHaveBeenCalledWith("sk-test", "rtc_abc123");
    const state = await h.store.get(id);
    expect(state.ok && state.value).toMatchObject({ status: "ended", endReason: "watchdog" });
    expect(h.deps.commit).toHaveBeenCalledWith(service, `res:realtime_voice:${id}:m1`);
  });

  it("/tick süreyi uzattıysa dokunmaz", async () => {
    const h = harness();
    const id = sessionIdOf(await open(h));
    h.clock.now += 55_000;
    await tickRealtimeSession(service, h.deps, { userId: USER, body: { sessionId: id, minute: 2 } });
    const result = await runRealtimeWatchdog(service, h.deps, { sessionId: id, callId: "rtc_abc123", minutesAtSchedule: 1, dueAt: 0 });
    expect(result).toBe("extended");
    expect(h.deps.hangup).not.toHaveBeenCalled();
  });

  it("deneme 60 sn sonra kapanır (istemci bitirmese de)", async () => {
    const h = harness({ access: vi.fn(async () => ({ kind: "trial" as const })) });
    const id = sessionIdOf(await open(h));
    const startedAt = h.clock.now;
    await h.scheduled[0]!();
    expect(h.clock.now - startedAt).toBe(REALTIME_TRIAL_SECONDS * 1000 + 5_000);
    const state = await h.store.get(id);
    expect(state.ok && state.value).toMatchObject({ status: "ended", endReason: "trial_over" });
    expect(h.deps.hangup).toHaveBeenCalled();
  });

  it("durum okunamazsa elindeki çağrı kimliğiyle kapatır (bedava konuşma yok)", async () => {
    const h = harness();
    const store: RealtimeStore = { ...memoryStore(), get: async () => ({ ok: false, reason: "unavailable" }) };
    const result = await runRealtimeWatchdog(service, { ...h.deps, store }, { sessionId: "x", callId: "rtc_zz", minutesAtSchedule: 1, dueAt: 0 });
    expect(result).toBe("hung_up_blind");
    expect(h.deps.hangup).toHaveBeenCalledWith("sk-test", "rtc_zz");
  });
});

describe("bitiş", () => {
  const turns = [
    { role: "assistant", text: "Merhaba, bugün ne çalışalım?" },
    { role: "user", text: "Kesirleri anlatır mısın?" },
    { role: "assistant", text: "Tabii. Pay ve paydayla başlayalım." },
  ];

  it("kural: 2:04'te biten oturumda 3. dakika iade, 2:05'te ödenir", async () => {
    for (const [after, charged] of [
      [124_000, 2],
      [125_000, 3],
    ] as const) {
      const h = harness();
      const id = sessionIdOf(await open(h));
      const start = h.clock.now;
      h.clock.now = start + 55_000;
      await tickRealtimeSession(service, h.deps, { userId: USER, body: { sessionId: id, minute: 2 } });
      h.clock.now = start + 115_000;
      await tickRealtimeSession(service, h.deps, { userId: USER, body: { sessionId: id, minute: 3 } });
      h.clock.now = start + after;
      const outcome = await endRealtimeSession(service, h.deps, {
        userId: USER,
        body: { sessionId: id, reason: "user", connected: true, turns },
      });
      expect(outcome.body).toMatchObject({ ok: true, chargedMinutes: charged });
      if (charged === 2) expect(h.deps.refund).toHaveBeenCalledWith(service, `res:realtime_voice:${id}:m3`);
    }
  });

  it("konuşma sohbete bir kez yazılır; kullanım bir kez kaydedilir; çağrı yanıttan sonra kapanır", async () => {
    const h = harness();
    const id = sessionIdOf(await open(h, { conversationId: "33333333-3333-4333-8333-333333333333" }));
    h.clock.now += 40_000;
    const usage = { textIn: 100, textOut: 20, audioIn: 50, audioOut: 300, responses: 2 };
    const body = { sessionId: id, reason: "user" as const, connected: true, turns, usage };
    const first = await endRealtimeSession(service, h.deps, { userId: USER, body });
    expect(first.body).toMatchObject({ ok: true, conversationId: "conv-1", saved: true, chargedMinutes: 1 });
    expect(h.deps.saveConversation).toHaveBeenCalledWith(
      service,
      expect.objectContaining({
        userId: USER,
        conversationId: "33333333-3333-4333-8333-333333333333",
        messages: [
          { role: "assistant", content: "Merhaba, bugün ne çalışalım?" },
          { role: "user", content: "Kesirleri anlatır mısın?" },
          { role: "assistant", content: "Tabii. Pay ve paydayla başlayalım." },
        ],
      }),
    );
    expect(h.deps.recordUsage).toHaveBeenCalledWith(service, {
      userId: USER,
      usage: expect.objectContaining({ textIn: 100, audioOut: 300, responses: 2 }),
    });
    // Öğrenci bitirdiğinde bağlantıyı istemci kapattı: kapatma yanıttan sonra.
    expect(h.deps.hangup).not.toHaveBeenCalled();
    await Promise.all(h.scheduled.slice(1).map((task) => task()));
    expect(h.deps.hangup).toHaveBeenCalledWith("sk-test", "rtc_abc123");
    const second = await endRealtimeSession(service, h.deps, { userId: USER, body });
    expect(second.body).toMatchObject({ ok: true, saved: true });
    expect(h.deps.saveConversation).toHaveBeenCalledTimes(1);
    expect(h.deps.recordUsage).toHaveBeenCalledTimes(1);
    expect(h.deps.commit).toHaveBeenCalledTimes(1);
  });

  it("bağlantı hiç kurulmadıysa ilk dakika iade, deneme geri verilir (günde sınırlı)", async () => {
    const paid = harness();
    const id = sessionIdOf(await open(paid));
    paid.clock.now += 20_000;
    const outcome = await endRealtimeSession(service, paid.deps, {
      userId: USER,
      body: { sessionId: id, reason: "error", connected: false, turns: [] },
    });
    expect(outcome.body).toMatchObject({ ok: true, chargedMinutes: 0, saved: false });
    expect(paid.deps.refund).toHaveBeenCalledTimes(1);
    expect(paid.deps.saveConversation).not.toHaveBeenCalled();

    const trial = harness({ access: vi.fn(async () => ({ kind: "trial" as const })) });
    let releases = 0;
    trial.deps.releaseTrial = vi.fn(async () => {
      releases += 1;
    });
    for (let index = 0; index < 4; index += 1) {
      const sid = sessionIdOf(await open(trial));
      trial.clock.now += 10_000;
      await endRealtimeSession(service, trial.deps, { userId: USER, body: { sessionId: sid, reason: "error", connected: false, turns: [] } });
    }
    // Günde en çok 3 bağlantısız iade.
    expect(releases).toBe(3);
  });

  it("başkasının oturumunu bitiremez; geçersiz satır ve kartlar düşer", async () => {
    const h = harness();
    const id = sessionIdOf(await open(h));
    expect((await endRealtimeSession(service, h.deps, { userId: OTHER, body: { sessionId: id, reason: "user", connected: true, turns } })).status).toBe(404);
    h.clock.now += 30_000;
    await endRealtimeSession(service, h.deps, {
      userId: USER,
      body: {
        sessionId: id,
        reason: "user",
        connected: true,
        turns: [{ role: "system", text: "kural" }, { role: "assistant", text: "  " }, { role: "user", text: "Soru?" }, { role: "assistant", text: "Cevap." }],
        cards: [{ kind: "formula", title: "Alan", body: "$A=\\pi r^2$", afterTurn: 3 }, { kind: "script", title: "x", body: "y" }],
      },
    });
    expect(h.deps.saveConversation).toHaveBeenCalledWith(
      service,
      expect.objectContaining({
        messages: [
          { role: "user", content: "Soru?" },
          { role: "assistant", content: "Cevap.\n\n**Alan**\n\n$$A=\\pi r^2$$" },
        ],
      }),
    );
  });
});
