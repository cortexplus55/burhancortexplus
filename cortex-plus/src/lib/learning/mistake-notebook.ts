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
import { MASTERY_STREAK } from "@/lib/learning/mistake-notebook-rule";
export { MASTERY_STREAK };

export type MistakeSource = "deneme" | "quiz" | "true_false" | "lesson_check" | "podcast" | "chat";

export const MISTAKE_SOURCES: readonly MistakeSource[] = ["deneme", "quiz", "true_false", "lesson_check", "podcast", "chat"];

/**
 * Faz 11 (teacher.v2): öğretmen sohbetinden "Bunu Yanlışlar Defterime ekle" ile düşen soru. Sohbette doğru şık ve
 * anahtar yoktur (öğretmen adım adım ilerler); bu yüzden defter onu kendini yoklama kartı olarak sorar: öğrenci
 * soruyu yeniden düşünür ve iki seçenekten birini seçer. İlki "doğru" sayılır (üst üste iki kez → defterden çıkar).
 * Kayıtta `options` ve `correct_answer` boş kalır; seçenekler okurken eklenir.
 */
export const CHAT_SELF_CHECK_OPTIONS = ["Artık çözebiliyorum", "Hâlâ zorlanıyorum"] as const;

export type MistakeDraft = {
  source: MistakeSource;
  /**
   * Sorunun kimliği. Deneme sorusunun kimliği gerçek bir UUID'dir (`source_question_id`). Hazırlık yolundaki
   * etkinliklerin soruları ise satır değil, etkinlik içeriğindeki sıradır: `${attemptId}:q:0`, `:tf:1`, `:pc:2`,
   * `:lc:3` — bunlar `source_ref` sütununa yazılır (Faz 2 madde 3). UUID sütununa UUID olmayan metin yazmak
   * Postgres'te 22P02 verir ve eskiden bütün yazım sessizce düşüyordu.
   */
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
  const source = (MISTAKE_SOURCES as readonly string[]).includes(row.source) ? (row.source as MistakeSource) : "deneme";
  const stored = Array.isArray(row.options) ? (row.options as string[]) : [];
  return {
    id: row.id,
    source,
    topicLabel: row.topic_label,
    questionText: row.question_text,
    options: source === "chat" && !stored.length ? [...CHAT_SELF_CHECK_OPTIONS] : stored,
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Gerçek bir UUID mi (deneme sorusu). Yol kimlikleri (`…:q:0`) UUID değildir. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/** Taslağın veritabanındaki kimlik sütunları: UUID → `source_question_id`, diğer her şey → `source_ref`. */
export function mistakeIdentity(draft: Pick<MistakeDraft, "sourceQuestionId">): {
  source_question_id: string | null;
  source_ref: string | null;
} {
  const id = String(draft.sourceQuestionId ?? "").trim();
  if (isUuid(id)) return { source_question_id: id.toLowerCase(), source_ref: null };
  return { source_question_id: null, source_ref: id || null };
}

export type RecordMistakesResult = {
  ok: boolean;
  /** Yeni açılan + yeniden açılan (yanlış sayacı artan) satır sayısı. */
  savedCount: number;
  error: string | null;
};

type ExistingRow = {
  id: string;
  source: string;
  source_question_id: string | null;
  source_ref: string | null;
  wrong_count: number | null;
};

type DbError = { code?: string | null; message?: string | null } | null | undefined;

function logWriteFailure(step: string, error: DbError, extra: Record<string, unknown>) {
  console.error("mistake_notebook_write_failed", {
    step,
    code: error?.code ?? null,
    message: error?.message ?? null,
    ...extra,
  });
}

function keyOf(row: { source: string; source_question_id: string | null; source_ref: string | null }): string {
  return row.source_question_id ? `uuid:${row.source_question_id.toLowerCase()}` : `ref:${row.source}:${row.source_ref}`;
}

/**
 * Yanlışları deftere yazar.
 *
 * Aynı soru daha önce düşmüşse yeni satır açmıyor: yanlış sayacını artırıp
 * doğru serisini sıfırlıyor ve soruyu defterden geri çağırıyor. Yani bir kez
 * aşılmış bir soruyu yeniden yanlış yaparsan defterine geri dönüyor — çünkü
 * demek ki aşılmamış.
 *
 * Faz 2 (madde 3): hata yutulmaz. Her adımın hatası yapılandırılmış günlüğe iner ve sonuç
 * `{ ok, savedCount, error }` olarak döner; çağıran (deneme notlama, yol bitişi) kendi akışını
 * bozmadan sonucu görür.
 */
export async function recordMistakes(
  service: SupabaseClient,
  userId: string,
  drafts: MistakeDraft[],
): Promise<RecordMistakesResult> {
  if (!drafts.length) return { ok: true, savedCount: 0, error: null };

  // Aynı istek içinde aynı soru iki kez gelirse tek satır sayılır.
  const unique = new Map<string, MistakeDraft & { identity: ReturnType<typeof mistakeIdentity> }>();
  for (const draft of drafts) {
    const identity = mistakeIdentity(draft);
    if (!identity.source_question_id && !identity.source_ref) {
      logWriteFailure("validate", { code: "empty_id", message: "source id missing" }, { source: draft.source });
      continue;
    }
    const key = keyOf({ source: draft.source, ...identity });
    if (!unique.has(key)) unique.set(key, { ...draft, identity });
  }
  const list = [...unique.values()];
  if (!list.length) return { ok: false, savedCount: 0, error: "empty_id" };

  const uuids = list.map((d) => d.identity.source_question_id).filter((v): v is string => Boolean(v));
  const refs = list.map((d) => d.identity.source_ref).filter((v): v is string => Boolean(v));

  const reads = await Promise.all([
    uuids.length
      ? service
          .from("mistake_entries")
          .select("id, source, source_question_id, source_ref, wrong_count")
          .eq("user_id", userId)
          .in("source_question_id", uuids)
      : Promise.resolve({ data: [] as ExistingRow[], error: null }),
    refs.length
      ? service
          .from("mistake_entries")
          .select("id, source, source_question_id, source_ref, wrong_count")
          .eq("user_id", userId)
          .in("source_ref", refs)
      : Promise.resolve({ data: [] as ExistingRow[], error: null }),
  ]);
  for (const [index, read] of reads.entries()) {
    if (read.error) {
      logWriteFailure(index === 0 ? "read_uuid" : "read_ref", read.error, { count: index === 0 ? uuids.length : refs.length });
      return { ok: false, savedCount: 0, error: read.error.message ?? "read_failed" };
    }
  }

  const seen = new Map<string, { id: string; wrongCount: number }>();
  for (const row of [...(reads[0].data ?? []), ...(reads[1].data ?? [])] as ExistingRow[]) {
    seen.set(keyOf(row), { id: row.id, wrongCount: row.wrong_count ?? 1 });
  }

  let savedCount = 0;
  let firstError: string | null = null;

  const toRow = (d: (typeof list)[number]) => ({
    user_id: userId,
    source: d.source,
    source_question_id: d.identity.source_question_id,
    source_ref: d.identity.source_ref,
    topic_label: d.topicLabel,
    question_text: d.questionText,
    options: d.options,
    correct_answer: d.correctAnswer,
    first_wrong_answer: d.wrongAnswer,
    explanation: d.explanation,
  });

  const bump = async (hit: { id: string; wrongCount: number }) => {
    const { error } = await service
      .from("mistake_entries")
      .update({ wrong_count: hit.wrongCount + 1, correct_streak: 0, mastered_at: null })
      .eq("id", hit.id);
    if (error) {
      logWriteFailure("update", error, {});
      firstError ??= error.message ?? "update_failed";
      return;
    }
    savedCount += 1;
  };

  const fresh = list.filter((d) => !seen.has(keyOf({ source: d.source, ...d.identity })));
  if (fresh.length) {
    const { error } = await service.from("mistake_entries").insert(fresh.map(toRow));
    if (!error) {
      savedCount += fresh.length;
    } else if (error.code === "23505") {
      // Eşzamanlı iki bitiş aynı soruyu yazdı: satır satır dene; çakışan satır var olanın sayacını artırır.
      for (const draft of fresh) {
        const single = await service.from("mistake_entries").insert(toRow(draft));
        if (!single.error) {
          savedCount += 1;
          continue;
        }
        if (single.error.code !== "23505") {
          logWriteFailure("insert_row", single.error, { source: draft.source });
          firstError ??= single.error.message ?? "insert_failed";
          continue;
        }
        const column = draft.identity.source_question_id ? "source_question_id" : "source_ref";
        const value = draft.identity.source_question_id ?? draft.identity.source_ref;
        let lookup = service
          .from("mistake_entries")
          .select("id, wrong_count")
          .eq("user_id", userId)
          .eq(column, value as string);
        if (column === "source_ref") lookup = lookup.eq("source", draft.source);
        const { data: row, error: readError } = await lookup.maybeSingle();
        if (readError || !row) {
          logWriteFailure("conflict_read", readError ?? { code: "not_found", message: "conflict row missing" }, { source: draft.source });
          firstError ??= readError?.message ?? "conflict_read_failed";
          continue;
        }
        await bump({ id: row.id as string, wrongCount: (row.wrong_count as number) ?? 1 });
      }
    } else {
      logWriteFailure("insert", error, { count: fresh.length, sources: [...new Set(fresh.map((d) => d.source))] });
      firstError ??= error.message ?? "insert_failed";
    }
  }

  for (const draft of list) {
    const hit = seen.get(keyOf({ source: draft.source, ...draft.identity }));
    if (hit) await bump(hit);
  }

  return { ok: firstError === null, savedCount, error: firstError };
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
  firstWrongAnswer: string | null;
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
      "id, source, correct_answer, explanation, first_wrong_answer, correct_streak, review_count, wrong_count",
    )
    .eq("id", entryId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;

  // Sohbetten düşen soru kendini yoklama kartıdır: anahtar yok, "Artık çözebiliyorum" doğru sayılır.
  const selfCheck = data.source === "chat" && !(data.correct_answer as string | null)?.trim();
  const correct = selfCheck
    ? answer.trim() === CHAT_SELF_CHECK_OPTIONS[0]
    : (data.correct_answer as string | null)?.trim() === answer.trim();
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
    firstWrongAnswer: (data.first_wrong_answer as string | null) ?? null,
  };
}
