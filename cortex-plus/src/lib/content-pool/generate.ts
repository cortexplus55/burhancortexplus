import "server-only";
import { env } from "@/lib/env";
import { openaiClient } from "@/lib/ai/openai-client";
import { isReasoningModel, samplingParams } from "@/lib/ai/model-params";
import { parseModelOutput } from "@/lib/ai/json-repair";
import { turkishFold } from "@/lib/text/turkish";
import type { UsageCode } from "@/lib/credits/service";
import { choiceCount, type PoolUnit } from "@/lib/content-pool/keys";
import { GATE_VERSION, garbledReason, gateItems } from "@/lib/content-pool/gate";
import {
  applyReview,
  checkShape,
  itemSchema,
  lessonSchema,
  missingCoverage,
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
  /** Yapılandırılmış çıktı (strict json_schema); yoksa json_object. */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
}) => Promise<{ text: string; tokensIn: number; tokensOut: number; model: string }>;

export type UsageEntry = { actionCode: UsageCode; model: string; tokensIn: number; tokensOut: number };

export type GeneratedUnit =
  | { ok: true; lesson: LessonBody; items: PoolItem[]; qa: Record<string, unknown>; usage: UsageEntry[]; model: string }
  | { ok: false; reason: string; qa: Record<string, unknown>; usage: UsageEntry[] };

export function openaiLlm(): LlmCall | null {
  if (!env.OPENAI_API_KEY) return null;
  const client = openaiClient({ apiKey: env.OPENAI_API_KEY, timeout: 180_000, maxRetries: 1 });
  return async ({ model, system, user, reasoningEffort, jsonSchema }) => {
    const completion = await client.chat.completions.create({
      model,
      ...samplingParams(model, { temperature: 0.3 }),
      ...(reasoningEffort && isReasoningModel(model) ? { reasoning_effort: reasoningEffort } : {}),
      response_format: jsonSchema
        ? { type: "json_schema", json_schema: { name: jsonSchema.name, strict: true, schema: jsonSchema.schema } }
        : { type: "json_object" },
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

/** Doğrulama çıktısı için strict JSON şeması: cozum yalnız geçerli şık numarası olabilir. */
export function verifySchema(choices: number) {
  return {
    name: "verify_review",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["r"],
      properties: {
        r: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["i", "cozum", "uyum"],
            properties: {
              i: { type: "integer" },
              cozum: { type: "integer", enum: Array.from({ length: choices }, (_, k) => k) },
              uyum: { type: "integer", enum: [0, 1] },
            },
          },
        },
      },
    },
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
  const blind = items.map((item, i) => [i, item.outcome_code, item.stem, item.choices.map((c, j) => `${j}) ${c}`)]);
  return {
    system:
      "Denetçisin. Her soruyu cevapsız çöz. Şıklar 0) 1) 2) … diye numaralı; cozum seçtiğin şıkkın NUMARASIDIR (tam sayı), " +
      "şık metni yazma. uyum=1 yalnız bilgi doğru, tek doğru şık var ve soru verilen kazanım/sınır içindeyse; değilse 0. " +
      'Yalnız JSON: {"r":[{"i":i,"cozum":şık numarası,"uyum":0|1},...]}. Örnek: {"r":[{"i":0,"cozum":2,"uyum":1},{"i":1,"cozum":0,"uyum":0}]}',
    jsonSchema: verifySchema(choiceCount(unit.program)),
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

const LABEL = /^\s*(?:(\d{1,2})|([A-Ea-e]))\s*(?:[)\].:\-–—]+|(?=\s*$))\s*/u;
const normChoice = (t: string) => turkishFold(t.replace(LABEL, "")).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function bigrams(t: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < t.length - 1; i += 1) m.set(t.slice(i, i + 2), (m.get(t.slice(i, i + 2)) ?? 0) + 1);
  return m;
}
function dice(a: string, b: string): number {
  if (a === b) return 1;
  const x = bigrams(a);
  const y = bigrams(b);
  let inter = 0;
  for (const [k, n] of x) inter += Math.min(n, y.get(k) ?? 0);
  const total = Math.max(1, a.length - 1) + Math.max(1, b.length - 1);
  return (2 * inter) / total;
}
export const CHOICE_SIMILARITY = 0.9;

/** Metin şık → yalnız tek ve açık eşleşmede sıra; aksi gerekçe. Tahmin yok. */
function matchChoiceText(text: string, choices: string[]): number | { reason: string } {
  const t = normChoice(text);
  if (t.length < 2) return { reason: "çözüm metni boş" };
  const norm = choices.map(normChoice);
  const exact = norm.flatMap((c, i) => (c === t ? [i] : []));
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) return { reason: "çözüm metni birden çok şıkla aynı" };
  // Model şık metnini kısaltıp/uzatıp yazabilir: biri ötekinin başıysa (yeterince uzun) tek eşleşme kabul.
  const prefix = norm.flatMap((c, i) => (Math.min(c.length, t.length) >= 12 && (t.startsWith(c) || c.startsWith(t)) ? [i] : []));
  if (prefix.length === 1) return prefix[0]!;
  if (prefix.length > 1) return { reason: "çözüm metni birden çok şıkla örtüşüyor" };
  const scores = norm.map((c) => dice(c, t));
  const best = Math.max(...scores);
  const hits = scores.flatMap((s, i) => (s >= CHOICE_SIMILARITY ? [i] : []));
  if (hits.length === 1 && scores.every((s, i) => i === hits[0] || s < best - 0.1)) return hits[0]!;
  if (hits.length > 1) return { reason: "çözüm metni birden çok şıkka benziyor" };
  return { reason: "çözüm metni hiçbir şıkla eşleşmedi" };
}

