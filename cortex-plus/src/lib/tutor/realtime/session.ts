import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { commitCredits, refundCredits, reserveCredits } from "@/lib/credits/service";
import { istanbulDay } from "@/lib/istanbul-day";
import { claimTrial, releaseTrial, resolveRealtimeAccess } from "@/lib/tutor/realtime/access";
import {
  elapsedPending,
  minuteReservationKey,
  paidUntilMs,
  settlePlan,
  tickDecision,
  unconnectedRefundEligible,
  watchdogDueMs,
  billedSeconds,
  type MinuteEntry,
} from "@/lib/tutor/realtime/billing";
import {
  BOARD_CARD_MAX,
  END_REASONS,
  REALTIME_MAX_SESSION_SECONDS,
  REALTIME_MINUTE_SECONDS,
  REALTIME_TICK_LEAD_SECONDS,
  REALTIME_TRIAL_SECONDS,
  REALTIME_UNCONNECTED_REFUNDS_PER_DAY,
  REFUSAL_MESSAGE,
  SDP_MAX_CHARS,
  TRANSCRIPT_MAX_TURNS,
  type RealtimeAccess,
  type RealtimeCreateResponse,
  type RealtimeEndReason,
  type RealtimeEndResponse,
  type RealtimeFailure,
  type RealtimeFailureCode,
  type RealtimeTickResponse,
  type RealtimeUsageSnapshot,
} from "@/lib/tutor/realtime/config";
import { createRealtimeCall, hangupRealtimeCall, realtimeSessionConfig } from "@/lib/tutor/realtime/openai-call";
import { loadVoiceContext, recordRealtimeUsage, saveVoiceConversation, type VoiceContext } from "@/lib/tutor/realtime/persist";
import { defaultRealtimeStore, type RealtimeSessionState, type RealtimeStore } from "@/lib/tutor/realtime/store";
import { composeSavedTurns, type SavedTurn } from "@/lib/tutor/realtime/transcript";
import { laterUsage, sanitizeUsage } from "@/lib/tutor/realtime/usage";

/*
  Canlı sesli öğretmenin sunucu akışı (21 Kasım 2026). Üç uç (/realtime-session, /tick, /end) ve bekçi bu dosyadaki
  işlevleri çağırır; uç dosyaları yalnız kimlik, bayrak ve hız sınırını yapar. Bağımlılıklar (`RealtimeDeps`) dışarıdan
  verilebilir: birim testleri sahteyle, fikstür ucu kimliksiz ve kredisiz bir yolla aynı kodu koşar.

  Kural özeti (ayrıntı `billing.ts`):
  - Açılış: kapı (Plus / Sınav Haftası / Sigma / kurucu; ücretsizde tek seferlik deneme) → 1. dakikanın kredisi →
    OpenAI çağrısı. Çağrı kurulamazsa ayrılan kredi iade, deneme geri verilir.
  - Aynı öğrencinin açık oturumu varsa yenisi açılırken eskisi kapanır (sayfa yenilendi, ikinci sekme).
  - /tick bir sonraki dakikayı ayırır, tam geçen dakikayı kesinleştirir; ayıramazsa çağrıyı kapatır.
  - Bekçi: her açılış ve /tick, ödenen sürenin bitiminden 15 sn sonrasına (denemede 5 sn) bir kontrol bırakır; o ana
    kadar süre uzamadıysa çağrıyı kapatır ve dakikaları kurala göre kapatır.
  - /end: çağrıyı kapatır, dakikaları kapatır, konuşmayı sohbete yazar, gider satırlarını kaydeder (her biri bir kez).
*/

