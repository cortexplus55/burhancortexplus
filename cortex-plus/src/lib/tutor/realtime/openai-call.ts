import "server-only";
import { createHash } from "node:crypto";
import { guardedFetch, isQuotaExhaustedText, openaiClient } from "@/lib/ai/openai-client";
import { BOARD_TOOL } from "@/lib/tutor/realtime/board-cards";
import { REALTIME_MODEL, REALTIME_TRANSCRIBE_MODEL, REALTIME_VOICE } from "@/lib/tutor/realtime/config";

/*
  OpenAI Realtime çağrısı, SDP sunucu üzerinden ("unified interface", 21 Kasım 2026). İstemci WebRTC teklifini bize
  gönderir; biz sunucu anahtarıyla POST /v1/realtime/calls (çok parçalı: `sdp` + `session` JSON) yaparız, cevap
  gövdesi SDP cevabıdır, `Location` başlığının son parçası çağrı kimliğidir (`rtc_…`). Böylece:
  - istemciye hiçbir anahtar gitmez (kısa ömürlü belirteç bile);
  - oturumun ayarları (model, ses, talimat, araç) yalnız sunucuda kurulur, istemci değiştiremez;
  - sunucu çağrıyı kimliğiyle kapatabilir (`realtime.calls.hangup`): hak bitince, deneme dolunca, bekçide.
  İstek `guardedFetch`'ten geçer: kota bitti (429 insufficient_quota) kurucuya aynı yoldan bildirilir. Yedek model
  bu uç için devreye girmez (yalnız metin uçları).
*/

export const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
/** Tek cevabın üst sınırı (ses + metin jetonu). ~25 sn konuşma ≈ 600 jeton; uzun açıklamada kesilmesin diye pay. */
export const REALTIME_MAX_OUTPUT_TOKENS = 1800;
const CREATE_TIMEOUT_MS = 15_000;

export type MicProfile = "near" | "far";

/** Oturum ayarı (`session` alanı). */
export function realtimeSessionConfig(input: { instructions: string; micProfile?: MicProfile }) {
  return {
    type: "realtime" as const,
    model: REALTIME_MODEL,
    instructions: input.instructions,
    output_modalities: ["audio"],
    max_output_tokens: REALTIME_MAX_OUTPUT_TOKENS,
    audio: {
      input: {
        // Telefon yüze yakın tutulur (yakın alan); dizüstünün mikrofonu uzak alandır.
        noise_reduction: { type: input.micProfile === "near" ? "near_field" : "far_field" },
        transcription: { model: REALTIME_TRANSCRIBE_MODEL, language: "tr" },
        // Anlamsal dönüş algılama: "ıı…" diye düşünen öğrencinin sözü kesilmez; sözünü keserse öğretmen susar.
        turn_detection: { type: "semantic_vad", eagerness: "auto", create_response: true, interrupt_response: true },
      },
      output: { voice: REALTIME_VOICE },
    },
    tools: [BOARD_TOOL],
    tool_choice: "auto",
  };
}

/** OpenAI'ye giden kimliği gizli öğrenci belirteci (OpenAI-Safety-Identifier): sabit, geri çevrilemez. */
export function safetyIdentifier(userId: string): string {
  return createHash("sha256").update(`cortex-plus:realtime:${userId}`).digest("hex").slice(0, 32);
}

/** `Location: /v1/realtime/calls/rtc_123` → `rtc_123`. */
export function callIdFromLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  const last = location.split("?")[0]!.split("/").filter(Boolean).pop() ?? "";
  return /^[A-Za-z0-9_-]{4,128}$/.test(last) ? last : null;
}

export type CreateCallResult =
  | { ok: true; answer: string; callId: string | null }
  | { ok: false; status: number; quotaExhausted: boolean; message: string };

export async function createRealtimeCall(input: {
  apiKey: string;
  sdp: string;
  session: ReturnType<typeof realtimeSessionConfig>;
  userId: string;
  fetchImpl?: typeof fetch;
}): Promise<CreateCallResult> {
  const form = new FormData();
  form.set("sdp", input.sdp);
  form.set("session", JSON.stringify(input.session));
  const call = guardedFetch(input.fetchImpl ?? globalThis.fetch);
  try {
    const response = await call(REALTIME_CALLS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "OpenAI-Safety-Identifier": safetyIdentifier(input.userId),
      },
      body: form,
      signal: AbortSignal.timeout(CREATE_TIMEOUT_MS),
    });
    const text = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        quotaExhausted: response.status === 429 && isQuotaExhaustedText(text),
        message: text.slice(0, 300),
      };
    }
    if (!text.trim().startsWith("v=")) return { ok: false, status: 502, quotaExhausted: false, message: "invalid_sdp_answer" };
    return { ok: true, answer: text, callId: callIdFromLocation(response.headers.get("location")) };
  } catch (error) {
    return { ok: false, status: 504, quotaExhausted: false, message: error instanceof Error ? error.name : "unknown" };
  }
}

/** Çağrıyı kapatır; zaten kapanmışsa (404) da başarı sayılır. Asla fırlatmaz. */
export async function hangupRealtimeCall(apiKey: string, callId: string | null): Promise<boolean> {
  if (!callId) return false;
  try {
    await openaiClient({ apiKey, timeout: 8_000, maxRetries: 1 }).realtime.calls.hangup(callId);
    return true;
  } catch (error) {
    const status = (error as { status?: unknown })?.status;
    if (status === 404 || status === 409 || status === 410) return true;
    console.warn("realtime_hangup_failed", { status: typeof status === "number" ? status : null });
    return false;
  }
}
