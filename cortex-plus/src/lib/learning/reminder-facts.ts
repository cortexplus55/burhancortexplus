import type { SupabaseClient } from "@supabase/supabase-js";

/*
  Günlük hatırlatmanın sayıları (31 Ekim 2026, lansman zırhı; göç 20261031163000).

  Cron hazırlıkları 100'erli sayfalarla okur ve her sayfanın sayılarını SQL'den hazırlık/öğrenci başına tek satırla
  alır. Eskiden bütün hazırlıklar tek sorguda okunuyordu (PostgREST en çok 1.000 satır döndürür), sonra kimlikler
  `.in()` ile URL'ye yazılıyordu (yüzlerce kimlik uzun adres olur, istek düşer) ve düğümler satır satır sayılıyordu
  (100 hazırlığın düğümleri 1.000 satırı geçince bitmemiş yol "bitmiş" sayılıyordu). Fonksiyonlar yoksa (göçten önce)
  eski sorgular sayfa başına çalışır.

  Sınav tarihi olmayan hazırlık da hatırlatılır (eskiden `exam_date >= bugün` süzgeci onları hiç seçmiyordu); ama
  yalnız son 21 günde kurulmuş ya da üzerinde çalışılmışsa — bırakılmış bir hazırlık için her gün e-posta gitmesin.
*/

export const REMINDER_PAGE = 100;
export const UNDATED_ACTIVE_DAYS = 21;

export type ReminderPrep = {
  id: string;
  user_id: string;
  title: string | null;
  exam_date: string | null;
  created_at: string | null;
};

export async function* reminderPrepPages(service: SupabaseClient, today: string): AsyncGenerator<ReminderPrep[]> {
  for (let from = 0; ; from += REMINDER_PAGE) {
    const { data, error } = await service
      .from("exam_preps")
      .select("id, user_id, title, exam_date, created_at")
      .or(`exam_date.gte.${today},exam_date.is.null`)
      .order("id")
      .range(from, from + REMINDER_PAGE - 1);
    if (error || !data?.length) return;
    yield data as ReminderPrep[];
    if (data.length < REMINDER_PAGE) return;
  }
}

export async function unfinishedPrepIds(service: SupabaseClient, prepIds: string[]): Promise<Set<string>> {
  const { data, error } = await service.rpc("reminder_unfinished_preps", { p_prep_ids: prepIds });
  if (!error && Array.isArray(data)) {
    return new Set((data as { exam_prep_id: string }[]).map((row) => row.exam_prep_id));
  }
  const { data: nodes } = await service
    .from("exam_prep_nodes")
    .select("exam_prep_id, status")
    .in("exam_prep_id", prepIds)
    .neq("status", "done");
  return new Set((nodes ?? []).map((node) => node.exam_prep_id as string));
}

export async function lastActivityByUser(service: SupabaseClient, userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const { data, error } = await service.rpc("reminder_last_activity", { p_user_ids: userIds });
  if (!error && Array.isArray(data)) {
    for (const row of data as { user_id: string; last_at: string | null }[]) if (row.last_at) out.set(row.user_id, row.last_at);
    return out;
  }
  const { data: attempts } = await service
    .from("exam_prep_node_attempts")
    .select("user_id, updated_at")
    .in("user_id", userIds)
    .order("updated_at", { ascending: false })
    .limit(1000);
  for (const attempt of attempts ?? []) {
    const userId = attempt.user_id as string;
    if (!out.has(userId)) out.set(userId, attempt.updated_at as string);
  }
  return out;
}

export async function dueReviewsByPrep(service: SupabaseClient, prepIds: string[], day: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const { data, error } = await service.rpc("reminder_due_reviews", { p_prep_ids: prepIds, p_day: day });
  if (!error && Array.isArray(data)) {
    for (const row of data as { exam_prep_id: string; due: number }[]) out.set(row.exam_prep_id, Number(row.due) || 0);
    return out;
  }
  // Tablo yoksa sorgu hata verir: liste boş, hatırlatma eski kuralla.
  const { data: rows } = await service
    .from("exam_prep_review_items")
    .select("exam_prep_id")
    .in("exam_prep_id", prepIds)
    .eq("status", "active")
    .lte("due_on", day)
    .limit(1000);
  for (const row of (rows ?? []) as { exam_prep_id: string }[]) {
    out.set(row.exam_prep_id, (out.get(row.exam_prep_id) ?? 0) + 1);
  }
  return out;
}

/** Tarihsiz hazırlık yalnız yakın zamanda kurulmuş ya da üzerinde çalışılmışsa hatırlatılır. */
export function undatedPrepIsLive(
  prep: Pick<ReminderPrep, "exam_date" | "created_at">,
  lastActivity: string | undefined,
  now: Date,
): boolean {
  if (prep.exam_date) return true;
  const cutoff = now.getTime() - UNDATED_ACTIVE_DAYS * 24 * 60 * 60 * 1000;
  const recent = (value: string | null | undefined) => Boolean(value) && Date.parse(String(value)) >= cutoff;
  return recent(prep.created_at) || recent(lastActivity);
}

/** Sınırlı eşzamanlılıkla iş kuyruğu; süre dolunca yeni iş başlatmaz. Kaç işin yapıldığını döndürür. */
export async function runWithBudget<T>(
  items: readonly T[],
  worker: (item: T) => Promise<boolean>,
  options: { concurrency: number; deadline: number; now?: () => number },
): Promise<{ done: number; skipped: number }> {
  const now = options.now ?? Date.now;
  let next = 0;
  let done = 0;
  let skipped = 0;
  const lane = async () => {
    while (next < items.length) {
      if (now() >= options.deadline) {
        skipped += items.length - next;
        next = items.length;
        return;
      }
      const item = items[next++]!;
      if (await worker(item).catch(() => false)) done += 1;
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, options.concurrency) }, lane));
  return { done, skipped };
}
