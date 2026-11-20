import type { SupabaseClient } from "@supabase/supabase-js";
import { missingRelation } from "@/lib/learning/missing-column";
import { DEFAULT_STUDY_HOUR, isStudyHour, type StudyHour } from "@/lib/notifications/schedule";

/**
 * Bildirim ve e-posta tercihleri (Faz 6, 20 Kasım 2026): `user_notification_preferences`, öğrenci başına tek satır.
 * Satır yoksa bütün anahtarlar açık ve saat 19:00. Satır, ilk ihtiyaçta (tercih değişikliği ya da abonelikten çıkma
 * bağlantılı ilk e-posta) açılır; abonelikten çıkma anahtarı satırla birlikte veritabanında doğar.
 *
 * Kampanya (pazarlama) izni burada değil: yasal onay kanıtıyla `email_preferences`te kalır (`lib/email/preferences.ts`).
 *
 * Tablo henüz yoksa (göç kod yayınından sonra uygulanır) eski hatırlatma sütunu (`profiles.study_reminder_email`)
 * okunur ve yazılır; öbür anahtarlar açık sayılır, abonelikten çıkma eski imzalı bağlantıyla yapılır.
 */

export type PreferenceKey = "studyRemindersEmail" | "examCountdownEmail" | "weeklyDigestEmail" | "inAppNotifications";

export type NotificationPreferences = Record<PreferenceKey, boolean> & {
  preferredStudyHour: StudyHour;
  /** Abonelikten çıkma anahtarı; satır yoksa ya da tablo yoksa null. */
  unsubscribeToken: string | null;
  /** Tablo yok: eski sütundan okundu. */
  legacy: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  studyRemindersEmail: true,
  examCountdownEmail: true,
  weeklyDigestEmail: true,
  inAppNotifications: true,
  preferredStudyHour: DEFAULT_STUDY_HOUR,
  unsubscribeToken: null,
  legacy: false,
};

const COLUMNS =
  "user_id, study_reminders_email, exam_countdown_email, weekly_digest_email, in_app_notifications, preferred_study_hour, unsubscribe_token";

const COLUMN_OF: Record<PreferenceKey, string> = {
  studyRemindersEmail: "study_reminders_email",
  examCountdownEmail: "exam_countdown_email",
  weeklyDigestEmail: "weekly_digest_email",
  inAppNotifications: "in_app_notifications",
};

/** Kullanıcıya gösterilen adlar (Ayarlar ve abonelikten çıkma sayfası aynı adları kullanır). */
export const PREFERENCE_LABELS: Record<PreferenceKey, { title: string; hint: string }> = {
  studyRemindersEmail: {
    title: "Çalışma ve plan hatırlatmaları",
    hint: "Kaldığın yer, açık kalan sınav tuzakları ve planının bitişine yaklaşınca e-posta.",
  },
  examCountdownEmail: {
    title: "Sınav öncesi e-postası",
    hint: "Sınavına 2 gün ve 1 gün kala özet ve tekrar bağlantısı.",
  },
  weeklyDigestEmail: {
    title: "Haftalık karne",
    hint: "Pazar akşamı haftanın özeti ve Pazartesi'nin ilk adımı.",
  },
  inAppNotifications: {
    title: "Uygulama içi bildirimler",
    hint: "Çandaki bildirimler: hazır olan video ve podcast, öğrenilen konu, yeni sınav tuzağı.",
  },
};

type Row = {
  user_id: string;
  study_reminders_email: boolean | null;
  exam_countdown_email: boolean | null;
  weekly_digest_email: boolean | null;
  in_app_notifications: boolean | null;
  preferred_study_hour: number | null;
  unsubscribe_token: string | null;
};

export function preferencesFromRow(row: Partial<Row> | null | undefined): NotificationPreferences {
  if (!row) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  return {
    studyRemindersEmail: row.study_reminders_email !== false,
    examCountdownEmail: row.exam_countdown_email !== false,
    weeklyDigestEmail: row.weekly_digest_email !== false,
    inAppNotifications: row.in_app_notifications !== false,
    preferredStudyHour: isStudyHour(row.preferred_study_hour) ? row.preferred_study_hour : DEFAULT_STUDY_HOUR,
    unsubscribeToken: row.unsubscribe_token ?? null,
    legacy: false,
  };
}

async function legacyPreferences(service: SupabaseClient, userIds: string[]): Promise<Map<string, NotificationPreferences>> {
  const out = new Map<string, NotificationPreferences>();
  for (let from = 0; from < userIds.length; from += 100) {
    const { data } = await service
      .from("profiles")
      .select("id, study_reminder_email")
      .in("id", userIds.slice(from, from + 100));
    for (const row of (data ?? []) as { id: string; study_reminder_email: boolean | null }[]) {
      out.set(row.id, { ...DEFAULT_NOTIFICATION_PREFERENCES, studyRemindersEmail: row.study_reminder_email !== false, legacy: true });
    }
  }
  for (const id of userIds) if (!out.has(id)) out.set(id, { ...DEFAULT_NOTIFICATION_PREFERENCES, legacy: true });
  return out;
}

