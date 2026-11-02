import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CONTENT_VERSION, poolUnit, type PoolUnit } from "@/lib/content-pool/keys";
import { poolIdFromSetupId } from "@/lib/level-check/select";
import type { LessonBody } from "@/lib/content-pool/schema";
import { LESSON_V3_FORMAT, LESSON_SCREEN_HARD_CAP } from "@/lib/learning/lesson-v3";

/**
 * Havuzdan sunum (2 Kasım 2026, ürün sahibinin kararı): resmî kurulumdan gelen konunun doğrulanmış ünite
 * anlatımı, kartları ve soruları model çağrısı olmadan ve 0 krediyle açılır. Havuzda yoksa bugünkü üretim yolu.
 */
export const POOL_SERVE_KINDS = new Set(["lesson", "flashcards", "spaced", "quiz"]);

/** Hazırlığın resmî planında bu konunun ünitesi (kanonik havuz kimliği). */
export function poolUnitForTopic(prefs: unknown, topicLabel: string | null | undefined): PoolUnit | null {
  if (!topicLabel) return null;
  const units = (prefs as { officialPlan?: { units?: { topic?: string; unitId?: string }[] } } | null)?.officialPlan?.units;
  if (!Array.isArray(units)) return null;
  const label = topicLabel.replace(/\s+/g, " ").trim();
  const hit = units.find((u) => typeof u?.topic === "string" && u.topic.replace(/\s+/g, " ").trim() === label);
  const poolId = hit?.unitId ? poolIdFromSetupId(hit.unitId) : null;
  return poolId ? poolUnit(poolId) : null;
}

export async function readPoolLesson(service: SupabaseClient, unit: PoolUnit): Promise<LessonBody | null> {
  const { data, error } = await service
    .from("topic_content")
    .select("body, unit_sha256")
    .eq("unit_id", unit.unitId)
    .eq("program_id", unit.program.id)
    .eq("version", CONTENT_VERSION)
    .eq("status", "verified")
    .order("verified_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data || data.unit_sha256 !== unit.sha256) return null;
  return data.body as LessonBody;
}

function chunks(text: string, max: number): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const cut = Math.max(rest.lastIndexOf("\n", max), rest.lastIndexOf(". ", max) + 1);
    const at = cut > max / 2 ? cut : max;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest.length >= 2) out.push(rest);
  return out;
}

/** Havuz anlatımı → ders kaydı (V3). Bir kazanım bir ekran; çok kazanımlı ünitede ekranlar birleşir. */
export function poolLessonV3(body: LessonBody, title: string) {
  const per = Math.ceil(body.sections.length / LESSON_SCREEN_HARD_CAP);
  const screens: Record<string, unknown>[] = [];
  for (let i = 0; i < body.sections.length; i += per) {
    const group = body.sections.slice(i, i + per);
    const blocks = group.flatMap((s) => [
      ...(per > 1 ? [{ type: "text", text: `**${s.heading}**` }] : []),
      ...chunks(s.explanation, 2400).map((text) => ({ type: "text", text })),
      ...(s.key_points.length ? [{ type: "text", text: s.key_points.map((p) => `• ${p}`).join("\n").slice(0, 2400) }] : []),
    ]);
    screens.push({ heading: group[0]!.heading.slice(0, 160), concept: group[0]!.heading.slice(0, 120), blocks: blocks.slice(0, 12) });
  }
  const summary = body.summary
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
    .slice(0, 8)
    .map((s) => s.slice(0, 240));
  return { format: LESSON_V3_FORMAT, title: (title || body.title).slice(0, 160), overview: body.overview.slice(0, 1500), screens, summary };
}

type ItemRow = { id: string; outcome_id: string; difficulty: string; stem: string; choices: string[]; answer: number; explanation: string | null };

export async function readPoolQuiz(service: SupabaseClient, unit: PoolUnit, userId: string, count = 10) {
  const { data } = await service
    .from("item_bank")
    .select("id, outcome_id, difficulty, stem, choices, answer, explanation")
    .eq("unit_id", unit.unitId)
    .eq("program_id", unit.program.id)
    .eq("status", "verified")
    .limit(400);
  const rows = (data ?? []) as ItemRow[];
  if (!rows.length) return [];
  const { data: answered } = await service.from("item_responses").select("item_id").eq("user_id", userId).eq("unit_id", unit.unitId).limit(2000);
  const seen = new Set((answered ?? []).map((r) => String(r.item_id)));
  const fresh = rows.filter((r) => !seen.has(r.id));
  const pool = (fresh.length >= count ? fresh : rows).slice();
  // Kazanım ve zorluk dengesi: sırayla her kazanımdan bir soru.
  const byOutcome = new Map<string, ItemRow[]>();
  for (const r of pool.sort(() => Math.random() - 0.5)) byOutcome.set(r.outcome_id, [...(byOutcome.get(r.outcome_id) ?? []), r]);
  const picked: ItemRow[] = [];
  while (picked.length < count && [...byOutcome.values()].some((l) => l.length)) {
    for (const list of byOutcome.values()) if (list.length && picked.length < count) picked.push(list.shift()!);
  }
  return picked.map((r) => ({
    text: r.stem,
    options: r.choices.map(String),
    correct: [String(r.choices[r.answer])],
    multi: false,
    ...(r.explanation ? { explanation: r.explanation } : {}),
    poolItemId: r.id,
  }));
}

/** Havuzdan sunulacak gövde; havuzda yoksa null (bugünkü üretim yolu). */
export async function poolPayload(
  service: SupabaseClient,
  input: { kind: string; prefs: unknown; topicLabel: string; title: string; userId: string },
): Promise<Record<string, unknown> | null> {
  if (!POOL_SERVE_KINDS.has(input.kind)) return null;
  const unit = poolUnitForTopic(input.prefs, input.topicLabel);
  if (!unit) return null;
  const base = { pool: { unitId: unit.unitId, programId: unit.program.id }, engine: "pool", refunded: false };
  if (input.kind === "quiz") {
    const questions = await readPoolQuiz(service, unit, input.userId);
    return questions.length >= 5 ? { type: "quiz", questions, uncoveredTopics: [], ...base } : null;
  }
  const body = await readPoolLesson(service, unit);
  if (!body) return null;
  if (input.kind === "lesson") {
    const lesson = poolLessonV3(body, input.title);
    return { type: "lesson", lesson, title: lesson.title, qualityReport: null, ...base };
  }
  const cards = body.cards.map((c) => ({ front: c.front, back: c.back }));
  return cards.length ? { type: "cards", cards, masteryClaim: false, ...base } : null;
}
