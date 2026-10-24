import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import { env, type ActionCode } from "@/lib/env";
import { contentModel } from "@/lib/ai/model-router";
import { withGenerationSlot } from "@/lib/ai/generation-slots";
import { isPremiumUser } from "@/lib/billing/entitlements";
import { commitCredits, recordUsage, refundCredits, refusalCode, reserveCredits, type ReservationResult } from "@/lib/credits/service";
import { FREE_CHAT_PER_DAY, FREE_PHOTO_PER_DAY } from "@/lib/billing/free-meters";
import { fastAllowedFor } from "@/lib/learning/fast-access";
import { billedModel, fastTier } from "@/lib/learning/teacher-tier";
import { parseModelJson } from "@/lib/learning/teaching-standards";
import {
  QUICK_SYSTEM,
  RECONCILE_SYSTEM,
  SOLVER_SYSTEM,
  answersAgree,
  parseQuick,
  parseSolution,
  reconcileUserText,
  solutionIssues,
  solverUserText,
  type QuickAnswer,
  type Solution,
} from "@/lib/solve/question-solver";

/*
  Soru çözücünün sunucu akışı (23 Ekim 2026). Sıra:
  1. Ücret: fotoğrafta Plus/Sigma `IMAGE_SOLUTION`; ücretsiz öğrenci günde 1 fotoğraf ve günde 3 mesaj (24 Ekim 2026,
     ürün sahibinin kararı), kredi ayırmasının sayacıyla. Yazılı soru sohbet mesajı fiyatında (`AI_CHAT_STANDARD`).
  2. İki bağımsız luna çağrısı aynı anda: tam çözüm + yalnız cevap. Ölçüm (10 ders, 10 soru): 10/10 doğru, 7-9 sn.
  3. Cevaplar tutar ve kod hesabı doğrularsa çözüm gider; tutmazsa luna (orta düşünme) iki çözümü karşılaştırır.
  4. Çözüm gittikten sonra denetçi (gpt-4.1, ürün sahibinin kararı: denetçi kalır) bakar; yanlış derse luna yeniden
     çözer ve "düzeltildi" olarak güncellenir. İlk çözüm 15 sn içinde, denetim arkadan.
  Okunamayan fotoğraf ücret almaz (eski yolda 10 kredi düşüyordu).
*/

export type SolveStatus = "checked" | "uncertain";
export type SolveEvent =
  | { type: "stage"; stage: "solving" | "checking" | "verifying" }
  /** agreed: iki bağımsız çözüm aynı cevabı verdi (false: uzlaştırıldı; ekran "aynı sonucu verdi" demez). */
  | { type: "solution"; solution: Solution; status: SolveStatus; ms: number; agreed?: boolean }
  /** Denetim bitti. `confirmed`: denetçi açıkça onayladı; yoksa (çağrı düştü, ya da itiraz edip düzeltme aynı
      cevabı verdi) ekran "denetim aynı sonucu verdi" demez. */
  | { type: "verified"; ms: number; confirmed: boolean }
  | { type: "revised"; solution: Solution; note: string; ms: number }
  | { type: "error"; code: string; message: string; status: number }
  | { type: "done"; ms: number }
  /** Sohbetten çözüldüyse: çözüm bu sohbete yazıldı (route, `solve-chat-save.ts`). */
  | { type: "saved"; conversationId: string; messageId: string }
  /** Hazırlıktan açıldıysa: tekrar listesine eklenebilecek sorunun imzalı belirteci (`solve-review.ts`). */
  | { type: "reviewable"; token: string };

export type SolveInput = {
  service: SupabaseClient;
  userId: string;
  /** data:image/...;base64 — yoksa yazılı soru. */
  imageDataUrl?: string;
  text?: string;
  idempotencyKey: string;
};

