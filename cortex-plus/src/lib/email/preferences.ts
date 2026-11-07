import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hashConsentIp, recordConsents } from "@/lib/legal/record-consent";
import { MARKETING_CONSENT_TEXT, MARKETING_CONSENT_VERSION } from "@/lib/legal/marketing-consent";
import { missingRelation } from "@/lib/learning/missing-column";

/*
  E-posta tercihleri (7 Kasım 2026). İki ayrı anahtar, ikisi de öğrencinin elinde:

  - `reminders` (`profiles.study_reminder_email`, varsayılan açık): çalışma hatırlatması ve sınava kalan gün. Hizmetin
    kendisinin bildirimi; her e-postada tek tıkla kapatma bağlantısı var.
  - `marketing` (`email_preferences.marketing`, varsayılan KAPALI): duyuru, yeni özellik ve davet kampanyası. Yalnız
    açık onayla açılır (kayıtta ya da Ayarlar'da, işaretli gelmez). Onay `consent_records`a da yazılır (zaman, kaynak,
    metin sürümü): bir itirazda "ne zaman, hangi metne izin verdi" sorusunun kanıtı.

  Hesapla ilgili bilgilendirme (doğrulama, ödeme, iade, hediye yazıldı, güvenlik) bu anahtarlara bağlı değildir.
*/

export type EmailPreferenceSource = "signup" | "settings" | "unsubscribe_link" | "admin";

export type EmailPreferences = { marketing: boolean; reminders: boolean };

export async function loadEmailPreferences(service: SupabaseClient, userId: string): Promise<EmailPreferences> {
  const [{ data: prefs, error: prefsError }, { data: profile }] = await Promise.all([
    service.from("email_preferences").select("marketing").eq("user_id", userId).maybeSingle(),
    service.from("profiles").select("study_reminder_email").eq("id", userId).maybeSingle(),
  ]);
  return {
    marketing: !prefsError && prefs?.marketing === true,
    // Sütun yoksa ya da satır okunamadıysa varsayılan (açık): hatırlatma tercihi `profiles`ın kendi kuralı.
    reminders: profile?.study_reminder_email !== false,
  };
}

/** Kampanya iznini açar ya da kapatır. Açarken `consent_records`a kanıt satırı yazılır. Başarılıysa true. */
export async function setMarketingPreference(
  service: SupabaseClient,
  userId: string,
  enabled: boolean,
  context: { source: EmailPreferenceSource; ip?: string | null },
): Promise<boolean> {
  const now = new Date().toISOString();
  const { error } = await service.from("email_preferences").upsert(
    {
      user_id: userId,
      marketing: enabled,
      marketing_changed_at: now,
      marketing_source: context.source,
      marketing_ip_hash: hashConsentIp(context.ip, userId),
      marketing_text_version: enabled ? MARKETING_CONSENT_VERSION : null,
    },
    { onConflict: "user_id" },
  );
  if (error) {
    if (!missingRelation(error)) console.error("email_preference_failed", { userId, error: error.message });
    return false;
  }
  if (enabled) {
    await recordConsents(service, {
      userId,
      ip: context.ip,
      items: [
        {
          type: "ticari_ileti",
          version: MARKETING_CONSENT_VERSION,
          acceptedAt: now,
          evidence: { text: MARKETING_CONSENT_TEXT, source: context.source },
        },
      ],
    }).catch(() => undefined);
  }
  return true;
}

/** Çalışma hatırlatması e-postasını açar ya da kapatır (uygulama içi bildirim etkilenmez). */
export async function setReminderPreference(service: SupabaseClient, userId: string, enabled: boolean): Promise<boolean> {
  const { error } = await service.from("profiles").update({ study_reminder_email: enabled }).eq("id", userId);
  if (error) {
    console.error("reminder_preference_failed", { userId, error: error.message });
    return false;
  }
  return true;
}

/**
 * Kayıttaki kampanya kutusu (işaretli gelmez). Kayıt ucu da tamamlama da çağırır: hesap için tercih satırı zaten
 * varsa dokunulmaz, yoksa abonelikten çıkmış birinin izni sayfa yenilenince yeniden açılırdı.
 */
export async function recordSignupMarketingConsent(
  service: SupabaseClient,
  userId: string,
  ip?: string | null,
): Promise<boolean> {
  const { data, error } = await service.from("email_preferences").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) return false;
  if (data) return true;
  return setMarketingPreference(service, userId, true, { source: "signup", ip });
}
