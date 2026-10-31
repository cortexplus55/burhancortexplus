import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { openaiClient } from "@/lib/ai/openai-client";
import { contentModel } from "@/lib/ai/model-router";
import { env } from "@/lib/env";
import { recordUsage } from "@/lib/credits/service";
import { parseModelJson } from "@/lib/learning/teaching-standards";
import { billedModel } from "@/lib/learning/teacher-tier";
import type { FormulaTypo } from "@/lib/learning/formula-typos";
import {
  NOTE_RULE_SYSTEM,
  noteNeedsRuleCheck,
  noteRuleUserPrompt,
  readNoteRuleWarnings,
} from "@/lib/learning/note-rule-check";

/** Ders yazımıyla paralel koşar; dersi hiçbir zaman bekletmez. */
const NOTE_RULE_TIMEOUT_MS = 15_000;

/** Kapatmak için `NOTE_RULE_CHECK=off`. */
export function noteRuleCheckEnabled(source: Record<string, string | undefined> = process.env): boolean {
  return !/^(off|0|false|kapali|kapalı)$/i.test(source.NOTE_RULE_CHECK?.trim() ?? "");
}

export async function checkNoteRules(service: SupabaseClient, userId: string, text: string): Promise<FormulaTypo[]> {
  if (!noteRuleCheckEnabled() || !noteNeedsRuleCheck(text)) return [];
  try {
    const model = contentModel();
    const openai = openaiClient({ apiKey: env.OPENAI_API_KEY, timeout: NOTE_RULE_TIMEOUT_MS, maxRetries: 0 });
    const response = await openai.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      reasoning_effort: "low",
      messages: [
        { role: "system", content: NOTE_RULE_SYSTEM },
        { role: "user", content: noteRuleUserPrompt(text) },
      ],
    });
    // Kredi düşmez: dersin içindeki uyarı; maliyet bizde.
    await recordUsage(service, {
      userId,
      actionCode: "CONTENT_PREFETCH",
      model: billedModel(model, response.service_tier),
      tokensIn: response.usage?.prompt_tokens ?? 0,
      tokensOut: response.usage?.completion_tokens ?? 0,
    }).catch(() => undefined);
    return readNoteRuleWarnings(parseModelJson(response.choices[0]?.message?.content ?? ""), text);
  } catch (error) {
    console.warn("note_rule_check_failed", error instanceof Error ? error.message : String(error));
    return [];
  }
}