/** İkinci alan: sayı, "N — metin", "2)", "B" ya da şık metni. Çelişki ya da belirsizlikte gerekçe döner. */
export function resolveSolved(v: unknown, choices: string[]): number | { reason: string } {
  const direct = toInt(v);
  if (direct !== null) return direct < choices.length ? direct : { reason: `çözüm sırası ${direct} şıkların dışında` };
  if (typeof v !== "string") return { reason: "çözüm alanı okunamadı" };
  // Şık metninin kendisi sayı/harfle başlayabilir ("1. Dünya Savaşı"): önce tam metin eşleşmesi.
  const full = choices.flatMap((c, i) => (turkishFold(c.trim()) === turkishFold(v.trim()) ? [i] : []));
  const sameNorm = choices.filter((c) => normChoice(c) === normChoice(v)).length;
  if (full.length === 1 && sameNorm <= 1) return full[0]!;
  const label = LABEL.exec(v);
  if (label) {
    const idx = label[1] !== undefined ? Number(label[1]) : turkishFold(label[2]!).charCodeAt(0) - 97;
    if (idx >= choices.length) return { reason: `çözüm sırası ${idx} şıkların dışında` };
    const rest = v.slice(label[0].length).trim();
    if (rest.length >= 2) {
      const byText = matchChoiceText(rest, choices);
      if (typeof byText === "number" && byText !== idx) return { reason: `çözüm sırası (${idx}) ile metni (${byText}) çelişiyor` };
    }
    return idx;
  }
  return matchChoiceText(v, choices);
}

export type ParsedReview = { rows: Review["items"]; unreadable: { index: number; reason: string }[] };

/**
 * Kısa doğrulama yanıtı: {"r":[[i,cozum,uyum]]} beklenir; sapmalar da okunur (uyum true/false, sayılar metin,
 * nesne satırları, kök dizi; çözüm "0 — metin", "2)", "B" ya da şık metni → `resolveSolved`). Okunamayan satır
 * gerekçesiyle `unreadable`'a gider; yanıtın tamamı okunamazsa null.
 */
export function parseCompactReview(text: string, items: Pick<PoolItem, "choices">[]): ParsedReview | null {
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
  const out: ParsedReview = { rows: [], unreadable: [] };
  rows.forEach((row, pos) => {
    let index: number | null, solvedRaw: unknown, fit: boolean | null;
    if (Array.isArray(row)) [index, solvedRaw, fit] = [toInt(row[0]), row[1], toFit(row[2])];
    else if (row && typeof row === "object") {
      const o = row as Record<string, unknown>;
      index = toInt(o.i ?? o.index);
      solvedRaw = o.cozum ?? o.çözüm ?? o.solved_answer ?? o.solved ?? o.answer;
      fit = toFit(o.uyum ?? o.ok ?? o.fit ?? o.within_scope);
    } else {
      out.unreadable.push({ index: pos, reason: "doğrulama satırı okunamadı" });
      return;
    }
    const at = index ?? pos;
    const item = index !== null ? items[index] : undefined;
    if (!item) return void out.unreadable.push({ index: at, reason: "doğrulama satırı sırası geçersiz" });
    if (fit === null) return void out.unreadable.push({ index: at, reason: "uyum alanı okunamadı" });
    const solved = resolveSolved(solvedRaw, item.choices);
    if (typeof solved !== "number") return void out.unreadable.push({ index: at, reason: `doğrulama: ${solved.reason}` });
    out.rows.push({ index: at, solved_answer: solved, within_scope: fit, ok: fit });
  });
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
  const call = async (
    actionCode: UsageCode,
    model: string,
    prompt: { system: string; user: string; reasoningEffort?: "low"; jsonSchema?: { name: string; schema: Record<string, unknown> } },
  ) => {
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
    const review = parseCompactReview(rawReview, candidates);
    if (!review) {
      // Sessiz düşürme yok: okunamayan doğrulama yanıtında her aday gerekçesiyle kaydedilir.
      parseFailures.push({ round, step: "verify", excerpt: rawReview.slice(0, 300) });
      rejected.push(...candidates.map((c) => ({ code: c.outcome_code, reason: "doğrulama yanıtı okunamadı" })));
      continue;
    }
    if (review.unreadable.length) parseFailures.push({ round, step: "verify", excerpt: rawReview.slice(0, 300) });
    const unreadable = new Map(review.unreadable.map((u) => [u.index, u.reason]));
    const applied = applyReview(candidates, { lesson_ok: true, lesson_issues: [], items: review.rows });
    for (const r of applied.rejected) {
      const idx = candidates.indexOf(r.item as (typeof candidates)[number]);
      if (r.reason === "doğrulanmadı" && unreadable.has(idx)) r.reason = unreadable.get(idx)!;
    }
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
    gate_version: GATE_VERSION,
  };
  if (shapeIssues.length) return { ok: false, reason: "lesson_coverage", qa, usage };
  if (!lessonReview.ok) return { ok: false, reason: "lesson_review", qa, usage };
  if (missing.length) return { ok: false, reason: "item_coverage", qa, usage };
  return { ok: true, lesson, items, qa, usage, model: models.generate };
}