export type RealtimeDeps = {
  store: RealtimeStore;
  apiKey: string | undefined;
  now: () => number;
  newId: () => string;
  /** Yanıttan sonra çalışacak iş (uçta `after`). */
  schedule: (task: () => Promise<void>) => void;
  sleep: (ms: number) => Promise<void>;
  access: typeof resolveRealtimeAccess;
  claimTrial: typeof claimTrial;
  releaseTrial: typeof releaseTrial;
  reserve: (service: SupabaseClient, userId: string, key: string) => ReturnType<typeof reserveCredits>;
  commit: typeof commitCredits;
  refund: typeof refundCredits;
  loadContext: typeof loadVoiceContext;
  createCall: typeof createRealtimeCall;
  hangup: typeof hangupRealtimeCall;
  saveConversation: typeof saveVoiceConversation;
  recordUsage: typeof recordRealtimeUsage;
};

export function defaultRealtimeDeps(overrides: Partial<RealtimeDeps> = {}): RealtimeDeps {
  return {
    store: defaultRealtimeStore(),
    apiKey: process.env.OPENAI_API_KEY,
    now: () => Date.now(),
    newId: () => randomUUID(),
    schedule: (task) => void task().catch(() => undefined),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    access: resolveRealtimeAccess,
    claimTrial,
    releaseTrial,
    reserve: (service, userId, key) => reserveCredits(service, userId, "REALTIME_VOICE_MINUTE", key, 1, { freeMeter: null }),
    commit: commitCredits,
    refund: refundCredits,
    loadContext: loadVoiceContext,
    createCall: createRealtimeCall,
    hangup: hangupRealtimeCall,
    saveConversation: saveVoiceConversation,
    recordUsage: recordRealtimeUsage,
    ...overrides,
  };
}

export type Outcome<T> = { status: number; body: T };

const refusal = (status: number, code: RealtimeFailureCode): Outcome<RealtimeFailure> => ({
  status,
  body: { ok: false, code, message: REFUSAL_MESSAGE[code] },
});

export const createBodySchema = z.object({
  sdp: z.string().min(10).max(SDP_MAX_CHARS),
  conversationId: z.string().uuid().nullish(),
  prepId: z.string().uuid().nullish(),
});

export const tickBodySchema = z.object({
  sessionId: z.string().uuid(),
  minute: z.number().int().min(2).max(1000),
  usage: z.unknown().optional(),
});

export const endBodySchema = z.object({
  sessionId: z.string().uuid(),
  reason: z.enum(END_REASONS as unknown as [RealtimeEndReason, ...RealtimeEndReason[]]).default("user"),
  connected: z.boolean().default(true),
  turns: z.array(z.unknown()).max(TRANSCRIPT_MAX_TURNS * 2).default([]),
  cards: z.array(z.unknown()).max(BOARD_CARD_MAX * 4).optional(),
  usage: z.unknown().optional(),
});

/* ---------------------------------------------------------------------------------------------------------------- */
/* Kapanış: çağrıyı kapat, dakikaları kurala göre kesinleştir ya da iade et (bir kez).                              */
/* ---------------------------------------------------------------------------------------------------------------- */

async function settleMinutes(
  service: SupabaseClient,
  deps: RealtimeDeps,
  state: RealtimeSessionState,
  entries: { commit: MinuteEntry[]; refund: MinuteEntry[] },
): Promise<void> {
  for (const entry of entries.commit) {
    if (!entry.reservationId) {
      entry.settle = "committed";
      continue;
    }
    try {
      await deps.commit(service, entry.reservationId);
      entry.settle = "committed";
    } catch {
      // Kesinleşmedi: satır "bekliyor"da kalır; takılı ayırma temizliği öğrenci lehine iade eder.
      console.warn("realtime_minute_commit_failed", { sessionId: state.id, minute: entry.minute });
    }
  }
  for (const entry of entries.refund) {
    if (!entry.reservationId) {
      entry.settle = "refunded";
      continue;
    }
    try {
      await deps.refund(service, entry.reservationId);
      entry.settle = "refunded";
    } catch {
      console.warn("realtime_minute_refund_failed", { sessionId: state.id, minute: entry.minute });
    }
  }
}

