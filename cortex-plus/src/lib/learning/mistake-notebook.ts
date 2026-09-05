import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Yanlış defteri.
 *
 * Öğrencinin denemede ya da quizde yanlış yaptığı sorular burada birikiyor ve
 * doğru yapılana kadar karşısına çıkmaya devam ediyor.
 *
 * Neden "bir kez doğru yaptın, tamam" demiyoruz: bir soruyu bir kez doğru
 * yapmak onu bildiğini kanıtlamıyor — dört şıkta bir isabet zaten dörtte bir.
 * Üst üste iki doğru istiyoruz ve arada bir yanlış girerse sayaç sıfırlanıyor.
 * Rakam keyfî değil, tek doğrunun şans olma ihtimalini düşürecek en küçük
 * sayı; daha büyüğü öğrenciyi bildiği soruda oyalardı.
 */
export const MASTERY_STREAK = 2;

export type MistakeSource = "deneme" | "quiz";

export type MistakeDraft = {
  source: MistakeSource;
  sourceQuestionId: string;
  topicLabel: string | null;
  questionText: string;
  options: string[] | null;
  correctAnswer: string | null;
  wrongAnswer: string | null;
  explanation: string | null;
};

export type MistakeEntry = {
  id: string;
  source: MistakeSource;
  topicLabel: string | null;
  questionText: string;
  options: string[];
  correctAnswer: string | null;
  firstWrongAnswer: string | null;
  explanation: string | null;
  wrongCount: number;
  reviewCount: number;
  correctStreak: number;
  masteredAt: string | null;
};

export type MistakeTopicGroup = {
  label: string;
  entries: MistakeEntry[];
};

/**
 * Sorunun tarayıcıya gidebilecek hâli.
 *
 * `correctAnswer` ve `explanation` bilerek yok. Defter sayfası soruları
 * sunucudan basıyor; doğru yanıt da paketin içinde gitseydi sayfanın
 * kaynağına bakan öğrenci defteri kandırabilir, defter de neyi bilmediğini
 * değil neyi kopyaladığını ölçmeye başlardı.
 */
export type MistakeQuestion = {
  id: string;
  source: MistakeSource;
  topicLabel: string | null;
  questionText: string;
  options: string[];
  wrongCount: number;
  correctStreak: number;
};

export type MistakeQuestionGroup = { label: string; questions: MistakeQuestion[] };

export function toClientGroups(
  groups: MistakeTopicGroup[],
): MistakeQuestionGroup[] {
  return groups.map((group) => ({
    label: group.label,
    questions: group.entries.map((entry) => ({
      id: entry.id,
      source: entry.source,
      topicLabel: entry.topicLabel,
      questionText: entry.questionText,
      options: entry.options,
      wrongCount: entry.wrongCount,
      correctStreak: entry.correctStreak,
    })),
  }));
}

type Row = {
  id: string;
  source: string;
  topic_label: string | null;
  question_text: string;
  options: unknown;
  correct_answer: string | null;
  first_wrong_answer: string | null;
  explanation: string | null;
  wrong_count: number;
  review_count: number;
  correct_streak: number;
  mastered_at: string | null;
};

const SELECT =
  "id, source, topic_label, question_text, options, correct_answer, first_wrong_answer, explanation, wrong_count, review_count, correct_streak, mastered_at";

function toEntry(row: Row): MistakeEntry {
  return {
    id: row.id,
    source: row.source === "quiz" ? "quiz" : "deneme",
    topicLabel: row.topic_label,
    questionText: row.question_text,
    options: Array.isArray(row.options) ? (row.options as string[]) : [],
    correctAnswer: row.correct_answer,
    firstWrongAnswer: row.first_wrong_answer,
    explanation: row.explanation,
    wrongCount: row.wrong_count,
    reviewCount: row.review_count,
    correctStreak: row.correct_streak,
    masteredAt: row.mastered_at,
  };
}

/** Konusuz sorular tek bir başlık altında toplanıyor, dağılmasınlar. */
const UNLABELLED = "Konusu belirsiz";

/**
 * Yanlışları deftere yazar.
 *
 * Aynı soru daha önce düşmüşse yeni satır açmıyor: yanlış sayacını artırıp
 * doğru serisini sıfırlıyor ve soruyu defterden geri çağırıyor. Yani bir kez
 * aşılmış bir soruyu yeniden yanlış yaparsan defterine geri dönüyor — çünkü
 * demek ki aşılmamış.
 */
export async function recordMistakes(
  service: SupabaseClient,
  userId: string,
  drafts: MistakeDraft[],
): Promise<void> {
  if (!drafts.length) return;

  const ids = drafts.map((d) => d.sourceQuestionId);
  const { data: existing } = await service
    .from("mistake_entries")
    .select("id, source_question_id, wrong_count")
    .eq("user_id", userId)
    .in("source_question_id", ids);

  const seen = new Map(
    (existing ?? []).map((row) => [
      row.source_question_id as string,
      { id: row.id as string, wrongCount: (row.wrong_count as number) ?? 1 },
    ]),
  );

  const fresh = drafts.filter((d) => !seen.has(d.sourceQuestionId));
  if (fresh.length) {
    await service.from("mistake_entries").insert(
      fresh.map((d) => ({
        user_id: userId,
        source: d.source,
        source_question_id: d.sourceQuestionId,
        topic_label: d.topicLabel,
        question_text: d.questionText,
        options: d.options,
        correct_answer: d.correctAnswer,
        first_wrong_answer: d.wrongAnswer,
        explanation: d.explanation,
      })),
    );
  }

  for (const draft of drafts) {
    const hit = seen.get(draft.sourceQuestionId);
    if (!hit) continue;
    await service
      .from("mistake_entries")
      .update({
        wrong_count: hit.wrongCount + 1,
        correct_streak: 0,
        mastered_at: null,
      })
      .eq("id", hit.id);
  }
}

