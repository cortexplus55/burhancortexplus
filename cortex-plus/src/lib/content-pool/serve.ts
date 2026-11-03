import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CONTENT_VERSION, poolUnit, type PoolUnit } from "@/lib/content-pool/keys";
import { poolIdFromSetupId } from "@/lib/level-check/select";
import { getProgram, topicMapForRef } from "@/lib/curriculum/registry";
import { topicIndexForLabel } from "@/lib/curriculum/topic-map";
import type { CurriculumRef } from "@/lib/curriculum/types";
import type { LessonBody } from "@/lib/content-pool/schema";
import { blueprintBlocks, blueprintKind, type BlueprintKind } from "@/lib/content-pool/blueprint";
import { LESSON_V3_FORMAT, LESSON_SCREEN_HARD_CAP } from "@/lib/learning/lesson-v3";
import { poolLessonText } from "@/lib/content-pool/lesson-text";

/**
 * Havuzdan sunum (2 Kasım 2026, ürün sahibinin kararı): resmî kurulumdan gelen konunun doğrulanmış ünite
 * anlatımı, kartları ve soruları model çağrısı olmadan ve 0 krediyle açılır. Havuzda yoksa bugünkü üretim yolu.
 */
export const POOL_SERVE_KINDS = new Set(["lesson", "flashcards", "spaced", "quiz"]);

/**
 * Konunun havuz dilimi (2 Kasım 2026): kazanımlarının geldiği üniteler (sırayla) ve konunun kazanım kodları.
 * `codes` null = ünitenin tamamı (resmî kurulum planı). Alt başlık konusu ünite dersinin ilgili bölümlerini,
 * birden çok üniteye yayılan konu o ünitelerin bölümlerini birlikte alır. Model çağrısı yok.
 */
export type PoolSlice = { units: PoolUnit[]; codes: Set<string> | null };

export function poolSliceForTopic(prefs: unknown, topicLabel: string | null | undefined): PoolSlice | null {
  if (!topicLabel) return null;
  const units = (prefs as { officialPlan?: { units?: { topic?: string; unitId?: string }[] } } | null)?.officialPlan?.units;
  if (!Array.isArray(units)) return curriculumSlice((prefs as { curriculum?: CurriculumRef } | null)?.curriculum, topicLabel);
  const label = topicLabel.replace(/\s+/g, " ").trim();
  const hit = units.find((u) => typeof u?.topic === "string" && u.topic.replace(/\s+/g, " ").trim() === label);
  const poolId = hit?.unitId ? poolIdFromSetupId(hit.unitId) : null;
  const unit = poolId ? poolUnit(poolId) : null;
  return unit ? { units: [unit], codes: null } : null;
}

/** "Dosyam yok — resmî müfredattan seç" yolu: hazırlıkta `curriculum` başvurusu var, konu haritadaki konudur. */
export function curriculumSlice(ref: CurriculumRef | null | undefined, topicLabel: string): PoolSlice | null {
  if (!ref?.programId) return null;
  const map = topicMapForRef(ref);
  const program = getProgram(ref.programId);
  if (!map || !program) return null;
  const index = topicIndexForLabel(map, topicLabel);
  const codes = index >= 0 ? map.topicCodes[index] : undefined;
  if (!codes?.length) return null;
  const order: number[] = [];
  const count = new Map<number, number>();
  for (const code of codes) {
    const u = program.units.findIndex((x) => x.outcomes.some((o) => o.code === code));
    if (u < 0) continue;
    if (!count.has(u)) order.push(u);
    count.set(u, (count.get(u) ?? 0) + 1);
  }
  // Birincil ünite (en çok kazanım) başta: paylaşımlı video/podcast ve belge eki bu üniteye bağlanır.
  order.sort((x, y) => (count.get(y) ?? 0) - (count.get(x) ?? 0) || x - y);
  const units = order.map((u) => poolUnit(`${program.id}#${u + 1}`)).filter((u): u is PoolUnit => u !== null);
  return units.length ? { units, codes: new Set(codes) } : null;
}

/** Konunun birincil havuz ünitesi (paylaşımlı medya önbelleği ve belge eki ünite düzeyinde). */
export function poolUnitForTopic(prefs: unknown, topicLabel: string | null | undefined): PoolUnit | null {
  return poolSliceForTopic(prefs, topicLabel)?.units[0] ?? null;
}