/** Oturumu kapatır (çağrı + dakikalar). Kilit çağıranda. Zaten kapalıysa dokunmaz. */
async function finalize(
  service: SupabaseClient,
  deps: RealtimeDeps,
  state: RealtimeSessionState,
  input: { reason: RealtimeEndReason; at: number; refundAll?: boolean; hangupAfterResponse?: boolean },
): Promise<RealtimeSessionState> {
  if (state.status === "ended") return state;
  // Öğrenci bitirdiyse bağlantıyı istemci zaten kapattı: çağrının sunucuda kapatılması yanıtı bekletmez (yanıttan sonra).
  const apiKey = deps.apiKey;
  if (apiKey && input.hangupAfterResponse) deps.schedule(() => deps.hangup(apiKey, state.callId).then(() => undefined));
  else if (apiKey) await deps.hangup(apiKey, state.callId);
  // Ücrete esas bitiş ödenen süreyi geçemez (bekçi geç kalsa da fazladan dakika yazılmaz).
  const endedAt = Math.min(input.at, paidUntilMs(state.startedAt, state.access, state.minutes.length));
  const plan = settlePlan({ startedAt: state.startedAt, minutes: state.minutes, endedAt, refundAll: input.refundAll });
  await settleMinutes(service, deps, state, plan);
  if (input.refundAll && state.trialMarkerId) {
    await deps.releaseTrial(service, state.userId, state.trialMarkerId);
    state.trialMarkerId = null;
  }
  state.status = "ended";
  state.endedAt = endedAt;
  state.endReason = input.reason;
  return state;
}

