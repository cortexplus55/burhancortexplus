import type OpenAI from "openai";
import { parseModelJson } from "@/lib/learning/teaching-standards";
import {
  tutorVerifySystem,
  hasTemplateLabels,
  parseTutorIssues,
  tutorRetryNote,
  tutorSystemPrompt,
  tutorVerifyUserPrompt,
  type TutorContext,
} from "@/lib/ai/teacher-tutor";

export type TutorRunOutcome =
  | { ok: true; content: string; attempts: number }
  | { ok: false; reasons: string[] };

const MAX_ATTEMPTS = 2;

/**
 * Öğretmen sohbeti: serbest metin taslak → belgeye karşı model denetimi →
 * sorun varsa notla bir kez yeniden yazım. Kod cevaba bir şey eklemez; iki
 * deneme de geçmezse çağıran dürüst bir geri dönüş verir ve kredi almaz.
 */
export async function runTeacherTutor(input: {
  client: OpenAI;
  model: string;
  signal?: AbortSignal;
  context: TutorContext;
  history: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  message: string;
  onUsage: (tokensIn: number, tokensOut: number) => Promise<void>;
}): Promise<TutorRunOutcome> {
  const system = tutorSystemPrompt(input.context);
  let reasons: string[] = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const note = reasons.length ? `\n\n${tutorRetryNote(reasons)}` : "";
    const response = await input.client.chat.completions.create(
      {
        model: input.model,
        messages: [
          { role: "system", content: `${system}${note}` },
          ...input.history,
          { role: "user", content: input.message },
        ],
      },
      { signal: input.signal, timeout: 90_000, maxRetries: 0 },
    );
    await input.onUsage(response.usage?.prompt_tokens ?? 0, response.usage?.completion_tokens ?? 0);
    const answer = (response.choices[0]?.message?.content ?? "").trim();
    if (!answer) {
      reasons = ["Cevap boş kaldı."];
      continue;
    }

    let issues: string[];
    try {
      const review = await input.client.chat.completions.create(
        {
          model: input.model,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: tutorVerifySystem(input.context.mode) },
            {
              role: "user",
              content: tutorVerifyUserPrompt({ passages: input.context.passages, question: input.message, answer }),
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
    if (!issues.length) return { ok: true, content: answer, attempts: attempt + 1 };
    reasons = issues;
  }
  return { ok: false, reasons };
}
