import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { setMarketingPreference } from "@/lib/email/preferences";
import {
  saveNotificationPreferences,
  type NotificationPreferences,
  type PreferenceKey,
  type PreferencePatch,
} from "@/lib/notifications/preferences";
import { STUDY_SLOTS, type StudyHour } from "@/lib/notifications/schedule";
import type { UnsubscribeCategory } from "@/lib/notifications/unsubscribe-links";

/**
 * Bildirim tercihleri uçlarının ortak parçaları (Faz 6, 20 Kasım 2026): Ayarlar (oturumlu), abonelikten çıkma sayfası
 * (anahtarlı, oturumsuz) ve e-postadaki tek tık (RFC 8058) aynı doğrulamadan ve aynı yazımdan geçer. Bütün yazım
 * sunucu anahtarıyla ve kullanıcı süzgeciyle; tarayıcı bu tablolara doğrudan yazmaz.
 */

const STUDY_HOURS: StudyHour[] = STUDY_SLOTS.map((slot) => slot.hour);

/** Değişiklik: dört anahtar ve çalışma saati (yalnız 18, 19, 20, 21); en az bir alan, bilinmeyen alan yok. */
export const preferencePatchSchema = z
  .object({
    studyRemindersEmail: z.boolean().optional(),
    examCountdownEmail: z.boolean().optional(),
    weeklyDigestEmail: z.boolean().optional(),
    inAppNotifications: z.boolean().optional(),
    preferredStudyHour: z.literal(STUDY_HOURS).optional(),
  })
  .strict()
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), { message: "empty_patch" });

export type PublicPreferences = Record<PreferenceKey, boolean> & { preferredStudyHour: StudyHour };

/** Tarayıcıya giden biçim: abonelikten çıkma anahtarı ve iç bayraklar gitmez. */
export function publicPreferences(preferences: NotificationPreferences): PublicPreferences {
  return {
    studyRemindersEmail: preferences.studyRemindersEmail,
    examCountdownEmail: preferences.examCountdownEmail,
    weeklyDigestEmail: preferences.weeklyDigestEmail,
    inAppNotifications: preferences.inAppNotifications,
    preferredStudyHour: preferences.preferredStudyHour,
  };
}

/**
 * Tercihi yazar. Hatırlatma anahtarı değiştiyse eski sütun (`profiles.study_reminder_email`) da aynı değere çekilir:
 * eski gönderim yolu ve `loadEmailPreferences` hâlâ oradan okuyor; kapatılan hatırlatma o yoldan da gitmesin. Eski
 * sütunun yazımı düşerse kayıt yine başarılı sayılır (asıl kaynak yeni tablo).
 */
export async function applyPreferencePatch(service: SupabaseClient, userId: string, patch: PreferencePatch): Promise<boolean> {
  const saved = await saveNotificationPreferences(service, userId, patch);
  if (!saved) return false;
  if (typeof patch.studyRemindersEmail === "boolean") {
    const { error } = await service
      .from("profiles")
      .update({ study_reminder_email: patch.studyRemindersEmail })
      .eq("id", userId);
    if (error) console.error("legacy_reminder_mirror_failed", { error: error.message });
  }
  return true;
}

/** Tek tıkla çıkış: yalnız o kategori kapanır. Kampanya izni yasal kanıtıyla kendi tablosunda kapatılır. */
export async function unsubscribeCategory(
  service: SupabaseClient,
  userId: string,
  category: UnsubscribeCategory,
  ip: string | null,
): Promise<boolean> {
  if (category === "marketing") {
    return setMarketingPreference(service, userId, false, { source: "unsubscribe_link", ip });
  }
  return applyPreferencePatch(service, userId, { [category]: false });
}
