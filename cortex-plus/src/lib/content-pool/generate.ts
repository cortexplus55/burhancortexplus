import "server-only";
import { env } from "@/lib/env";
import { openaiClient } from "@/lib/ai/openai-client";
import { isReasoningModel, samplingParams } from "@/lib/ai/model-params";
import { parseModelOutput } from "@/lib/ai/json-repair";
import type { UsageCode } from "@/lib/credits/service";
import { choiceCount, type PoolUnit } from "@/lib/content-pool/keys";
import { garbledReason, gateItems } from "@/lib/content-pool/gate";
import {
  applyReview,
  checkShape,
  itemSchema,
  lessonSchema,
  missingCoverage,
  compactReviewSchema,
  type LessonBody,
  type PoolItem,
  type Review,
} from "@/lib/content-pool/schema";

/** Tek model çağrısı (testte sahte). Kullanım kaydı çağıran tarafından yazılır. */
export type LlmCall = (input: {
  model: string;
  system: string;
  user: string;
  reasoningEffort?: "low" | "medium";
}) => Promise<{ text: string; tokensIn: number; tokensOut: number; model: string }>;

export type UsageEntry = { actionCode: UsageCode; model: string; tokensIn: number; tokensOut: number };

export type GeneratedUnit =
  | { ok: true; lesson: LessonBody; items: PoolItem[]; qa: Record<string, unknown>; usage: UsageEntry[]; model: string }
  | { ok: false; reason: string; qa: Record<string, unknown>; usage: UsageEntry[] };

