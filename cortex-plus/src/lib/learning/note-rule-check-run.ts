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
  NOTE_RULE_JSON_WITH_CORRECTION,
  NOTE_RULE_SYSTEM,
  noteNeedsRuleCheck,
  noteRuleUserPrompt,
  readNoteRuleWarnings,
} from "@/lib/learning/note-rule-check";
import {
  SOURCE_CORRECTION_TASK,
  readModelSourceCorrection,
  type SourceCorrectionWarning,
} from "@/lib/learning/source-correction";

/** Ders yazımıyla paralel koşar; dersi hiçbir zaman bekletmez. */
const NOTE_RULE_TIMEOUT_MS = 15_000;

/** Kapatmak için `NOTE_RULE_CHECK=off`. */
export function noteRuleCheckEnabled(source: Record<string, string | undefined> = process.env): boolean {
  return !/^(off|0|false|kapali|kapalı)$/i.test(source.NOTE_RULE_CHECK?.trim() ?? "");
}

/** Kaynak düzeltme görevi (Faz 1-A §2.1) aynı çağrıda; kapatmak için `SOURCE_CORRECTION_CHECK=off`. */
export function sourceCorrectionCheckEnabled(source: Record<string, string | undefined> = process.env): boolean {
  return !/^(off|0|false|kapali|kapalı)$/i.test(source.SOURCE_CORRECTION_CHECK?.trim() ?? "");
}

/** Kaynak düzeltmesi aranacak kadar metin (kısa parçada model yorumu yanlış alarma açık). */
const SOURCE_CORRECTION_MIN_CHARS = 80;

export type NoteRuleCheck = { warnings: FormulaTypo[]; correction: SourceCorrectionWarning | null };

/**
 * Tek model çağrısı: notun yanlış yazılmış evrensel eşitlikleri (`items`) ve açık bilimsel hata (`correction`,
 * Faz 1-A §2.1). Eşitlik yoksa yalnız düzeltme görevi koşar; ikisi de kapalıysa çağrı yok.
 */
export async function checkNoteRulesAndCorrection(service: SupabaseClient, userId: string, text: string): Promise<NoteRuleCheck> {
  const formulas = noteRuleCheckEnabled() && noteNeedsRuleCheck(text);
  const correctionWanted = sourceCorrectionCheckEnabled() && text.trim().length >= SOURCE_CORRECTION_MIN_CHARS;
  if (!formulas && !correctionWanted) return { warnings: [], correction: null };
  try {
    const model = contentModel();
    const openai = openaiClient({ apiKey: env.OPENAI_API_KEY, timeout: NOTE_RULE_TIMEOUT_MS, maxRetries: 0 });
    const system = correctionWanted ? `${NOTE_RULE_SYSTEM}\n${SOURCE_CORRECTION_TASK}\n${NOTE_RULE_JSON_WITH_CORRECTION}` : NOTE_RULE_SYSTEM;
    const response = await openai.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      reasoning_effort: "low",
      messages: [
        { role: "system", content: system },
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
    const parsed = parseModelJson(response.choices[0]?.message?.content ?? "");
    const correction = correctionWanted ? readModelSourceCorrection(parsed, text) : null;
    console.info("note_rule_check", {
      formulas,
      correctionWanted,
      correction: Boolean(correction),
      corrections: correction ? 1 + (correction.others?.length ?? 0) : 0,
      tokensIn: response.usage?.prompt_tokens ?? 0,
      tokensOut: response.usage?.completion_tokens ?? 0,
    });
    return { warnings: formulas ? readNoteRuleWarnings(parsed, text) : [], correction };
  } catch (error) {
    console.warn("note_rule_check_failed", error instanceof Error ? error.message : String(error));
    return { warnings: [], correction: null };
  }
}

/** Yalnız formül uyarıları (eski çağıranlar için). */
export async function checkNoteRules(service: SupabaseClient, userId: string, text: string): Promise<FormulaTypo[]> {
  return (await checkNoteRulesAndCorrection(service, userId, text)).warnings;
}