const VERIFY_SYSTEM =
  "Bu bir denetim isteğidir. Bir öğretmenin sınav sorusuna yazdığı çözüm veriliyor; görev soruyu baştan " +
  "anlatmak değil, cevabın doğru olup olmadığına karar vermektir. Soruyu (görseldeki ya da metindeki) kendin dikkatle " +
  "çöz ve verilen cevapla karşılaştır. Okunuş kâğıttakiyle aynı mı, işlemler doğru mu, şıklı soruda doğru şık mı? " +
  "Görselde birden çok soru varsa yalnız çözümde yazılı olan soruya bak; öbür soruları çözme. " +
  'Yalnız JSON: {"approved":true|false,"issue":"yanlışsa bir cümle: neyin yanlış olduğu ve doğrusu"}';

const VERIFY_DEADLINE_MS = 40_000;
const UNREADABLE_MESSAGE = "Fotoğrafın bir kısmı okunmuyor. Soruyu kadraja tam alıp, ışıkta ve düz tutarak yeniden çek.";

function userContent(input: SolveInput, text: string): ChatCompletionContentPart[] | string {
  if (!input.imageDataUrl) return `${text}\n\nSORU:\n${input.text ?? ""}`;
  return [
    { type: "text", text: input.text ? `${text}\nÖğrencinin notu: ${input.text.slice(0, 1500)}` : text },
    { type: "image_url", image_url: { url: input.imageDataUrl, detail: "high" } },
  ];
}

function solveRefusalMessage(result: Extract<ReservationResult, { ok: false }>): string {
  const refusal = result.refusal;
  if (refusal?.kind === "free_limit" && refusal.meter === "photo") {
    return `Ücretsiz hesapta günde ${FREE_PHOTO_PER_DAY} fotoğraftan çözüm var; bugünkü hakkın bitti. Gece yarısı yenilenir; dilersen Plus'a geçip beklemeden devam edebilirsin.`;
  }
  if (refusal?.kind === "free_limit" && refusal.meter === "chat") {
    return `Bugünkü ${FREE_CHAT_PER_DAY} ücretsiz mesaj hakkın bitti; yazılı soru da mesaj sayılır. Gece yarısı yenilenir; dilersen Plus'a geçip beklemeden devam edebilirsin.`;
  }
  return result.reason === "insufficient_credits" ? "Bu soru için hakkın yetmiyor." : "Bu soru şu an çözülüyor; birkaç saniye sonra yeniden dene.";
}

