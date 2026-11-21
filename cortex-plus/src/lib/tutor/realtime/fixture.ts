import "server-only";
import { after, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildRealtimeInstructions } from "@/lib/tutor/realtime-instructions";
import { estimateRealtimeUsd } from "@/lib/tutor/realtime/usage";
import { createRealtimeCall } from "@/lib/tutor/realtime/openai-call";
import { defaultRealtimeDeps, type RealtimeDeps } from "@/lib/tutor/realtime/session";
import { memoryStore, type RealtimeStore } from "@/lib/tutor/realtime/store";
import type { RealtimeUsageSnapshot } from "@/lib/tutor/realtime/config";

/*
  Yalnız yerel deneme fikstürü (21 Kasım 2026): oturumlu öğrenci olmadan canlı bağlantıyı denemek için. Aynı oturum
  kodunu (`session.ts`) ve aynı talimat kurucusunu koşar; kimlik, kredi ve veritabanı kısmını atlar (sahte öğrenci,
  bellekte durum, kredi ayırma yok, sohbete yazım yok). ÜRETİMDE KAPALI: E2E_FIXTURE=1 ve NODE_ENV / VERCEL_ENV
  "production" değilken açılır; aksi hâlde uçlar 404 (bekçi test).
*/

export const FIXTURE_USER_ID = "00000000-0000-4000-8000-0000000000e2";

export function realtimeFixtureEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.E2E_FIXTURE === "1" && env.NODE_ENV !== "production" && env.VERCEL_ENV !== "production";
}

export function fixtureNotFound(): NextResponse {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

type FixtureLog = { at: string; sessionId: string | null; usd: number; usage: RealtimeUsageSnapshot | null; messages: number };

type FixtureGlobal = { store: RealtimeStore; log: FixtureLog[] };
const holder = globalThis as unknown as { __cxRealtimeFixture?: FixtureGlobal };

function shared(): FixtureGlobal {
  if (!holder.__cxRealtimeFixture) holder.__cxRealtimeFixture = { store: memoryStore(), log: [] };
  return holder.__cxRealtimeFixture;
}

export function fixtureLog(): FixtureLog[] {
  return shared().log;
}

/** Fikstür yolu: "paid", "trial" ya da ses karşılaştırması için "paid-cedar". */
export function parseFixtureAccess(param: string): { access: "paid" | "trial"; voice: string | null } | null {
  const [access, voice] = param.split("-");
  if (access !== "paid" && access !== "trial") return null;
  if (voice && !/^[a-z]{3,12}$/.test(voice)) return null;
  return { access, voice: voice ?? null };
}

export function fixtureDeps(access: "paid" | "trial", voiceOverride: string | null = null): RealtimeDeps {
  const state = shared();
  return defaultRealtimeDeps({
    store: state.store,
    schedule: (task) => after(task),
    access: async () => ({ kind: access }),
    claimTrial: async () => ({ ok: true, markerId: "fixture-trial" }),
    releaseTrial: async () => undefined,
    reserve: async () => ({ ok: true, reservationId: `fixture-${Date.now()}`, cost: 0 }),
    commit: async () => undefined,
    refund: async () => undefined,
    loadContext: async (_service: SupabaseClient, _userId: string, input) => ({
      instructions: buildRealtimeInstructions({
        name: null,
        calibration: "",
        context: "",
        prep: null,
        history: [],
        trial: input.trial,
      }),
      conversationId: null,
      prepId: null,
      sttTerms: [],
    }),
    // Ses karşılaştırması için yalnız fikstürde başka ses denenebilir (/api/e2e/realtime-session/paid-cedar).
    createCall: (input) => {
      const voice = voiceOverride;
      if (!voice) return createRealtimeCall(input);
      return createRealtimeCall({
        ...input,
        session: { ...input.session, audio: { ...input.session.audio, output: { ...input.session.audio.output, voice } } },
      });
    },
    saveConversation: async (_service, input) => {
      state.log.push({ at: new Date().toISOString(), sessionId: null, usd: 0, usage: null, messages: input.messages.length });
      return null;
    },
    recordUsage: async (_service, input) => {
      const usd = estimateRealtimeUsd(input.usage);
      state.log.push({ at: new Date().toISOString(), sessionId: null, usd, usage: input.usage, messages: 0 });
      console.info("realtime_fixture_usage", { usd, usage: input.usage });
    },
  });
}

/** Fikstürde veritabanı istemcisi kullanılmaz; sahte nesne bağımlılıklara iletilir. */
export const FIXTURE_SERVICE = {} as SupabaseClient;