/** Eski ad (testler): müfredat konusunun birincil ünitesi. */
export function poolUnitForCurriculumTopic(ref: CurriculumRef | null | undefined, topicLabel: string): PoolUnit | null {
  return curriculumSlice(ref, topicLabel)?.units[0] ?? null;
}

/** Dilime düşen ders bölümleri; kod eşleşmesi yoksa (eski kayıt) ünitenin tamamı. */
export function sliceLesson(bodies: { unit: PoolUnit; body: LessonBody }[], codes: Set<string> | null, title: string): LessonBody {
  const parts = bodies.map(({ body }) => {
    if (!codes) return body;
    const sections = body.sections.filter((s) => codes.has(s.outcome_code.trim()));
    return sections.length ? { ...body, sections } : body;
  });
  const first = parts[0]!;
  if (parts.length === 1) return { ...first, title: title || first.title };
  const terms = new Map<string, { term: string; definition: string }>();
  for (const p of parts) for (const t of p.key_terms ?? []) if (!terms.has(t.term)) terms.set(t.term, t);
  return {
    title: title || first.title,
    overview: parts.map((p) => p.overview).join("\n\n").slice(0, 4000),
    sections: parts.flatMap((p) => p.sections).slice(0, 60),
    summary: parts.map((p) => p.summary).join(" ").slice(0, 4000),
    key_terms: [...terms.values()].slice(0, 20),
    cards: parts.flatMap((p) => p.cards).slice(0, 80),
  };
}

