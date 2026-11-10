import { isReasoningModel } from "@/lib/ai/model-params";
import type OpenAI from "openai";
import { parseModelJson } from "@/lib/learning/teaching-standards";
import {
  tutorVerifySystem,
  hasTemplateLabels,
  parseTutorIssues,
  tutorRetryNote,
  tutorSystemPrompt,
  tutorVerifyPassages,
  tutorVerifyUserPrompt,
  type TutorContext,
} from "@/lib/ai/teacher-tutor";
import { answerFirstLine, stuckPointIssue } from "@/lib/learning/tutor-answer";
import { simplifyLine } from "@/lib/ai/simplify-request";
import type { TutorStyle } from "@/lib/learning/tutor-style";

export type TutorRunOutcome =
  | { ok: true; content: string; attempts: number }
  | { ok: false; reasons: string[] };

const MAX_ATTEMPTS = 2;

/**
 * Öğretmen sohbeti: serbest metin taslak → belgeye karşı model denetimi →
 * sorun varsa notla bir kez yeniden yazım. Kod cevaba bir şey eklemez; iki
 * deneme de geçmezse çağıran dürüst bir geri dönüş verir ve kredi almaz.
 *
 * `verify: false` (24 Ekim 2026): cevap belgeye dayanmıyorsa (genel sohbet ya da soru belgede yok)
 * denetim çağrısı yapılmaz; yalnız boş cevap bir kez yeniden istenir.
 */
export async function runTeacherTutor(input: {
  client: OpenAI;
  model: string;
  signal?: AbortSignal;
  context: TutorContext;
  history: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  message: string;
  onUsage: (tokensIn: number, tokensOut: number) => Promise<void>;
  /** Varsayılan true; sesli ders yolu değişmeden denetlenir. */
  verify?: boolean;
  /** Öğrencinin anlatım tarzı; doğrudan cevap yüklemi okur. */
  style?: TutorStyle | null;
  /** Yalnız bu tur için geçerli istem satırları (`chatTurnLines`); sistem isteminin sonuna eklenir. */
  turnLines?: string[];
  /** Düşünme düzeyi (t260u); yalnız akıl yürüten modelde gönderilir. */
  reasoningEffort?: "low" | "medium";
  /**
   * Canlı akış (3 Kasım 2026): ilk denemenin token'ları geldiği anda verilir. Denetim arkada
   * koşar; reddedilirse çağıran kuyrukta düzeltilmiş metni ya da geri dönüşü gönderir.
   */
  onDelta?: (text: string) => void;
}): Promise<TutorRunOutcome> {
  const effort = input.reasoningEffort && isReasoningModel(input.model) ? { reasoning_effort: input.reasoningEffort } : {};
  // Sadeleştirme isteği (6 Kasım 2026) en sonda: tarz ve öğretmen tavrı satırlarından sonra okunur, bu cevapta önce gelir.
  const simplify = simplifyLine(input.message);
  // Tura özel satırlar (10 Kasım 2026: adım kilidi, aktif soru, duygu açılışı) en sonda: bu cevapta son söz onlarındır.
  const turn = (input.turnLines ?? []).filter(Boolean);
  const system = `${tutorSystemPrompt(input.context)}\n\n${answerFirstLine(input.message, input.style)}${simplify ? `\n\n${simplify}` : ""}${turn.length ? `\n\n${turn.join("\n\n")}` : ""}`;
  let reasons: string[] = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const note = reasons.length ? `\n\n${tutorRetryNote(reasons)}` : "";
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: `${system}${note}` },
      ...input.history,
      { role: "user", content: input.message },
    ];
    let answer: string;
    if (input.onDelta && attempt === 0) {
      answer = (await streamDraft(input, messages, effort)).trim();
    } else {
      const response = await input.client.chat.completions.create(
        { model: input.model, ...effort, messages },
        { signal: input.signal, timeout: 90_000, maxRetries: 0 },
      );
      await input.onUsage(response.usage?.prompt_tokens ?? 0, response.usage?.completion_tokens ?? 0);
      answer = (response.choices[0]?.message?.content ?? "").trim();
    }
    if (!answer) {
      reasons = ["Cevap boş kaldı."];
      continue;
    }
    const stuck = stuckPointIssue(input.message, answer);
    if (input.verify === false) {
      if (stuck && attempt < MAX_ATTEMPTS - 1) {
        reasons = [stuck];
        continue;
      }
      return { ok: true, content: answer, attempts: attempt + 1 };
    }

    let issues: string[];
    try {
      const review = await input.client.chat.completions.create(
        {
          model: input.model,
          ...effort,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: tutorVerifySystem(input.context.mode) },
            {
              role: "user",
              content: tutorVerifyUserPrompt({ passages: tutorVerifyPassages(input.context), question: input.message, answer }),
            },
          ],
        },
        { signal: input.signal, timeout: 60_000, maxRetries: 0 },
      );
      await input.onUsage(review.usage?.prompt_tokens ?? 0, review.usage?.completion_tokens ?? 0);
      issues = parseTutorIssues(parseModelJson(review.choices[0]?.message?.content ?? ""));
    } catch (error) {
      if (input.signal?.aborted) throw error;
      // Denetlenemeyen cevap öğrenciye gitmez.
      return { ok: false, reasons: ["verify_unavailable"] };
    }
    if (hasTemplateLabels(answer)) issues.push("Etiketli kalıp ('Nerede takıldığın:', 'Kontrol sorusu:' gibi) kullanılmış; doğal konuş.");
    if (stuck) issues.push(stuck);
    if (!issues.length) return { ok: true, content: answer, attempts: attempt + 1 };
    reasons = issues;
  }
  return { ok: false, reasons };
}

async function streamDraft(
  input: {
    client: OpenAI;
    model: string;
    signal?: AbortSignal;
    onUsage: (tokensIn: number, tokensOut: number) => Promise<void>;
    onDelta?: (text: string) => void;
  },
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  effort: Record<string, unknown>,
): Promise<string> {
  const stream = await input.client.chat.completions.create(
    // prompt_cache_key: aynı sabit öneki paylaşan istekler aynı önbellek kovasına düşer (ilk token hızlanır).
    { model: input.model, ...effort, messages, stream: true, stream_options: { include_usage: true }, prompt_cache_key: "cortex-tutor-chat" },
    { signal: input.signal, timeout: 90_000, maxRetries: 0 },
  );
  let text = "";
  let usageIn = 0;
  let usageOut = 0;
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (delta) {
      // Baştaki boşluk ekrana yazılmaz (cevap trim'li saklanır).
      const piece = text ? delta : delta.replace(/^\s+/, "");
      text += delta;
      if (piece) input.onDelta?.(piece);
    }
    if (chunk.usage) {
      usageIn = chunk.usage.prompt_tokens ?? 0;
      usageOut = chunk.usage.completion_tokens ?? 0;
    }
  }
  await input.onUsage(usageIn, usageOut);
  return text;
}