/** Çok kullanıcının tercihleri (cron). Satırı olmayan varsayılanı alır. Okuma düşerse null (çağıran göndermez). */
export async function loadPreferencesMap(
  service: SupabaseClient,
  userIds: readonly string[],
): Promise<Map<string, NotificationPreferences> | null> {
  const ids = [...new Set(userIds)];
  const out = new Map<string, NotificationPreferences>();
  for (let from = 0; from < ids.length; from += 100) {
    const slice = ids.slice(from, from + 100);
    const { data, error } = await service.from("user_notification_preferences").select(COLUMNS).in("user_id", slice);
    if (error) {
      if (missingRelation(error)) return legacyPreferences(service, ids);
      console.error("notification_preferences_read_failed", { error: error.message });
      return null;
    }
    for (const row of (data ?? []) as Row[]) out.set(row.user_id, preferencesFromRow(row));
  }
  for (const id of ids) if (!out.has(id)) out.set(id, { ...DEFAULT_NOTIFICATION_PREFERENCES });
  return out;
}

export async function loadNotificationPreferences(service: SupabaseClient, userId: string): Promise<NotificationPreferences> {
  const map = await loadPreferencesMap(service, [userId]);
  return map?.get(userId) ?? { ...DEFAULT_NOTIFICATION_PREFERENCES };
}

/**
 * Satırı açar (yoksa) ve abonelikten çıkma anahtarını döndürür. Tablo yoksa null: çağıran eski imzalı bağlantıyı
 * kullanır.
 */
export async function ensureUnsubscribeToken(service: SupabaseClient, userId: string): Promise<string | null> {
  const read = await service.from("user_notification_preferences").select("unsubscribe_token").eq("user_id", userId).maybeSingle();
  if (read.error) {
    if (!missingRelation(read.error)) console.error("notification_token_read_failed", { error: read.error.message });
    return null;
  }
  if (read.data?.unsubscribe_token) return read.data.unsubscribe_token as string;
  const { data, error } = await service
    .from("user_notification_preferences")
    .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true })
    .select("unsubscribe_token")
    .maybeSingle();
  if (!error && data?.unsubscribe_token) return data.unsubscribe_token as string;
  // Eşzamanlı iki istek: öbürü satırı açtı.
  const again = await service.from("user_notification_preferences").select("unsubscribe_token").eq("user_id", userId).maybeSingle();
  return (again.data?.unsubscribe_token as string | undefined) ?? null;
}

export type PreferencePatch = Partial<Record<PreferenceKey, boolean>> & { preferredStudyHour?: StudyHour };

/** Tercihleri yazar. Tablo yoksa yalnız hatırlatma anahtarı eski sütuna yazılabilir; başka alan varsa false. */
export async function saveNotificationPreferences(
  service: SupabaseClient,
  userId: string,
  patch: PreferencePatch,
): Promise<boolean> {
  const row: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() };
  for (const key of Object.keys(COLUMN_OF) as PreferenceKey[]) {
    if (typeof patch[key] === "boolean") row[COLUMN_OF[key]] = patch[key];
  }
  if (patch.preferredStudyHour !== undefined) {
    if (!isStudyHour(patch.preferredStudyHour)) return false;
    row.preferred_study_hour = patch.preferredStudyHour;
  }
  const { error } = await service.from("user_notification_preferences").upsert(row, { onConflict: "user_id" });
  if (!error) return true;
  if (!missingRelation(error)) {
    console.error("notification_preferences_write_failed", { error: error.message });
    return false;
  }
  const only = Object.keys(row).filter((key) => key !== "user_id" && key !== "updated_at");
  if (only.length !== 1 || only[0] !== "study_reminders_email") return false;
  const legacy = await service.from("profiles").update({ study_reminder_email: patch.studyRemindersEmail }).eq("id", userId);
  return !legacy.error;
}

/** Abonelikten çıkma bağlantısının anahtarından hesap (oturumsuz). Biçim uymazsa ya da bulunmazsa null. */
export async function preferencesByToken(
  service: SupabaseClient,
  token: string | null | undefined,
): Promise<{ userId: string; preferences: NotificationPreferences } | null> {
  const clean = String(token ?? "").trim();
  if (!/^[0-9a-f]{64}$/.test(clean)) return null;
  const { data, error } = await service.from("user_notification_preferences").select(COLUMNS).eq("unsubscribe_token", clean).maybeSingle();
  if (error || !data) return null;
  const row = data as Row;
  return { userId: row.user_id, preferences: preferencesFromRow(row) };
}