async function withLock<T>(
  deps: RealtimeDeps,
  sessionId: string,
  work: () => Promise<T>,
  onBusy: () => T,
): Promise<T> {
  const release = await deps.store.lock(sessionId);
  if (!release) return onBusy();
  try {
    return await work();
  } finally {
    await release().catch(() => undefined);
  }
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Bekçi                                                                                                              */
/* ---------------------------------------------------------------------------------------------------------------- */

/**
 * Ödenen sürenin bitiminden sonra çalışır: süre uzamadıysa (yeni dakika ayrılmadıysa) çağrıyı kapatır. Durum
 * okunamazsa (Redis ulaşılamıyor) elindeki çağrı kimliğiyle kapatır: bedava konuşma kalmasın.
 */
export async function runRealtimeWatchdog(
  service: SupabaseClient,
  deps: RealtimeDeps,
  input: { sessionId: string; callId: string | null; minutesAtSchedule: number; dueAt: number },
): Promise<"extended" | "ended" | "closed" | "hung_up_blind"> {
  const wait = input.dueAt - deps.now();
  if (wait > 0) await deps.sleep(wait);
  const read = await deps.store.get(input.sessionId);
  if (!read.ok) {
    if (deps.apiKey) await deps.hangup(deps.apiKey, input.callId);
    console.warn("realtime_watchdog_blind_hangup", { sessionId: input.sessionId });
    return "hung_up_blind";
  }
  const state = read.value;
  if (!state || state.status === "ended") return "closed";
  if (state.minutes.length > input.minutesAtSchedule) return "extended";
  return withLock(
    deps,
    input.sessionId,
    async () => {
      const fresh = await deps.store.get(input.sessionId);
      const current = fresh.ok ? fresh.value : null;
      if (!current || current.status === "ended") return "closed" as const;
      if (current.minutes.length > input.minutesAtSchedule) return "extended" as const;
      await finalize(service, deps, current, {
        reason: current.access === "trial" ? "trial_over" : "watchdog",
        at: deps.now(),
      });
      if (!current.usageRecorded && current.usage) {
        await deps.recordUsage(service, { userId: current.userId, usage: current.usage });
        current.usageRecorded = true;
      }
      await deps.store.put(current);
      console.info("realtime_session_ended", { sessionId: current.id, reason: current.endReason, minutes: current.minutes.length });
      return "ended" as const;
    },
    () => "extended" as const,
  );
}

function scheduleWatchdog(service: SupabaseClient, deps: RealtimeDeps, state: RealtimeSessionState): void {
  const dueAt = watchdogDueMs(state.startedAt, state.access, state.minutes.length);
  deps.schedule(() =>
    runRealtimeWatchdog(service, deps, {
      sessionId: state.id,
      callId: state.callId,
      minutesAtSchedule: state.minutes.length,
      dueAt,
    }).then(() => undefined),
  );
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Açılış                                                                                                             */
/* ---------------------------------------------------------------------------------------------------------------- */

async function closePrevious(service: SupabaseClient, deps: RealtimeDeps, userId: string): Promise<boolean> {
  const pointer = await deps.store.userSession(userId);
  if (!pointer.ok) return false;
  if (!pointer.value) return true;
  const previousId = pointer.value;
  await withLock(
    deps,
    previousId,
    async () => {
      const read = await deps.store.get(previousId);
      const previous = read.ok ? read.value : null;
      if (!previous || previous.userId !== userId || previous.status === "ended") return;
      await finalize(service, deps, previous, { reason: "replaced", at: deps.now() });
      await deps.store.put(previous);
    },
    () => undefined,
  );
  return true;
}

export type CreateInput = {
  userId: string;
  body: z.infer<typeof createBodySchema>;
};

export async function createRealtimeSession(
  service: SupabaseClient,
  deps: RealtimeDeps,
  input: CreateInput,
): Promise<Outcome<RealtimeCreateResponse>> {
  if (!deps.apiKey) return refusal(503, "unavailable");
  const { userId, body } = input;
  if (!/^v=0/.test(body.sdp.trim())) return refusal(400, "failed");

  const decision = await deps.access(service, userId);
  // 27 Kasım 2026 (Burhan): ücretsiz hesapta canlı ses yok; istemci "Konuş"ta Plus penceresini açar, uç da 402 verir.
  if (decision.kind === "plus_required") return refusal(402, "plus_required");
  if (decision.kind === "trial_used") return refusal(402, "trial_used");
  if (decision.kind === "unavailable") return refusal(503, "unavailable");
  const access: RealtimeAccess = decision.kind;

  // Talimatın okumaları kredi ayrılırken paralel başlar (açılış gecikmesi kısalsın).
  const contextWork: Promise<VoiceContext> = deps.loadContext(service, userId, {
    conversationId: body.conversationId ?? null,
    prepId: body.prepId ?? null,
    trial: access === "trial",
  });

  if (!(await closePrevious(service, deps, userId))) {
    void contextWork.catch(() => undefined);
    return refusal(503, "busy");
  }

  const sessionId = deps.newId();
  let reservationId: string | null = null;
  let trialMarkerId: string | null = null;
  if (access === "trial") {
    const claim = await deps.claimTrial(service, userId);
    if (!claim.ok) {
      void contextWork.catch(() => undefined);
      return claim.reason === "used" ? refusal(402, "trial_used") : refusal(503, "unavailable");
    }
    trialMarkerId = claim.markerId;
  } else {
    const reserved = await deps.reserve(service, userId, minuteReservationKey(sessionId, 1));
    if (!reserved.ok) {
      void contextWork.catch(() => undefined);
      return reserved.reason === "insufficient_credits" ? refusal(402, "quota") : refusal(503, "busy");
    }
    reservationId = reserved.reservationId;
  }

  const undo = async () => {
    if (reservationId) await deps.refund(service, reservationId).catch(() => undefined);
    if (trialMarkerId) await deps.releaseTrial(service, userId, trialMarkerId);
  };

  let context: VoiceContext;
  try {
    context = await contextWork;
  } catch {
    await undo();
    return refusal(503, "failed");
  }

  const call = await deps.createCall({
    apiKey: deps.apiKey,
    sdp: body.sdp,
    session: realtimeSessionConfig({ instructions: context.instructions, sttTerms: context.sttTerms ?? [] }),
    userId,
  });
  if (!call.ok) {
    await undo();
    console.warn("realtime_call_create_failed", { status: call.status, quota: call.quotaExhausted, detail: call.message.slice(0, 160) });
    return refusal(call.quotaExhausted ? 503 : 502, call.quotaExhausted ? "unavailable" : "failed");
  }

  const state: RealtimeSessionState = {
    id: sessionId,
    userId,
    callId: call.callId,
    access,
    startedAt: deps.now(),
    status: "active",
    minutes: access === "trial" ? [] : [{ minute: 1, reservationId, settle: "pending" }],
    endedAt: null,
    endReason: null,
    conversationId: context.conversationId,
    prepId: context.prepId,
    trialMarkerId,
    usage: null,
    usageRecorded: false,
    saved: false,
    savedConversationId: null,
  };
  const stored = (await deps.store.put(state)) && (await deps.store.setUserSession(userId, sessionId));
  if (!stored) {
    // Süre sayılamaz: çağrı açık bırakılmaz.
    await deps.hangup(deps.apiKey, call.callId);
    await undo();
    return refusal(503, "busy");
  }
  scheduleWatchdog(service, deps, state);
  console.info("realtime_session_started", { sessionId, access, hasCallId: Boolean(call.callId) });
  return {
    status: 200,
    body: {
      ok: true,
      sessionId,
      sdp: call.answer,
      access,
      trialSeconds: access === "trial" ? REALTIME_TRIAL_SECONDS : null,
      minuteSeconds: REALTIME_MINUTE_SECONDS,
      maxSeconds: access === "trial" ? REALTIME_TRIAL_SECONDS : REALTIME_MAX_SESSION_SECONDS,
      tickLeadSeconds: REALTIME_TICK_LEAD_SECONDS,
      boardCardMax: BOARD_CARD_MAX,
    },
  };
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Dakika                                                                                                             */
/* ---------------------------------------------------------------------------------------------------------------- */

export async function tickRealtimeSession(
  service: SupabaseClient,
  deps: RealtimeDeps,
  input: { userId: string; body: z.infer<typeof tickBodySchema> },
): Promise<Outcome<RealtimeTickResponse>> {
  const { userId, body } = input;
  return withLock<Outcome<RealtimeTickResponse>>(
    deps,
    body.sessionId,
    async () => {
      const read = await deps.store.get(body.sessionId);
      if (!read.ok) return refusal(503, "busy");
      const state = read.value;
      if (!state || state.userId !== userId) return refusal(404, "session_gone");
      if (state.status === "ended") {
        return refusal(409, state.endReason === "quota" ? "quota" : state.endReason === "trial_over" ? "trial_over" : "session_gone");
      }
      state.usage = laterUsage(state.usage, sanitizeUsage(body.usage));
      if (state.access === "trial") {
        await deps.store.put(state);
        return refusal(409, "trial_over");
      }
      const now = deps.now();
      const decision = tickDecision({ startedAt: state.startedAt, paidMinutes: state.minutes.length, requested: body.minute, now });
      if (decision.kind === "already") {
        await deps.store.put(state);
        return { status: 200, body: { ok: true, minute: decision.minute, paidSeconds: decision.minute * REALTIME_MINUTE_SECONDS } };
      }
      if (decision.kind === "early") return refusal(409, "busy");
      if (decision.kind === "invalid") return refusal(400, "failed");
      if (decision.kind === "max_duration") {
        await finalize(service, deps, state, { reason: "max_duration", at: now });
        await deps.store.put(state);
        return refusal(409, "max_duration");
      }
      const reserved = await deps.reserve(service, userId, minuteReservationKey(state.id, decision.minute));
      if (!reserved.ok) {
        if (reserved.reason === "insufficient_credits") {
          await finalize(service, deps, state, { reason: "quota", at: now });
          await deps.store.put(state);
          return refusal(402, "quota");
        }
        // Geçici hata: istemci yeniden ister; gelmezse bekçi kapatır.
        await deps.store.put(state);
        return refusal(503, "busy");
      }
      state.minutes.push({ minute: decision.minute, reservationId: reserved.reservationId, settle: "pending" });
      // Tam geçen dakikalar burada kesinleşir (bekleyen satır uzun durmasın).
      const due = elapsedPending({ startedAt: state.startedAt, minutes: state.minutes.slice(0, -1), now });
      await settleMinutes(service, deps, state, { commit: due, refund: [] });
      await deps.store.put(state);
      scheduleWatchdog(service, deps, state);
      return {
        status: 200,
        body: { ok: true, minute: decision.minute, paidSeconds: decision.minute * REALTIME_MINUTE_SECONDS },
      };
    },
    () => refusal(503, "busy"),
  );
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Bitiş                                                                                                              */
/* ---------------------------------------------------------------------------------------------------------------- */

const UNCONNECTED_TTL_SECONDS = 86_400;

export async function endRealtimeSession(
  service: SupabaseClient,
  deps: RealtimeDeps,
  input: { userId: string; body: z.infer<typeof endBodySchema> },
): Promise<Outcome<RealtimeEndResponse>> {
  const { userId, body } = input;
  return withLock<Outcome<RealtimeEndResponse>>(
    deps,
    body.sessionId,
    async () => {
      const read = await deps.store.get(body.sessionId);
      if (!read.ok) return refusal(503, "busy");
      const state = read.value;
      if (!state || state.userId !== userId) return refusal(404, "session_gone");
      const now = deps.now();
      state.usage = laterUsage(state.usage, sanitizeUsage(body.usage));

      if (state.status === "active") {
        let refundAll = false;
        if (
          unconnectedRefundEligible({
            connected: body.connected,
            startedAt: state.startedAt,
            endedAt: now,
            paidMinutes: state.minutes.length,
          })
        ) {
          const count = await deps.store.incrementDaily(`rt:nc:${userId}:${istanbulDay(new Date(now))}`, UNCONNECTED_TTL_SECONDS);
          refundAll = count !== null && count <= REALTIME_UNCONNECTED_REFUNDS_PER_DAY;
        }
        await finalize(service, deps, state, { reason: body.reason, at: now, refundAll, hangupAfterResponse: true });
      }

      let messages: SavedTurn[] = [];
      if (!state.saved) {
        messages = composeSavedTurns(body.turns, body.cards);
        if (messages.length) {
          const saved = await deps.saveConversation(service, {
            userId,
            conversationId: state.conversationId,
            prepId: state.prepId,
            messages,
            now,
          });
          if (saved) {
            state.saved = true;
            state.savedConversationId = saved;
          }
        }
      }
      if (!state.usageRecorded && state.usage) {
        await deps.recordUsage(service, { userId, usage: state.usage });
        state.usageRecorded = true;
      }
      await deps.store.put(state);
      const chargedMinutes = state.minutes.filter((entry) => entry.settle === "committed").length;
      console.info("realtime_session_ended", {
        sessionId: state.id,
        reason: state.endReason,
        access: state.access,
        chargedMinutes,
        saved: state.saved,
      });
      return {
        status: 200,
        body: {
          ok: true,
          conversationId: state.savedConversationId ?? state.conversationId,
          seconds: billedSeconds(state.startedAt, state.access, state.minutes.length, state.endedAt ?? now),
          chargedMinutes,
          saved: state.saved,
        },
      };
    },
    () => refusal(503, "busy"),
  );
}

/** Gövdeden kullanım (testler ve fikstür için dışa açık). */
export function usageFromBody(raw: unknown): RealtimeUsageSnapshot | null {
  return sanitizeUsage(raw);
}
