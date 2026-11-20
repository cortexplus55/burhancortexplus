import { QUIET_END_HOUR, QUIET_START_HOUR } from "@/lib/notifications/schedule";

/**
 * Bildirim tercihleri ekranlarının metinleri (Faz 6, 20 Kasım 2026): Ayarlar'daki panel ve e-postadaki bağlantının
 * açtığı sayfa aynı cümleleri kullanır. Gece sessizliğinin saatleri gönderim kuralının kendisinden (`schedule.ts`).
 */

const clock = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

export const QUIET_HOURS_NOTE = `Gece ${clock(QUIET_START_HOUR)}–${clock(QUIET_END_HOUR)} arası hatırlatma e-postası göndermeyiz; ödeme ve hesap e-postaları bu kurala tabi değildir.`;

export const STUDY_TIME_TITLE = "Hatırlatma saati";
export const STUDY_TIME_HINT = "Çalışma hatırlatması bu saatte gelir (Türkiye saati).";

export const PREFERENCE_SAVE_ERROR = "Tercihin kaydedilemedi. Biraz sonra yeniden dene.";
export const PREFERENCE_SAVED = "Kaydedildi.";

export const INVALID_PREFERENCE_LINK = "Bağlantı geçersiz ya da süresi doldu.";

export const ALL_OFF_LABEL = "Hepsini kapat";
export const ALL_OFF_DONE = "Bütün bildirim ve hatırlatma e-postaları kapandı.";

export const MARKETING_OFF_LABEL = "Duyuru ve kampanya e-postalarından çık";
export const MARKETING_OFF_DONE = "Tamam, artık duyuru ve kampanya e-postası göndermeyeceğiz.";
export const MARKETING_ALREADY_OFF = "Duyuru ve kampanya e-postası almıyorsun.";
