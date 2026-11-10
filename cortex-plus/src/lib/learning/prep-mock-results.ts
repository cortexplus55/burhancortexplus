import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Hazırlığın notlanmış denemeleri (10 Kasım 2026).
 *
 * İlerleme sekmesi denemeleri yalnız yol adımının kayıtlarından okuyordu. Kurulumdan çözülen yazılı deneme kendi
 * tablosuna (`practice_exam_attempts`) yazılır ve yoldaki adımı ancak adım açıksa bitirir (30 Ekim 2026, Paket I #8);
 * adım kilitliyken çözülen deneme İlerleme'de hiç görünmüyordu: "Henüz deneme çözmedin", Deneme Performansı %0.
 * Bu okuyucu denemeyi kendi kaydından getirir; her denemenin en son notlanan çözümü sayılır.
 */
export type PrepMockResult = {
  examId: string;
  title: string;
  /** 0–100; notlandırmanın yazdığı yüzde. */
  pct: number;
  /** Notlandığı an (ISO). */
  date: string;
  /** Kâğıttaki soru sayısı; okunamadıysa null. */
  questions: number | null;
  /** Soru soru inceleme sayfası. */
  href: string;
};

type ExamRow = { id: string; title: string | null };
type AttemptRow = { exam_id: string; score: number | string | null; completed_at: string | null };

const clampPct = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

/** Saf birleştirici: deneme başına en son notlanan çözüm, yeniden eskiye. */
export function mockResultsFromRows(input: {
  prepId: string;
  exams: ExamRow[];
  attempts: AttemptRow[];
  questionCounts?: Map<string, number>;
}): PrepMockResult[] {
  const examById = new Map(input.exams.map((exam) => [exam.id, exam]));
  const latest = new Map<string, AttemptRow>();
  for (const attempt of input.attempts) {
    if (!attempt.completed_at || !examById.has(attempt.exam_id)) continue;
    const score = Number(attempt.score);
    if (!Number.isFinite(score)) continue;
    const seen = latest.get(attempt.exam_id);
    if (!seen || Date.parse(attempt.completed_at) > Date.parse(seen.completed_at ?? "")) latest.set(attempt.exam_id, attempt);
  }
  return [...latest.values()]
    .map((attempt) => ({
      examId: attempt.exam_id,
      title: examById.get(attempt.exam_id)?.title?.trim() || "Yazılı deneme",
      pct: clampPct(Number(attempt.score)),
      date: attempt.completed_at as string,
      questions: input.questionCounts?.get(attempt.exam_id) ?? null,
      href: `/deneme-sinavlari/${input.prepId}/deneme/${attempt.exam_id}/incele`,
    }))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

/**
 * Hazırlığın notlanmış denemelerini okur. Okuma düşerse boş liste döner: İlerleme sayfası deneme kaydı yüzünden
 * düşmez (yol adımının kayıtları yine gösterilir).
 */
export async function loadPrepMockResults(db: SupabaseClient, userId: string, prepId: string): Promise<PrepMockResult[]> {
  try {
    const { data: exams, error } = await db
      .from("practice_exams")
      .select("id, title")
      .eq("user_id", userId)
      .eq("exam_prep_id", prepId)
      .order("created_at", { ascending: false })
      .limit(60);
    if (error || !exams?.length) return [];
    const ids = exams.map((exam) => String(exam.id));
    const [{ data: attempts }, { data: questions }] = await Promise.all([
      db
        .from("practice_exam_attempts")
        .select("exam_id, score, completed_at")
        .eq("user_id", userId)
        .in("exam_id", ids)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(200),
      db.from("practice_exam_questions").select("exam_id").in("exam_id", ids).limit(4000),
    ]);
    const questionCounts = new Map<string, number>();
    for (const row of questions ?? []) {
      const id = String((row as { exam_id: string }).exam_id);
      questionCounts.set(id, (questionCounts.get(id) ?? 0) + 1);
    }
    return mockResultsFromRows({
      prepId,
      exams: exams.map((exam) => ({ id: String(exam.id), title: (exam.title as string | null) ?? null })),
      attempts: (attempts ?? []) as AttemptRow[],
      questionCounts,
    });
  } catch {
    return [];
  }
}
