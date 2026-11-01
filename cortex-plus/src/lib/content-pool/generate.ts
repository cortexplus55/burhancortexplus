import "server-only";
import { env } from "@/lib/env";
import { openaiClient } from "@/lib/ai/openai-client";
import { samplingParams } from "@/lib/ai/model-params";
import { parseModelOutput } from "@/lib/ai/json-repair";
import type { UsageCode } from "@/lib/credits/service";
import { choiceCount, type PoolUnit } from "@/lib/content-pool/keys";
import {
  applyReview,
  checkShape,
  itemsSchema,
  lessonSchema,
  missingCoverage,
  reviewSchema,
  type LessonBody,
  type PoolItem,
} from "@/lib/content-pool/schema";

/** Tek model çağrısı (testte sahte). Kullanım kaydı çağıran tarafından yazılır. */
export type LlmCall = (input: {
  model: string;
  system: string;
  user: string;
}) => Promise<{ text: string; tokensIn: number; tokensOut: number; model: string }>;

export type UsageEntry = { actionCode: UsageCode; model: string; tokensIn: number; tokensOut: number };

export type GeneratedUnit =
  | { ok: true; lesson: LessonBody; items: PoolItem[]; qa: Record<string, unknown>; usage: UsageEntry[]; model: string }
  | { ok: false; reason: string; qa: Record<string, unknown>; usage: UsageEntry[] };