/** Bir çözümü uçtan uca yürütür; olayları `emit` ile sırayla verir. */
export async function runSolve(input: SolveInput, emit: (event: SolveEvent) => void): Promise<void> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  const { service, userId } = input;
  const image = Boolean(input.imageDataUrl);

  const premium = await isPremiumUser(service, userId);
  const actionCode: ActionCode = image ? "IMAGE_SOLUTION" : "AI_CHAT_STANDARD";
  // 24 Ekim 2026: ücretsiz hesapta günde 1 fotoğraf ve günde 3 mesaj, kredi ayırmasının sayacıyla
  // (credit_reserve_metered). Okunmayan fotoğraf iade edilir, hak geri döner. Kurucu ve abone sayaçsız.
  const reservation = await reserveCredits(service, userId, actionCode, input.idempotencyKey);
  if (!reservation.ok) {
    emit({
      type: "error",
      code: refusalCode(reservation),
      message: solveRefusalMessage(reservation),
      status: reservation.reason === "insufficient_credits" ? 402 : 409,
    });
    return;
  }
  const reservationId = reservation.reservationId;
  let settled = false;
  const settle = async (commit: boolean) => {
    if (settled || !reservationId) return;
    settled = true;
    await (commit ? commitCredits(service, reservationId) : refundCredits(service, reservationId)).catch(() => undefined);
  };

  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 45_000, maxRetries: 1 });
  const tier = fastTier(premium && (await fastAllowedFor(service, userId)));
  const ask = async (
    system: string,
    text: string,
    options: { effort?: "low" | "medium"; model?: string } = {},
  ): Promise<unknown> => {
    const model = options.model ?? contentModel();
    const luna = model === contentModel();
    const response = await openai.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      ...(luna ? tier : {}),
      ...(luna && options.effort ? { reasoning_effort: options.effort } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent(input, text) },
      ],
    });
    void recordUsage(service, {
      userId,
      actionCode,
      model: billedModel(model, response.service_tier),
      tokensIn: response.usage?.prompt_tokens ?? 0,
      tokensOut: response.usage?.completion_tokens ?? 0,
      reservationId,
    }).catch(() => undefined);
    return parseModelJson(response.choices[0]?.message?.content ?? "");
  };

  try {
    await withGenerationSlot(
      "student",
      async () => {
        emit({ type: "stage", stage: "solving" });
        const [rawSolution, rawQuick] = await Promise.all([
          ask(SOLVER_SYSTEM, solverUserText(), { effort: "low" }),
          ask(QUICK_SYSTEM, solverUserText(), { effort: "low" }).catch(() => null),
        ]);
        let solution = parseSolution(rawSolution);
        if (!solution) solution = parseSolution(await ask(SOLVER_SYSTEM, solverUserText(), { effort: "low" }));
        if (!solution) {
          await settle(false);
          emit({ type: "error", code: "generation_failed", message: "Çözüm bu sefer tamamlanamadı; hakkın düşmedi. Yeniden dene.", status: 502 });
          return;
        }
        if (!solution.readable) {
          await settle(false);
          emit({ type: "error", code: "unreadable", message: UNREADABLE_MESSAGE, status: 422 });
          return;
        }
        const quick: QuickAnswer = parseQuick(rawQuick);
        let issues = solutionIssues(solution);
        let status: SolveStatus = "checked";
        const agreed = answersAgree(solution, quick) && !issues.length;
        if (!agreed) {
          emit({ type: "stage", stage: "checking" });
          const reconciled = await ask(RECONCILE_SYSTEM, reconcileUserText(solution, quick, issues), { effort: "medium" }).catch(
            () => null,
          );
          const next = parseSolution(reconciled);
          const sure = (reconciled as { sure?: unknown } | null)?.sure !== false;
          if (next?.readable) {
            solution = next;
            issues = solutionIssues(next);
          }
          status = next && sure && !issues.length ? "checked" : "uncertain";
        }
        emit({ type: "solution", solution, status, ms: elapsed(), agreed });
        await settle(true);

        if (elapsed() > VERIFY_DEADLINE_MS) return;
        emit({ type: "stage", stage: "verifying" });
        const verdict = (await ask(VERIFY_SYSTEM, `ÇÖZÜM (JSON):\n${JSON.stringify(solution)}`, {
          model: env.OPENAI_ADVANCED_MODEL,
        }).catch(() => null)) as { approved?: unknown; issue?: unknown } | null;
        if (!verdict || verdict.approved !== false) {
          emit({ type: "verified", ms: elapsed(), confirmed: verdict?.approved === true });
          return;
        }
        const issue = typeof verdict.issue === "string" ? verdict.issue.slice(0, 400) : "";
        const fixed = parseSolution(
          await ask(RECONCILE_SYSTEM, reconcileUserText(solution, quick, issue ? [`Denetçi: ${issue}`] : []), {
            effort: "medium",
          }).catch(() => null),
        );
        if (fixed?.readable && !solutionIssues(fixed).length && !sameAnswer(fixed, solution)) {
          emit({ type: "revised", solution: fixed, note: issue, ms: elapsed() });
        } else {
          emit({ type: "verified", ms: elapsed(), confirmed: false });
        }
      },
      () => {
        emit({ type: "error", code: "generation_busy", message: "Şu an yoğunluk var; birkaç saniye sonra yeniden dene.", status: 503 });
      },
    );
  } catch (error) {
    console.warn("solve_failed", { cause: error instanceof Error ? error.message.slice(0, 160) : "unknown", image });
    await settle(false);
    emit({ type: "error", code: "generation_failed", message: "Çözüm bu sefer tamamlanamadı; hakkın düşmedi. Yeniden dene.", status: 502 });
  } finally {
    if (!settled && reservationId) await settle(false);
    emit({ type: "done", ms: elapsed() });
  }
}

function sameAnswer(a: Solution, b: Solution): boolean {
  if (a.kind === "mcq" || b.kind === "mcq") return a.answer.letter === b.answer.letter;
  return (a.answer.value ?? a.answer.text) === (b.answer.value ?? b.answer.text);
}