export async function readPoolLesson(service: SupabaseClient, unit: PoolUnit): Promise<LessonBody | null> {
  const { data, error } = await service
    .from("topic_content")
    .select("body, unit_sha256")
    .eq("unit_id", unit.unitId)
    .eq("kind", "lesson")
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

/** Anlatımın ilk cümlesi (≤200 karakter, özet listesi için). */
export function screenLead(explanation: string): string | null {
  const first = explanation.replace(/\*\*/g, "").trim().split(/(?<=[.!?])\s+/)[0]?.trim() ?? "";
  if (first.length < 8) return null;
  return first.length <= 200 ? first : `${first.slice(0, 197).replace(/\s+\S*$/, "")}…`;
}

/** Havuz anlatımı → ders kaydı (V3). Bir kazanım bir ekran; çok kazanımlı ünitede ekranlar birleşir. */
function note(title: string, body: string, tone: string) {
  return { type: "note", note: { title, body: body.slice(0, 2400), tone } };
}

export function poolLessonV3(body: LessonBody, title: string, programKind = "", bpKind?: BlueprintKind | null) {
  const kind = bpKind === undefined ? blueprintKind(programKind) : bpKind;
  const per = Math.ceil(body.sections.length / LESSON_SCREEN_HARD_CAP);
  const screens: Record<string, unknown>[] = [];
  for (let i = 0; i < body.sections.length; i += per) {
    const group = body.sections.slice(i, i + per);
    const blocks = group.flatMap((s) => {
      const bp = blueprintBlocks((s as { blueprint?: unknown }).blueprint, kind);
      // Sınav iskeleti varsa ekran sırası: anlatım → iskelet blokları (akış, tablo, kutu, kısa yol, tuzak) → çözümlü örnek →
      // iskelet sorusu → hata/basamak; 12 blok sınırında iskelet kesilmez.
      if (bp.length) {
        const check = bp.filter((b) => b.type === "check");
        return [
          ...(per > 1 ? [{ type: "text", text: `**${s.heading}**` }] : []),
          ...chunks(s.explanation, 2400).slice(0, 2).map((text) => ({ type: "text", text })),
          ...bp.filter((b) => b.type !== "check"),
          ...(s.worked_example?.trim() ? [note("Çözümlü örnek", s.worked_example, "exam")] : []),
          ...check,
          ...(s.common_mistakes?.length ? [note("Sık yapılan hata", s.common_mistakes.map((m) => `• ${m}`).join("\n"), "warn")] : []),
          ...(s.ladder ? [note("Temel → orta → ileri", `Temel: ${s.ladder.temel}\nOrta: ${s.ladder.orta}\nİleri: ${s.ladder.ileri}`, "info")] : []),
        ];
      }
      return [
      ...(per > 1 ? [{ type: "text", text: `**${s.heading}**` }] : []),
      ...chunks(s.explanation, 2400).map((text) => ({ type: "text", text })),
      ...(s.steps?.length ? [{ type: "text", text: s.steps.map((p, n) => `${n + 1}. ${p}`).join("\n").slice(0, 2400) }] : []),
      ...(s.key_points.length ? [{ type: "text", text: s.key_points.map((p) => `• ${p}`).join("\n").slice(0, 2400) }] : []),
      ...(s.worked_example?.trim() ? [note("Çözümlü örnek", s.worked_example, "exam")] : []),
      ...(s.common_mistakes?.length ? [note("Sık yapılan hata", s.common_mistakes.map((m) => `• ${m}`).join("\n"), "warn")] : []),
      ...(s.ladder ? [note("Temel → orta → ileri", `Temel: ${s.ladder.temel}\nOrta: ${s.ladder.orta}\nİleri: ${s.ladder.ileri}`, "info")] : []),
      ];
    });
    // Yeni başlayana tanımlar ilk ekranın başında.
    if (i === 0 && body.key_terms?.length)
      blocks.unshift(note("Temel kavramlar", body.key_terms.map((t) => `**${t.term}**: ${t.definition}`).join("\n"), "remember"));
    screens.push({
      heading: group[0]!.heading.slice(0, 160),
      concept: group[0]!.heading.slice(0, 120),
      // Ders özet listesi başlığın altına `lead` yazar; havuzda alan yok, anlatımın ilk cümlesi kullanılır.
      ...(screenLead(group[0]!.explanation) ? { lead: screenLead(group[0]!.explanation) } : {}),
      blocks: blocks.slice(0, 12),
    });
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

/** Konunun outcome_id'leri; null = ünitelerin tamamı. */
export function sliceOutcomeIds(slice: PoolSlice): Set<string> | null {
  if (!slice.codes) return null;
  const codes = slice.codes;
  return new Set(slice.units.flatMap((u) => u.outcomes.filter((o) => codes.has(o.code)).map((o) => o.outcomeId)));
}

/** outcome_id süzgeci; süzülmüş soru sayısı yetmezse aynı ünitelerin diğer sorularıyla tamamlanır (model çağrısı yok). */
export function filterItemsByOutcome<T extends { outcome_id: string }>(rows: T[], outcomeIds: Set<string> | null, min: number): T[] {
  if (!outcomeIds) return rows;
  const inScope = rows.filter((r) => outcomeIds.has(r.outcome_id));
  if (inScope.length >= min) return inScope;
  return [...inScope, ...rows.filter((r) => !outcomeIds.has(r.outcome_id)).slice(0, min - inScope.length)];
}

export async function readPoolQuiz(service: SupabaseClient, slice: PoolSlice | PoolUnit, userId: string, count = 10) {
  const sl: PoolSlice = "units" in slice ? slice : { units: [slice], codes: null };
  const unitIds = sl.units.map((u) => u.unitId);
  const [{ data }, { data: answered }] = await Promise.all([
    service
      .from("item_bank")
      .select("id, outcome_id, difficulty, stem, choices, answer, explanation")
      .in("unit_id", unitIds)
      .in("program_id", [...new Set(sl.units.map((u) => u.program.id))])
      .eq("status", "verified")
      .limit(800),
    service.from("item_responses").select("item_id").eq("user_id", userId).in("unit_id", unitIds).limit(2000),
  ]);
  const rows = filterItemsByOutcome((data ?? []) as ItemRow[], sliceOutcomeIds(sl), count);
  if (!rows.length) return [];
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

/** Havuzda doğrulanmış ders yoksa: paylaşımlı üretim (SHARED_CONTENT, öğrenciye 0 kredi). Yoksa null. */
export type EnsureUnit = (unit: PoolUnit) => Promise<LessonBody | null>;

/** Havuzdan sunulacak gövde; havuzda yoksa ve paylaşımlı üretim de olmadıysa null (bugünkü üretim yolu). */
export async function poolPayload(
  service: SupabaseClient,
  input: { kind: string; prefs: unknown; topicLabel: string; title: string; userId: string; ensure?: EnsureUnit },
): Promise<Record<string, unknown> | null> {
  if (!POOL_SERVE_KINDS.has(input.kind)) return null;
  const slice = poolSliceForTopic(input.prefs, input.topicLabel);
  if (!slice) return null;
  const unit = slice.units[0]!;
  const base = {
    pool: { unitId: unit.unitId, programId: unit.program.id, ...(slice.units.length > 1 ? { unitIds: slice.units.map((u) => u.unitId) } : {}), ...(slice.codes ? { outcomeCodes: [...slice.codes] } : {}) },
    engine: "pool",
    refunded: false,
  };
  // Paket 1b (3 Kasım 2026): üniteler ve test soruları paralel okunur; havuz testi sunucu açılışı 1 sn altına.
  const lessonsRead = Promise.all(
    slice.units.map(async (u) => ({ unit: u, body: (await readPoolLesson(service, u)) ?? (input.ensure ? await input.ensure(u).catch(() => null) : null) })),
  );
  const quizRead = input.kind === "quiz" ? readPoolQuiz(service, slice, input.userId) : null;
  const read = await lessonsRead;
  if (read.some((r) => !r.body)) return null;
  const bodies = read as { unit: PoolUnit; body: LessonBody }[];
  if (quizRead) {
    const questions = await quizRead;
    return questions.length >= 5 ? { type: "quiz", questions, uncoveredTopics: [], ...base } : null;
  }
  const body = sliceLesson(bodies, slice.codes, input.title);
  if (input.kind === "lesson") {
    const lesson = poolLessonV3(body, input.title, unit.program.kind);
    return { type: "lesson", lesson, title: lesson.title, qualityReport: null, ...base };
  }
  const cards = body.cards.map((c) => ({ front: c.front, back: c.back }));
  return cards.length ? { type: "cards", cards, masteryClaim: false, ...base } : null;
}

/**
 * Belgesiz havuz hazırlığında konuların doğrulanmış anlatım metni (3 Kasım 2026): sözlü sınavın kaynağı.
 * Model çağrısı ve paylaşımlı üretim yok (bütçe değişmez); havuzda doğrulanmış ders yoksa o konu atlanır. Hiçbiri yoksa "".
 */
export async function poolSourceText(
  service: SupabaseClient,
  input: { prefs: unknown; topicLabels: readonly string[]; maxChars?: number },
): Promise<string> {
  const labels = [...new Set(input.topicLabels.map((l) => l.trim()).filter(Boolean))].slice(0, 12);
  if (!labels.length) return "";
  const budget = Math.max(2_000, Math.floor((input.maxChars ?? 14_000) / labels.length));
  const parts = await Promise.all(
    labels.map(async (label) => {
      const slice = poolSliceForTopic(input.prefs, label);
      if (!slice) return "";
      const read = await Promise.all(slice.units.map(async (unit) => ({ unit, body: await readPoolLesson(service, unit).catch(() => null) })));
      const bodies = read.filter((r): r is { unit: PoolUnit; body: LessonBody } => Boolean(r.body));
      if (!bodies.length) return "";
      return poolLessonText(sliceLesson(bodies, slice.codes, label), label, budget);
    }),
  );
  return parts.filter(Boolean).join("\n\n");
}

/** Belgesiz sözlü (3 Kasım 2026, t260u): konuların doğrulanmış ders gövdeleri (dilimlenmiş). Model çağrısı yok. */
export async function poolLessonBodies(
  service: SupabaseClient,
  input: { prefs: unknown; topicLabels: readonly string[] },
): Promise<LessonBody[]> {
  const labels = [...new Set(input.topicLabels.map((l) => l.trim()).filter(Boolean))].slice(0, 12);
  const bodies = await Promise.all(
    labels.map(async (label) => {
      const slice = poolSliceForTopic(input.prefs, label);
      if (!slice) return null;
      const read = await Promise.all(slice.units.map(async (unit) => ({ unit, body: await readPoolLesson(service, unit).catch(() => null) })));
      const ok = read.filter((r): r is { unit: PoolUnit; body: LessonBody } => Boolean(r.body));
      return ok.length ? sliceLesson(ok, slice.codes, label) : null;
    }),
  );
  return bodies.filter((b): b is LessonBody => b !== null);
}