/** Defterdeki bekleyen sorular, konuya göre gruplu; en çok yanlış yapılan üstte. */
export async function loadOpenMistakes(
  supabase: SupabaseClient,
  userId: string,
  limit = 200,
): Promise<MistakeTopicGroup[]> {
  const { data } = await supabase
    .from("mistake_entries")
    .select(SELECT)
    .eq("user_id", userId)
    .is("mastered_at", null)
    .order("wrong_count", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);

  const groups = new Map<string, MistakeEntry[]>();
  for (const row of (data ?? []) as Row[]) {
    const entry = toEntry(row);
    const key = entry.topicLabel?.trim() || UNLABELLED;
    const bucket = groups.get(key);
    if (bucket) bucket.push(entry);
    else groups.set(key, [entry]);
  }

  return [...groups.entries()]
    .map(([label, entries]) => ({ label, entries }))
    .sort((a, b) => b.entries.length - a.entries.length);
}

export type NotebookCounts = { open: number; mastered: number };

export async function countMistakes(
  supabase: SupabaseClient,
  userId: string,
): Promise<NotebookCounts> {
  const [open, mastered] = await Promise.all([
    supabase
      .from("mistake_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("mastered_at", null),
    supabase
      .from("mistake_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .not("mastered_at", "is", null),
  ]);

  return { open: open.count ?? 0, mastered: mastered.count ?? 0 };
}

export type ReviewState = {
  correctStreak: number;
  reviewCount: number;
  wrongCount: number;
  masteredAt: string | null;
};

/**
 * Bir yanıtın defterdeki durumu nasıl değiştirdiği.
 *
 * Veritabanından ayrı tutuluyor ki kural test edilebilsin: "üst üste iki
 * doğru" ve "araya giren yanlış seriyi sıfırlar" bu ürünün öğrenme
 * varsayımı, sessizce bozulmamalı.
 */
export function nextReviewState(
  current: Pick<ReviewState, "correctStreak" | "reviewCount" | "wrongCount">,
  correct: boolean,
  now: string,
): ReviewState {
  const correctStreak = correct ? current.correctStreak + 1 : 0;
  return {
    correctStreak,
    reviewCount: current.reviewCount + 1,
    wrongCount: correct ? current.wrongCount : current.wrongCount + 1,
    masteredAt: correctStreak >= MASTERY_STREAK ? now : null,
  };
}

export type ReviewOutcome = {
  correct: boolean;
  correctStreak: number;
  mastered: boolean;
  /**
   * Doğru yanıt ve açıklama yalnızca yanıt verildikten SONRA dönüyor.
   * Soruyla birlikte gönderilseydi öğrenci sayfanın kaynağından okuyabilirdi
   * ve defter kendi ölçtüğü şeyi bozardı.
   */
  correctAnswer: string | null;
  explanation: string | null;
};

/**
 * Defterden sorulan bir soruya verilen yanıtı işler.
 *
 * Doğru yanıt serinin ucuna ekleniyor; seri hedefe ulaştığında soru defterden
 * çıkıyor. Yanlış yanıt seriyi sıfırlıyor ve yanlış sayacını artırıyor — yani
 * ısrarla yanlış yapılan soru listenin daha da üstüne çıkıyor.
 */
export async function reviewMistake(
  supabase: SupabaseClient,
  userId: string,
  entryId: string,
  answer: string,
): Promise<ReviewOutcome | null> {
  const { data } = await supabase
    .from("mistake_entries")
    .select(
      "id, correct_answer, explanation, correct_streak, review_count, wrong_count",
    )
    .eq("id", entryId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;

  const correct =
    (data.correct_answer as string | null)?.trim() === answer.trim();
  const now = new Date().toISOString();

  const next = nextReviewState(
    {
      correctStreak: (data.correct_streak as number) ?? 0,
      reviewCount: (data.review_count as number) ?? 0,
      wrongCount: (data.wrong_count as number) ?? 1,
    },
    correct,
    now,
  );

  await supabase
    .from("mistake_entries")
    .update({
      correct_streak: next.correctStreak,
      review_count: next.reviewCount,
      wrong_count: next.wrongCount,
      mastered_at: next.masteredAt,
      last_reviewed_at: now,
    })
    .eq("id", entryId)
    .eq("user_id", userId);

  return {
    correct,
    correctStreak: next.correctStreak,
    mastered: next.masteredAt !== null,
    correctAnswer: (data.correct_answer as string | null) ?? null,
    explanation: (data.explanation as string | null) ?? null,
  };
}
