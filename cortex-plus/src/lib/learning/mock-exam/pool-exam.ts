import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { poolSliceForTopic, sliceOutcomeIds } from "@/lib/content-pool/serve";
import { prepSourceDocumentIds } from "@/lib/learning/prep-source";
import { buildBlueprint } from "@/lib/learning/mock-exam/allocate";
import { loadMockExamSetup } from "@/lib/learning/mock-exam/create";
import { pickPoolExamItems, type PoolExamItem, type PoolExamRow } from "@/lib/learning/mock-exam/pool-pick";
import type { MockLengthPreset } from "@/lib/learning/mock-exam/types";

/**
 * Havuz hazırlığında yazılı deneme (3 Kasım 2026): canlıda "Kısa · 10 soru" 3,5-4 dk hazırlanıyordu. Belgesiz
 * havuz hazırlığında kâğıt, kapı denetiminden geçmiş (`item_bank.status = 'verified'`) sorulardan tek okumayla
 * kurulur — model çağrısı, paylaşımlı üretim ve kredi yok. Yetmezse null: bugünkü üretim yolu aynen çalışır.
 * Ücretsiz hesapta da null (yazılı deneme Plus kapısı korunur).
 */
export async function tryPoolMockExam(input: {
  service: SupabaseClient;
  userId: string;
  prepId: string;
  isPremium: boolean;
  preset?: MockLengthPreset;
  scope?: "all" | "topics";
  topicIds?: string[];
  durationMinutes?: number;
  questionCount?: number;
  twin?: boolean;
}): Promise<{ examId: string; planned: number; topicTotal: number; ms: number } | null> {
  const started = Date.now();
  const { service, userId, prepId } = input;
  if (input.twin || !input.isPremium) return null;
  const { data: prep } = await service
    .from("exam_preps")
    .select("id, title, document_id, source_document_ids, learning_preferences")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return null;
  const docs = prepSourceDocumentIds({
    documentId: (prep.document_id as string | null) ?? null,
    sourceDocumentIds: (prep.source_document_ids as string[] | null) ?? null,
  });
  if (docs.length) return null;

  const { data: topicRows } = await service
    .from("exam_prep_topics")
    .select("id, label, status, source_refs")
    .eq("exam_prep_id", prepId)
    .order("sort_order");
  let topics = (topicRows ?? []) as Array<{ id: string; label: string; status: string | null; source_refs: unknown }>;
  if (input.scope === "topics" && input.topicIds?.length) {
    const allowed = new Set(input.topicIds);
    topics = topics.filter((t) => allowed.has(t.id));
  }
  if (!topics.length) return null;
  const prefs = prep.learning_preferences;
  if (topics.some((t) => !poolSliceForTopic(prefs, t.label))) return null;

  const { slots, syllabus, official } = await loadMockExamSetup(service, userId, prepId, topics);
  let preset: MockLengthPreset = input.preset ?? (syllabus || official ? "real" : "standard");
  if (input.questionCount != null) preset = input.questionCount <= 12 ? "short" : "standard";
  const blueprint = buildBlueprint({
    topics: slots,
    preset,
    syllabus: preset === "real" ? syllabus : null,
    allowNumeric: false,
    questionCount: input.questionCount ?? (preset === "real" && !syllabus && official ? official.total : undefined),
  });
  // Belgedeki biçim açık uçlu soru istiyorsa havuz (yalnız çoktan seçmeli) o sözü tutamaz: üretim yolu.
  if (blueprint.fromSyllabus && blueprint.slots.some((s) => s.type !== "mcq")) return null;
  blueprint.slots = blueprint.slots.map(() => ({ type: "mcq" as const, points: 4 }));
  if (input.durationMinutes != null) blueprint.durationMinutes = input.durationMinutes;

  const rows: PoolExamRow[] = [];
  for (const row of blueprint.allocation) {
    const slice = poolSliceForTopic(prefs, row.topicLabel);
    if (!slice) return null;
    rows.push({
      topicId: row.topicId,
      topicLabel: row.topicLabel,
      count: row.count,
      unitIds: slice.units.map((u) => u.unitId),
      outcomeIds: sliceOutcomeIds(slice),
    });
  }
  const unitIds = [...new Set(rows.flatMap((r) => r.unitIds))];
  if (!unitIds.length) return null;
  const [{ data: items, error }, { data: answered }] = await Promise.all([
    service
      .from("item_bank")
      .select("id, unit_id, outcome_id, difficulty, stem, choices, answer, explanation")
      .in("unit_id", unitIds)
      .eq("status", "verified")
      .limit(2000),
    service.from("item_responses").select("item_id").eq("user_id", userId).in("unit_id", unitIds).limit(4000),
  ]);
  if (error || !items?.length) return null;
  const picked = pickPoolExamItems(
    items as PoolExamItem[],
    rows,
    new Set((answered ?? []).map((r) => String(r.item_id))),
  );
  if (!picked) return null;
  const flat = picked.flatMap(({ row, items: list }) => list.map((item) => ({ row, item })));
  if (flat.length !== blueprint.questionCount) return null;

  const { data: exam, error: examError } = await service
    .from("practice_exams")
    .insert({
      user_id: userId,
      title: `${String(prep.title)} · yazılı deneme`,
      duration_minutes: blueprint.durationMinutes,
      exam_prep_id: prepId,
      blueprint: { ...blueprint, pool: true },
      scope: input.scope ?? "all",
      topic_ids: input.topicIds ?? null,
    })
    .select("id")
    .single();
  if (examError || !exam) return null;
  const examId = exam.id as string;
  const questionRows = flat.map(({ row, item }, sort_order) => {
    const choices = item.choices.map((c) => String(c).trim());
    const correct = choices[item.answer]!;
    return {
      exam_id: examId,
      question_text: item.stem.trim(),
      question_type: "mcq",
      options: choices,
      correct_answer: correct,
      correct_answers: [correct],
      points: 4,
      sort_order,
      topic_id: row.topicId,
      topic_label: row.topicLabel,
      explanation: item.explanation ?? null,
      source_label: "Doğrulanmış soru havuzu",
      difficulty: item.difficulty ?? null,
      pool_item_id: item.id,
    };
  });
  const { error: insertError } = await service.from("practice_exam_questions").insert(questionRows);
  if (insertError) {
    await service.from("practice_exams").delete().eq("id", examId).eq("user_id", userId);
    return null;
  }
  const ms = Date.now() - started;
  console.info(JSON.stringify({ event: "mock_pool_select", ms, count: flat.length, prepId }));
  return { examId, planned: flat.length, topicTotal: rows.length, ms };
}
