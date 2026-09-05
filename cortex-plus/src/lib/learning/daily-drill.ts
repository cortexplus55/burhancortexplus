import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadOpenMistakes,
  toClientGroups,
  type MistakeQuestion,
  type MistakeTopicGroup,
} from "@/lib/learning/mistake-notebook";

/**
 * Günün turu.
 *
 * Defteri zaten `/yanlislarim` tekrar ettiriyor; buranın farkı sabit ve kısa
 * olması. Gün başında sorular seçilip donduruluyor, öğrenci gün içinde
 * dönebiliyor ve "bugünü bitirdim" diyebileceği bir son var. Defter sayfası
 * ise tek konuya odaklanmak isteyene.
 */
export const DAILY_SIZE = 10;

export type DailyDrill = {
  id: string;
  date: string;
  questions: MistakeQuestion[];
  answeredCount: number;
  correctCount: number;
  completed: boolean;
};

/**
 * Turun sorularını seçer.
 *
 * Konular arasında sırayla dolaşıyor: en çok yanlış yapılan konudan bir soru,
 * sonra diğerinden bir soru… Tek konudan on soru çekmek turu bir konu tekrarına
 * çevirirdi; oysa bunun işi günü açmak, bir konuyu bitirmek değil. Konu
 * bitirmek isteyen deftere gidiyor.
 *
 * Gruplar `loadOpenMistakes`'ten geldiği için zaten en çok yanlış yapılan
 * konu başta ve her grubun içi en çok yanlış yapılan soruyla başlıyor.
 */
export function pickDailySet(
  groups: { label: string; questions: MistakeQuestion[] }[],
  size = DAILY_SIZE,
): MistakeQuestion[] {
  const picked: MistakeQuestion[] = [];
  let round = 0;

  while (picked.length < size) {
    let addedThisRound = false;
    for (const group of groups) {
      const question = group.questions[round];
      if (!question) continue;
      picked.push(question);
      addedThisRound = true;
      if (picked.length === size) return picked;
    }
    if (!addedThisRound) break; // her grubun sorusu bitti
    round += 1;
  }

  return picked;
}

/** Bugünün tarihi, kullanıcının değil sunucunun takviminde (Europe/Istanbul). */
export function todayKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

type DrillRow = {
  id: string;
  drill_date: string;
  entry_ids: unknown;
  answered_count: number;
  correct_count: number;
  completed_at: string | null;
};

function orderByIds(
  groups: MistakeTopicGroup[],
  ids: string[],
): MistakeQuestion[] {
  const byId = new Map(
    toClientGroups(groups).flatMap((g) => g.questions.map((q) => [q.id, q])),
  );
  return ids
    .map((id) => byId.get(id))
    .filter((q): q is MistakeQuestion => Boolean(q));
}

/**
 * Bugünün turunu getirir, yoksa açar.
 *
 * Aşılmış sorular turdan düşüyor: dondurma kararı soruyu sabitlemek içindi,
 * öğrenciyi zaten çözdüğü soruya geri döndürmek için değil. Bu yüzden
 * dondurulmuş kimlikler her okumada defterin güncel hâliyle kesiştiriliyor.
 */
export async function getOrCreateDailyDrill(
  supabase: SupabaseClient,
  userId: string,
): Promise<DailyDrill | null> {
  const date = todayKey();
  const groups = await loadOpenMistakes(supabase, userId);

  const { data: existing } = await supabase
    .from("daily_drills")
    .select("id, drill_date, entry_ids, answered_count, correct_count, completed_at")
    .eq("user_id", userId)
    .eq("drill_date", date)
    .maybeSingle();

  if (existing) {
    const row = existing as DrillRow;
    const ids = Array.isArray(row.entry_ids) ? (row.entry_ids as string[]) : [];
    return {
      id: row.id,
      date: row.drill_date,
      questions: orderByIds(groups, ids),
      answeredCount: row.answered_count,
      correctCount: row.correct_count,
      completed: row.completed_at !== null,
    };
  }

  const picked = pickDailySet(toClientGroups(groups));
  if (!picked.length) return null;

  const { data: created } = await supabase
    .from("daily_drills")
    .insert({
      user_id: userId,
      drill_date: date,
      entry_ids: picked.map((q) => q.id),
    })
    .select("id, drill_date, entry_ids, answered_count, correct_count, completed_at")
    .maybeSingle();

  if (!created) return null;

  const row = created as DrillRow;
  return {
    id: row.id,
    date: row.drill_date,
    questions: picked,
    answeredCount: 0,
    correctCount: 0,
    completed: false,
  };
}

/** Tura verilen bir yanıtı sayaçlara işler. */
export async function recordDrillAnswer(
  supabase: SupabaseClient,
  userId: string,
  drillId: string,
  correct: boolean,
  total: number,
): Promise<void> {
  const { data } = await supabase
    .from("daily_drills")
    .select("answered_count, correct_count")
    .eq("id", drillId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return;

  const answered = ((data.answered_count as number) ?? 0) + 1;
  const correctCount =
    ((data.correct_count as number) ?? 0) + (correct ? 1 : 0);

  await supabase
    .from("daily_drills")
    .update({
      answered_count: answered,
      correct_count: correctCount,
      completed_at: answered >= total ? new Date().toISOString() : null,
    })
    .eq("id", drillId)
    .eq("user_id", userId);
}
