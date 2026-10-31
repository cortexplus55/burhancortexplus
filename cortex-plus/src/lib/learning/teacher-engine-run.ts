import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { openaiClient } from "@/lib/ai/openai-client";
import { env, type ActionCode } from "@/lib/env";
import { contentModel } from "@/lib/ai/model-router";
import { withGenerationSlot } from "@/lib/ai/generation-slots";
import { fastAllowedFor } from "@/lib/learning/fast-access";
import { studentPedagogyBlock, withStudentProfile, type PedagogySurface } from "@/lib/learning/student-pedagogy";
import { commitCredits, recordUsage, refundCredits, refusalCode, reserveCredits } from "@/lib/credits/service";
import type { FreeMeter } from "@/lib/billing/free-meters";
import { parseModelJson } from "@/lib/learning/teaching-standards";
import { billedModel, fastTier } from "@/lib/learning/teacher-tier";

export type AskJson = (system: string, user: string) => Promise<unknown | null>;

/** Kabuğu paylaşan motorun profil yüzeyi, günlük adından ("teacher_cards", "studio_oral", "teacher_exam_open"). */
function pedagogySurface(label: string): PedagogySurface {
  if (label.endsWith("cards")) return "cards";
  if (label.endsWith("true_false")) return "true_false";
  if (label.endsWith("oral") || label.endsWith("exam_open")) return "oral";
  return "lesson";
}

/** İlk geçiş düşerse ikinci geçiş ancak bu süreden önce başlar (rota tavanı 300 sn). */
const RETRY_DEADLINE_MS = 90_000;

export type TeacherRunOutcome<R> =
  | { ok: true; result: R; calls: number; ms: number }
  | { ok: false; status: number; error: string; reasons: string[] };

/**
 * Öğretmen motorlarının ortak kabuğu: kredi bir kez ayrılır, her model
 * çağrısı kullanım olarak kaydedilir; iş sonucu kabul edilirse kredi
 * kesinleşir, edilmezse ya da hata olursa iade edilir.
 */
async function runWithTeacherModelInner<R>(
  service: SupabaseClient,
  options: {
    userId: string;
    actionCode: ActionCode;
    idempotencyKey: string;
    /** Ücretsiz hesabın sayacı (`reserveCredits`); verilmezse işin varsayılanı. */
    freeMeter?: FreeMeter | null;
    /**
     * Krediyi çağıran ayırdı (yazılı deneme: bir ücret, birçok konu). Verilirse burada
     * ayırma, kesinleştirme ve iade yok; kullanım bu ayrılışa yazılır.
     */
    heldReservationId?: string;
    /**
     * false: önceden yazım (18 Ekim 2026). Kredi ayrılmaz; öğrenci açınca düşer. Kullanım
     * CONTENT_PREFETCH koduyla yazılır (açılmazsa model maliyeti bizde).
     */
    charge?: boolean;
    startedAt?: number;
    /** Günlük satırının adı ("teacher_cards"). */
    label: string;
    topic: string;
    work: (ask: AskJson, started: number) => Promise<{ ok: true; result: R; log?: Record<string, unknown> } | { ok: false; reasons: string[]; log?: Record<string, unknown> }>;
  },
): Promise<TeacherRunOutcome<R>> {
  if (!env.OPENAI_API_KEY) return { ok: false, status: 503, error: "generation_failed", reasons: ["no_api_key"] };
  const held = options.heldReservationId;
  const free = options.charge === false;
  const reservation = held
    ? ({ ok: true, reservationId: held } as const)
    : free
      ? ({ ok: true, reservationId: null } as const)
      : await reserveCredits(service, options.userId, options.actionCode, options.idempotencyKey, 1, { freeMeter: options.freeMeter });
  if (!reservation.ok) {
    return {
      ok: false,
      status: reservation.reason === "insufficient_credits" ? 402 : 409,
      error: refusalCode(reservation),
      reasons: [],
    };
  }
  const refund = () =>
    held || !reservation.reservationId ? Promise.resolve() : refundCredits(service, reservation.reservationId).catch(() => undefined);
  const started = options.startedAt ?? Date.now();
  const model = contentModel();
  const openai = openaiClient({ apiKey: env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 1 });
  let calls = 0;
  // Öğrenci bekliyor: hızlı işlem. Önceden yazım ve tek ücretli çok parçalı iş (yazılı deneme) normal.
  // Hızlı işlem yalnız Plus/Sigma ve kurucuya (19 Ekim 2026, `fast-access.ts`).
  const profileLoad = studentPedagogyBlock(service, options.userId, pedagogySurface(options.label));
  const tier = fastTier(!free && !held && (await fastAllowedFor(service, options.userId)));
  const profile = await profileLoad;
  const ask: AskJson = async (system, user) => {
    calls += 1;
    const response = await openai.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      ...tier,
      messages: [
        { role: "system", content: withStudentProfile(system, profile) },
        { role: "user", content: user },
      ],
    });
    await recordUsage(service, {
      userId: options.userId,
      actionCode: free ? "CONTENT_PREFETCH" : options.actionCode,
      model: billedModel(model, response.service_tier),
      tokensIn: response.usage?.prompt_tokens ?? 0,
      tokensOut: response.usage?.completion_tokens ?? 0,
      reservationId: reservation.reservationId,
    }).catch(() => undefined);
    return parseModelJson(response.choices[0]?.message?.content ?? "");
  };

  try {
    let outcome = await options.work(ask, started).catch((error: unknown) => ({
      ok: false as const,
      reasons: ["model_error"],
      log: { cause: error instanceof Error ? error.message.slice(0, 160) : "unknown" },
    }));
    // 19 Ekim 2026 (ürün sahibi: "oluşturulamadı olmasın"): ilk geçiş düşerse — model hatası ya da
    // denetimden geçen öğe kalmaması — öğrenciye söylemeden önce iş bir kez baştan koşar.
    if (!outcome.ok && Date.now() - started < RETRY_DEADLINE_MS) {
      console.warn(`${options.label}_retry`, {
        topic: options.topic.slice(0, 80),
        calls,
        reasons: outcome.reasons.slice(0, 3).map((reason) => reason.slice(0, 120)),
      });
      outcome = await options.work(ask, started);
    }
    console.info(options.label, { topic: options.topic.slice(0, 80), ok: outcome.ok, calls, ms: Date.now() - started, ...outcome.log });
    if (!outcome.ok) {
      await refund();
      return { ok: false, status: 503, error: "generation_failed", reasons: outcome.reasons.slice(0, 6) };
    }
    if (!held && reservation.reservationId) await commitCredits(service, reservation.reservationId);
    return { ok: true, result: outcome.result, calls, ms: Date.now() - started };
  } catch (error) {
    await refund();
    console.error(`${options.label}_failed`, {
      topic: options.topic.slice(0, 80),
      calls,
      cause: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return { ok: false, status: 503, error: "generation_failed", reasons: ["model_error"] };
  }
}

/** Üretim yuvasıyla (19 Ekim 2026, Faz 3.2); bkz. `withGenerationSlot`. */
export async function runWithTeacherModel<R>(
  service: SupabaseClient,
  options: Parameters<typeof runWithTeacherModelInner<R>>[1],
): Promise<TeacherRunOutcome<R>> {
  return withGenerationSlot(
    options.charge === false ? "prefetch" : "student",
    () => runWithTeacherModelInner<R>(service, options),
    () => ({ ok: false, status: 503, error: "generation_busy", reasons: [] }),
  );
}
