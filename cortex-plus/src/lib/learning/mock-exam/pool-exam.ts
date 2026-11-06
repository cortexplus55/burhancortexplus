import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { poolSliceForTopic, sliceOutcomeIds } from "@/lib/content-pool/serve";
import { prepSourceDocumentIds } from "@/lib/learning/prep-source";
import { buildBlueprint } from "@/lib/learning/mock-exam/allocate";
import { loadMockExamSetup } from "@/lib/learning/mock-exam/create";
import { pickPoolExamItems, type PoolExamItem, type PoolExamRow } from "@/lib/learning/mock-exam/pool-pick";
import type { MockLengthPreset } from "@/lib/learning/mock-exam/types";
import { applyOrder, poolChoiceOrders } from "@/lib/learning/option-balance";

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
}, timer?: { mark: (name: string) => void }): Promise<{
  examId: string;
  planned: number;
  topicTotal: number;
  ms: number;
  /** İstemci ilk soruyu yönlendirmeyi beklemeden çizsin diye (3 Kasım 2026); doğru cevap yok. */
  title: string;
  questions: Array<{ id: string; text: string; options: string[]; question_type: "mcq"; points: number }>;
} | null> {
  const started = Date.now();
  const { service, userId, prepId } = input;
  if (input.twin || !input.isPremium) return null;
  // Tek round-trip (3 Kasım 2026): hazırlık, konular ve kaynak belge bağları paralel; sonra ek okuma yok.
  const [{ data: prep }, { data: topicRows }] = await Promise.all([
    service
      .from("exam_preps")
      .select("id, title, document_id, source_document_ids, learning_preferences")
      .eq("id", prepId)
      .eq("user_id", userId)
      .maybeSingle(),
    service.from("exam_prep_topics").select("id, label, status, source_refs").eq("exam_prep_id", prepId).order("sort_order"),
  ]);
  timer?.mark("pool_prep");
  if (!prep) return null;
  const docs = prepSourceDocumentIds({
    documentId: (prep.document_id as string | null) ?? null,
    sourceDocumentIds: (prep.source_document_ids as string[] | null) ?? null,
  });
  if (docs.length) return null;

  let topics = (topicRows ?? []) as Array<{ id: string; label: string; status: string | null; source_refs: unknown }>;
  if (input.scope === "topics" && input.topicIds?.length) {
    const allowed = new Set(input.topicIds);
    topics = topics.filter((t) => allowed.has(t.id));
  }
  if (!topics.length) return null;
  const prefs = prep.learning_preferences;
  if (topics.some((t) => !poolSliceForTopic(prefs, t.label))) return null;

  const { slots, syllabus, official } = await loadMockExamSetup(service, userId, prepId, topics, { syllabusText: "", prefs });
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
      // Dar okuma: açıklama (en ağır alan) yalnız seçilen sorular için ayrıca, kâğıt kaydıyla paralel okunur.
      .select("id, unit_id, outcome_id, difficulty, stem, choices, answer")
      .in("unit_id", unitIds)
      .eq("status", "verified")
      .limit(2000),
    service.from("item_responses").select("item_id").eq("user_id", userId).in("unit_id", unitIds).limit(4000),
  ]);
  timer?.mark("pool_items");
  if (error || !items?.length) return null;
  const picked = pickPoolExamItems(
    (items as Omit<PoolExamItem, "explanation">[]).map((i) => ({ ...i, explanation: null })),
    rows,
    new Set((answered ?? []).map((r) => String(r.item_id))),
  );
  if (!picked) return null;
  const flat = picked.flatMap(({ row, items: list }) => list.map((item) => ({ row, item })));
  if (flat.length !== blueprint.questionCount) return null;

  const [{ data: exam, error: examError }, { data: explained }] = await Promise.all([
    service
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
    .single(),
    service.from("item_bank").select("id, explanation").in("id", flat.map(({ item }) => item.id)),
  ]);
  timer?.mark("pool_exam_insert");
  if (examError || !exam) return null;
  const explanationOf = new Map(((explained ?? []) as { id: string; explanation: string | null }[]).map((r) => [r.id, r.explanation]));
  const examId = exam.id as string;
  // Şıklar sınav düzeyinde dengelenir (6 Kasım 2026, Paket 2): havuzda doğru cevap çoğunlukla A ya da B'de; kâğıt
  // olduğu gibi kurulunca 10 sorunun 10'u A/B çıkmıştı. Sıra kayda yazılır; notlama ve inceleme kayıttan okur.
  const orders = poolChoiceOrders(
    flat.map(({ item }) => ({ id: item.id, choices: item.choices, answer: item.answer, explanation: explanationOf.get(item.id) ?? null })),
    examId,
  );
  const questionRows = flat.map(({ row, item }, sort_order) => {
    const original = item.choices.map((c) => String(c).trim());
    const correct = original[item.answer]!;
    const choices = applyOrder(original, orders[sort_order]!);
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
      explanation: explanationOf.get(item.id) ?? null,
      source_label: "Doğrulanmış soru havuzu",
      difficulty: item.difficulty ?? null,
      pool_item_id: item.id,
    };
  });
  const { data: inserted, error: insertError } = await service
    .from("practice_exam_questions")
    .insert(questionRows)
    .select("id, sort_order");
  if (insertError) {
    await service.from("practice_exams").delete().eq("id", examId).eq("user_id", userId);
    return null;
  }
  timer?.mark("pool_questions_insert");
  const ms = Date.now() - started;
  console.info(JSON.stringify({ event: "mock_pool_select", ms, count: flat.length, prepId }));
  const idBySort = new Map(((inserted ?? []) as { id: string; sort_order: number }[]).map((r) => [r.sort_order, r.id]));
  const questions = questionRows.every((_, i) => idBySort.has(i))
    ? questionRows.map((q, i) => ({ id: idBySort.get(i)!, text: q.question_text, options: q.options, question_type: "mcq" as const, points: q.points }))
    : [];
  return { examId, planned: flat.length, topicTotal: rows.length, ms, title: `${String(prep.title)} · yazılı deneme`, questions };
}