export function openaiLlm(): LlmCall | null {
  if (!env.OPENAI_API_KEY) return null;
  const client = openaiClient({ apiKey: env.OPENAI_API_KEY, timeout: 180_000, maxRetries: 1 });
  return async ({ model, system, user, reasoningEffort }) => {
    const completion = await client.chat.completions.create({
      model,
      ...samplingParams(model, { temperature: 0.3 }),
      ...(reasoningEffort && isReasoningModel(model) ? { reasoning_effort: reasoningEffort } : {}),
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

/** Doğrulama modeli (Burhan, 1 Kasım 2026): gpt-4.1 yerine gpt-6-luna, düşük akıl yürütme, kısa JSON. */
export const SHARED_VERIFY_MODEL = "gpt-6-luna";

/**
 * Kısa doğrulama istemi: anlatım gönderilmez (kapsam kapıda ve kazanım listesinde), sorular cevapsız gider; model
 * her soruyu kendisi çözer ve bilimsel/kazanım uyumunu tek bitle bildirir. Çıktı: {"r":[[i,çözüm,uyum],...]}.
 */
export function verifyPrompt(unit: PoolUnit, items: PoolItem[]) {
  const outcomes = unit.outcomes.map((o) => `${o.code}: ${o.text}${o.limitations.length ? ` [Sınır: ${o.limitations.join(" | ")}]` : ""}`);
  const blind = items.map((item, i) => [i, item.outcome_code, item.stem, item.choices]);
  return {
    system:
      "Denetçisin. Her soruyu cevapsız çöz (0 tabanlı şık). uyum=1 yalnız bilgi doğru, tek doğru şık var ve soru verilen " +
      'kazanım/sınır içindeyse; değilse 0. Yalnız JSON: {"r":[[i,cozum,uyum],...]}',
    user: `${unit.unit.title}\nKazanımlar:\n${outcomes.join("\n")}\nSorular [i,kod,kök,şıklar]:\n${JSON.stringify(blind)}`,
  };
}

/**
 * Soru çıktısı: her soru ayrı okunur; tek bozuk soru tüm seti düşürmez. Okunamayan her soru gerekçesiyle döner
 * (kod "?" = çıktının tamamı okunamadı).
 */
export function parseItemsLenient(text: string): { items: PoolItem[]; dropped: { code: string; reason: string }[] } {
  let raw: unknown;
  try {
    raw = parseModelOutput(text);
  } catch {
    raw = null;
  }
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items) ? (raw as { items: unknown[] }).items : null;
  if (!list) return { items: [], dropped: [{ code: "?", reason: "soru çıktısı okunamadı" }] };
  const items: PoolItem[] = [];
  const dropped: { code: string; reason: string }[] = [];
  for (const entry of list) {
    const result = itemSchema.safeParse(entry);
    if (result.success) items.push(result.data);
    else {
      const code = entry && typeof entry === "object" && typeof (entry as { outcome_code?: unknown }).outcome_code === "string" ? (entry as { outcome_code: string }).outcome_code : "?";
      const issue = result.error.issues[0];
      dropped.push({ code, reason: `şema: ${issue ? `${issue.path.join(".") || "kök"} ${issue.message}` : "geçersiz"}` });
    }
  }
  return { items, dropped };
}

function toInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "string" && /^\s*\d+\s*$/.test(v)) return Number(v);
  return null;
}
function toFit(v: unknown): boolean | null {
  if (v === 1 || v === true || v === "1" || v === "true") return true;
  if (v === 0 || v === false || v === "0" || v === "false") return false;
  return null;
}

/**
 * Kısa doğrulama yanıtı: {"r":[[i,cozum,uyum]]} beklenir; modelin sık saptığı biçimler de kabul edilir
 * (uyum true/false, sayılar metin, satırlar nesne {i|index, cozum|solved_answer, uyum|ok}, kök dizi ya da başka anahtar).
 * Hiçbiri tutmazsa null.
 */
export function parseCompactReview(text: string): Review["items"] | null {
  const strict = parse(compactReviewSchema, text);
  if (strict) return strict.r.map(([index, solved, fit]) => ({ index, solved_answer: solved, within_scope: fit === 1, ok: fit === 1 }));
  let raw: unknown;
  try {
    raw = parseModelOutput(text);
  } catch {
    return null;
  }
  let rows: unknown = raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    rows = obj.r ?? obj.items ?? obj.results ?? Object.values(obj).find(Array.isArray);
  }
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const out: Review["items"] = [];
  for (const row of rows) {
    let index: number | null, solved: number | null, fit: boolean | null;
    if (Array.isArray(row)) [index, solved, fit] = [toInt(row[0]), toInt(row[1]), toFit(row[2])];
    else if (row && typeof row === "object") {
      const o = row as Record<string, unknown>;
      index = toInt(o.i ?? o.index);
      solved = toInt(o.cozum ?? o.çözüm ?? o.solved_answer ?? o.solved ?? o.answer);
      fit = toFit(o.uyum ?? o.ok ?? o.fit ?? o.within_scope);
    } else return null;
    if (index === null || solved === null || fit === null || solved > 4) return null;
    out.push({ index, solved_answer: solved, within_scope: fit, ok: fit });
  }
  return out;
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
  models: { generate: string; verify: string } = { generate: env.OPENAI_CONTENT_MODEL, verify: SHARED_VERIFY_MODEL },
): Promise<GeneratedUnit> {
  const usage: UsageEntry[] = [];
  const call = async (actionCode: UsageCode, model: string, prompt: { system: string; user: string; reasoningEffort?: "low" }) => {
    const out = await llm({ model, ...prompt });
    // Fiyat satırları (ai_model_prices) istenen model adıyla tutulur; yanıttaki tarihli sürüm adı (gpt-4.1-2025-04-14) fiyatsız kalır.
    usage.push({ actionCode, model, tokensIn: out.tokensIn, tokensOut: out.tokensOut });
    return out.text;
  };
  const codes = unit.outcomes.map((o) => o.code);
  const choices = choiceCount(unit.program);

  const lesson = parse(lessonSchema, await call("SHARED_CONTENT_LESSON", models.generate, lessonPrompt(unit)));
  if (!lesson) return { ok: false, reason: "lesson_parse", qa: {}, usage };

  let items: PoolItem[] = [];
  const rejected: { code: string; reason: string }[] = [];
  let gateRejected = 0;
  const parseFailures: { round: number; step: "items" | "verify"; excerpt: string }[] = [];
  // Anlatım modelle yeniden okunmaz (maliyet kararı); kazanım kapsaması ve metin bütünlüğü kodda denetlenir.
  const lessonText = [lesson.overview, lesson.summary, ...lesson.sections.flatMap((s) => [s.heading, s.explanation, ...s.key_points])];
  const lessonGarbled = lessonText.map(garbledReason).filter((r): r is string => r !== null);
  const lessonReview = { ok: lessonGarbled.length === 0, issues: [...new Set(lessonGarbled)], by: "ts_gate" };
  const gateUnit = { unitId: unit.unitId, choices, outcomes: unit.outcomes.map((o) => ({ code: o.code, outcomeId: o.outcomeId, limitations: o.limitations })) };
  let shapeIssues: { code: string; detail: string }[] = [];
  for (let round = 0; round < 2; round += 1) {
    const pairs = missingCoverage(items, codes);
    if (pairs.length === 0) break;
    const rawItems = await call("SHARED_CONTENT_ITEMS", models.generate, itemsPrompt(unit, pairs));
    const fresh = parseItemsLenient(rawItems);
    for (const drop of fresh.dropped) rejected.push({ code: drop.code, reason: `çıktı: ${drop.reason}` });
    if (fresh.dropped.some((d) => d.code === "?")) parseFailures.push({ round, step: "items", excerpt: rawItems.slice(0, 300) });
    const shape = checkShape(lesson, [], codes, choices);
    shapeIssues = shape.lessonIssues;
    const gated = gateItems(fresh.items, gateUnit);
    rejected.push(...gated.rejected.map((r) => ({ code: r.code, reason: `kapı: ${r.reason}` })));
    gateRejected += gated.rejected.length;
    const wanted = new Set(pairs);
    const candidates: typeof gated.passed = [];
    for (const item of gated.passed) {
      if (wanted.has(`${item.outcome_code}|${item.difficulty}`)) candidates.push(item);
      else rejected.push({ code: item.outcome_code, reason: "istenmeyen kazanım × zorluk çifti" });
    }
    if (candidates.length === 0) continue;
    const rawReview = await call("SHARED_CONTENT_VERIFY", models.verify, { ...verifyPrompt(unit, candidates), reasoningEffort: "low" });
    const review = parseCompactReview(rawReview);
    if (!review) {
      // Sessiz düşürme yok: okunamayan doğrulama yanıtında her aday gerekçesiyle kaydedilir.
      parseFailures.push({ round, step: "verify", excerpt: rawReview.slice(0, 300) });
      rejected.push(...candidates.map((c) => ({ code: c.outcome_code, reason: "doğrulama yanıtı okunamadı" })));
      continue;
    }
    const applied = applyReview(candidates, { lesson_ok: true, lesson_issues: [], items: review });
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
    verify_effort: "low",
    gate_rejected: gateRejected,
    parse_failures: parseFailures,
    similarity_check: "not_run",
  };
  if (shapeIssues.length) return { ok: false, reason: "lesson_coverage", qa, usage };
  if (!lessonReview.ok) return { ok: false, reason: "lesson_review", qa, usage };
  if (missing.length) return { ok: false, reason: "item_coverage", qa, usage };
  return { ok: true, lesson, items, qa, usage, model: models.generate };
}