export function openaiLlm(): LlmCall | null {
  if (!env.OPENAI_API_KEY) return null;
  const client = openaiClient({ apiKey: env.OPENAI_API_KEY, timeout: 180_000, maxRetries: 1 });
  return async ({ model, system, user }) => {
    const completion = await client.chat.completions.create({
      model,
      ...samplingParams(model, { temperature: 0.3 }),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return {
      text: completion.choices[0]?.message?.content ?? "",
      tokensIn: completion.usage?.prompt_tokens ?? 0,
      tokensOut: completion.usage?.completion_tokens ?? 0,
      model: completion.model || model,
    };
  };
}

const ORIGINALITY =
  "Tüm metin ve sorular özgün olmalı (origin=cortex_original). Çıkmış sınav sorularını, yayınevi kitaplarını ya da MEB/ÖSYM " +
  "kitapçıklarını kopyalama, yeniden yazma ya da onlara atıf yapma. Kaynak bağlantısı yazma; bağlantılar sistemce eklenir. " +
  "Yalnız verilen kazanımların ve sınırlamalarının kapsamında kal; kapsam dışı bilgi ekleme. Dil: Türkçe.";

function officialBlock(unit: PoolUnit): string {
  const lines = unit.outcomes.map((o) => {
    const limits = o.limitations.length ? `\n   Sınırlamalar/açıklamalar: ${o.limitations.join(" | ")}` : "";
    return `- ${o.code}: ${o.text}${limits}`;
  });
  return `Program: ${unit.program.label} (${unit.program.badge})\nÜnite: ${unit.unit.title}\nResmî kazanımlar:\n${lines.join("\n")}`;
}

function lessonPrompt(unit: PoolUnit) {
  return {
    system: `Sen Türkiye müfredatına göre ders anlatımı yazan bir öğretmensin. ${ORIGINALITY} Yalnız JSON döndür.`,
    user:
      `${officialBlock(unit)}\n\nBu ünitenin TÜM kazanımlarını kapsayan anlatımı yaz. JSON şeması:\n` +
      `{"title": string, "overview": string, "sections": [{"outcome_code": string (yukarıdaki kodlardan biri, her kod için tam bir bölüm), ` +
      `"heading": string, "explanation": string (en az 3 paragraf), "key_points": string[]}], "summary": string, ` +
      `"cards": [{"front": string, "back": string}] (kazanım başına 2-4 kart)}`,
  };
}

function itemsPrompt(unit: PoolUnit, pairs: string[]) {
  const choices = choiceCount(unit.program);
  return {
    system: `Sen Türkiye müfredatına göre çoktan seçmeli soru yazan bir ölçme uzmanısın. ${ORIGINALITY} Yalnız JSON döndür.`,
    user:
      `${officialBlock(unit)}\n\nŞu (kazanım|zorluk) çiftlerinin her biri için tam 1 soru yaz: ${pairs.join(", ")}.\n` +
      `Zorluk: easy=kavram tanıma, medium=uygulama/yorum, hard=çok adımlı çıkarım. Her soruda tam ${choices} seçenek, ` +
      `tek doğru cevap; seçeneklerin başına harf koyma. JSON: {"items": [{"outcome_code": string, "difficulty": "easy"|"medium"|"hard", ` +
      `"stem": string, "choices": string[], "answer": number (0 tabanlı doğru seçenek), "explanation": string}]}`,
  };
}

function reviewPrompt(unit: PoolUnit, lesson: LessonBody, items: PoolItem[]) {
  const blind = items.map((item, index) => ({ index, outcome_code: item.outcome_code, stem: item.stem, choices: item.choices }));
  return {
    system:
      "Sen bağımsız bir içerik denetçisisin. Soruları cevap anahtarını görmeden kendin çöz. Kazanım ve sınırlamaların dışına " +
      "taşan, bilgi hatası olan, birden fazla doğru cevabı olan ya da Türkçe yazımı bozuk içeriği işaretle. Yalnız JSON döndür.",
    user:
      `${officialBlock(unit)}\n\nANLATIM:\n${JSON.stringify(lesson)}\n\nSORULAR (cevapsız):\n${JSON.stringify(blind)}\n\n` +
      `JSON: {"lesson_ok": boolean, "lesson_issues": string[], "items": [{"index": number, "solved_answer": number (0 tabanlı), ` +
      `"within_scope": boolean, "ok": boolean, "issue": string|null}]} — her soru için bir satır.`,
  };
}

function parse<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } }, text: string): T | null {
  try {
    const result = schema.safeParse(parseModelOutput(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Ünite içeriği üretimi + doğrulama. Üretim modeli anlatımı ve soruları yazar; ayrı (güçlü) model soruları
 * cevapsız çözer ve kapsamı denetler. Eksik kalan kazanım × zorluk çiftleri için bir tur daha üretilir.
 * Sonuç ok değilse havuza doğrulanmış olarak yazılmaz.
 */
export async function generateUnitContent(
  unit: PoolUnit,
  llm: LlmCall,
  models: { generate: string; verify: string } = { generate: env.OPENAI_CONTENT_MODEL, verify: env.OPENAI_ADVANCED_MODEL },
): Promise<GeneratedUnit> {
  const usage: UsageEntry[] = [];
  const call = async (actionCode: UsageCode, model: string, prompt: { system: string; user: string }) => {
    const out = await llm({ model, ...prompt });
    usage.push({ actionCode, model: out.model || model, tokensIn: out.tokensIn, tokensOut: out.tokensOut });
    return out.text;
  };
  const codes = unit.outcomes.map((o) => o.code);
  const choices = choiceCount(unit.program);

  const lesson = parse(lessonSchema, await call("SHARED_CONTENT_LESSON", models.generate, lessonPrompt(unit)));
  if (!lesson) return { ok: false, reason: "lesson_parse", qa: {}, usage };

  let items: PoolItem[] = [];
  const rejected: { code: string; reason: string }[] = [];
  let lessonReview: { ok: boolean; issues: string[] } = { ok: false, issues: [] };
  let shapeIssues: { code: string; detail: string }[] = [];
  for (let round = 0; round < 2; round += 1) {
    const pairs = missingCoverage(items, codes);
    if (pairs.length === 0) break;
    const fresh = parse(itemsSchema, await call("SHARED_CONTENT_ITEMS", models.generate, itemsPrompt(unit, pairs)));
    const shape = checkShape(lesson, fresh?.items ?? [], codes, choices);
    shapeIssues = shape.lessonIssues;
    rejected.push(...shape.itemIssues.map((i) => ({ code: i.code, reason: i.detail })));
    const wanted = new Set(pairs);
    const candidates = shape.validItems.filter((i) => wanted.has(`${i.outcome_code.trim()}|${i.difficulty}`));
    if (candidates.length === 0) continue;
    const review = parse(reviewSchema, await call("SHARED_CONTENT_VERIFY", models.verify, reviewPrompt(unit, lesson, candidates)));
    if (!review) continue;
    lessonReview = { ok: review.lesson_ok, issues: review.lesson_issues };
    const applied = applyReview(candidates, review);
    rejected.push(...applied.rejected.map((r) => ({ code: r.item.outcome_code, reason: r.reason })));
    const have = new Set(items.map((i) => `${i.outcome_code.trim()}|${i.difficulty}`));
    for (const item of applied.kept) {
      const key = `${item.outcome_code.trim()}|${item.difficulty}`;
      if (!have.has(key)) {
        have.add(key);
        items.push({ ...item, outcome_code: item.outcome_code.trim() });
      }
    }
  }
  items = items.sort((a, b) => codes.indexOf(a.outcome_code) - codes.indexOf(b.outcome_code));
  const missing = missingCoverage(items, codes);
  const qa = {
    checked_at: new Date().toISOString(),
    lesson_shape_issues: shapeIssues,
    lesson_review: lessonReview,
    rejected_items: rejected,
    missing_pairs: missing,
    verify_model: models.verify,
    similarity_check: "not_run",
  };
  if (shapeIssues.length) return { ok: false, reason: "lesson_coverage", qa, usage };
  if (!lessonReview.ok) return { ok: false, reason: "lesson_review", qa, usage };
  if (missing.length) return { ok: false, reason: "item_coverage", qa, usage };
  return { ok: true, lesson, items, qa, usage, model: models.generate };
}
