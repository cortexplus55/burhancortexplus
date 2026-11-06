/**
 * Teknik kodların gündelik Türkçe karşılıkları.
 *
 * İşlem geçmişinde "credit_rule.updated", kredi bedellerinde
 * "IMAGE_SOLUTION" gibi kodlar duruyordu. Bunlar veritabanının dili;
 * yönetim panelini kullanan kişinin bilmesi gerekmiyor. Kod yine gösteriliyor
 * ama küçük ve ikincil — asıl satır artık okunabilir bir cümle.
 */

/** İşlem geçmişindeki kayıtlar. */
export const AUDIT_LABELS: Record<string, string> = {
  "credit_rule.updated": "Bir işlemin kredi bedeli değiştirildi",
  "credits.granted": "Kullanıcıya kredi verildi",
  "credits.adjusted": "Kullanıcının kredisi değiştirildi",
  "feature_flag.toggled": "Bir özellik açıldı ya da kapatıldı",
  "payment.refunded": "Ödeme iade edildi olarak işaretlendi",
  "plan.updated": "Paket bilgileri güncellendi",
  "promo.created": "Kampanya kodu oluşturuldu",
  "promo.enabled": "Kampanya kodu açıldı",
  "promo.disabled": "Kampanya kodu kapatıldı",
  "promo.beta_batch_created": "Toplu beta kodları üretildi",
  "promo.beta_shared_created": "Ortak beta kodu oluşturuldu",
  "cockpit.fx_rate.saved": "Dolar kuru kaydedildi",
  "cockpit.spend_cap.saved": "Günlük harcama tavanı kaydedildi",
  "prompt.activated": "Bir AI talimatı yayına alındı",
  "role.granted": "Kullanıcıya yetki verildi",
  "role.revoked": "Kullanıcının yetkisi geri alındı",
  "smtp.verify_ok": "E-posta bağlantısı test edildi ve çalıştı",
  "teacher_application.reviewed": "Öğretmen başvurusu sonuçlandırıldı",
  "admin_role.granted": "Bir hesaba yönetici yetkisi verildi",
  "admin_role.revoked": "Bir hesabın yönetici yetkisi geri alındı",
  "admin_gate.passed": "Kurucu yönetim girişi PIN ile doğrulandı",
  "admin_gate.wrong": "Kurucu yönetim girişinde yanlış PIN",
  "admin_gate.locked": "Kurucu yönetim girişi çok fazla yanlış PIN yüzünden kilitlendi",
  "admin_gate.misconfigured": "Kurucu yönetim girişi ayarı okunamadı",
  "admin_gate.locked_by_user": "Yönetim girişi bu cihazda kilitlendi",
};

/** Kredi bedeli tablosundaki işlem kodları. */
export const ACTION_LABELS: Record<string, string> = {
  CHAT_MESSAGE: "Sohbette bir soru sorma",
  IMAGE_SOLUTION: "Fotoğraftan soru çözme",
  QUIZ_GENERATE: "Konu testi üretme",
  FLASHCARD_GENERATE: "Kart seti üretme",
  EXAM_GENERATE: "Deneme sınavı üretme",
  STUDY_PLAN_GENERATE: "Ders üretme",
  DOCUMENT_PAGE_PROCESS: "Yüklenen dokümanın bir sayfasını işleme",
  DOCUMENT_SCAN_PAGE: "Taranmış sayfa okuma (ek)",
  PODCAST_GENERATE: "Podcast üretme",
  ORAL_EXAM: "Sözlü sınav",
  ORAL_EXAM_GENERATE: "Sözlü deneme",
  VOICE_TURN: "Sesli sohbet turu",
  AI_CHAT_STANDARD: "Sohbet mesajı",
  PRACTICE_EXAM_GENERATE: "Yazılı deneme sınavı",
  WRITTEN_EXAM: "Yazılı sınav değerlendirme",
  // Kullanım kaydındaki (ai_usage_events) iç kodlar: öğrenciden kredi düşmeyen işler de burada sayılır.
  AI_CHAT_ADVANCED: "Sohbet mesajı (ayrıntılı)",
  AI_CHAT_PARENT: "Veli sohbeti",
  PRACTICE_EXAM_GRADE: "Yazılı deneme notlama",
  VIDEO_GENERATE: "Video ders üretme",
  SKETCH_VIDEO_GENERATE: "Çizimli video üretme",
  AUDIO_SYNTHESIZE: "Seslendirme",
  TTS_SYNTHESIZE: "Seslendirme (metinden sese)",
  STT_TRANSCRIBE: "Sesi yazıya çevirme",
  DOCUMENT_CLEAN: "Belge sayfasını temizleme",
  DOCUMENT_SUPPLEMENT_GENERATE: "Ünite eki üretme",
  TOPIC_MAP_OUTLINE: "Konu haritası çıkarma",
  TOPIC_MAP_GROUP: "Konuları gruplama",
  TOPIC_UNITS: "Kavram birimleri çıkarma",
  PREP_TITLE: "Hazırlık adı yazma",
  PREP_INTAKE: "Kurulum sohbeti",
  CHAT_TITLE: "Sohbet başlığı yazma",
  LESSON_PREFETCH: "Dersi önceden yazma (kredisiz)",
  CONTENT_PREFETCH: "İçeriği önceden yazma (kredisiz)",
  SHARED_CONTENT_LESSON: "Hazır müfredat dersi",
  SHARED_CONTENT_MEDIA: "Hazır müfredat ses ve görseli",
  ADAPTIVE_JEV: "Uyarlamalı oturum",
  ADAPTIVE_ANSWER_EVAL: "Uyarlamalı cevap değerlendirme",
  ADAPTIVE_ACTION_CONTENT: "Uyarlamalı içerik",
  POOL_LESSON_VIEW: "Hazır ders açma",
  POOL_CARDS: "Hazır kart seti",
  POOL_QUIZ: "Hazır test",
  EXPORT_PDF: "PDF olarak dışa aktarma",
};

/** Ödeme durumları (payments.status). */
export const PAYMENT_STATUS = {
  paid: { label: "Ödendi", tone: "ok" },
  pending: { label: "Bekliyor", tone: "warn" },
  failed: { label: "Başarısız", tone: "bad" },
  refunded: { label: "İade edildi", tone: "mute" },
} as const;

/** PayTR bildiriminin sonucu: "success" ya da "failed". */
export function webhookStatusLabel(status: string | null | undefined): string {
  if (status === "success") return "Başarılı";
  if (status === "failed") return "Başarısız";
  return "Bilinmiyor";
}

/** Sistem durumundaki servislerin ne işe yaradığı. */
export const SERVICE_NOTES: Record<string, string> = {
  Supabase: "Kullanıcılar, sohbetler ve bütün veriler burada tutuluyor.",
  "Supabase service key": "Yönetim panelinin veriye erişmesi için gerekli.",
  OpenAI: "Yapay zekâ yanıtları buradan geliyor. Eksikse AI hiç çalışmaz.",
  PayTR: "Ödeme altyapısı. Eksikse paket satın alınamaz.",
  "Workspace SMTP": "Doğrulama ve bildirim e-postaları buradan gidiyor (Resend tanımlıysa yedek yol).",
  Resend: "İşlem e-postası sağlayıcısı. Anahtar tanımlıysa e-postalar önce buradan gider; eksikse Workspace SMTP tek yoldur.",
  "Upstash Redis":
    "İstek sınırlama sayacı. Tanımsızsa sayaç her sunucuda ayrı tutulur ve sınır fiilen çalışmaz.",
  PostHog: "Kullanım istatistikleri. Eksikse kimin ne yaptığı ölçülmez.",
  Sentry: "Hata takibi. Eksikse bir kullanıcıda site patlarsa haberin olmaz.",
};

export function auditLabel(action: string): string {
  return AUDIT_LABELS[action] ?? action;
}

export function actionLabel(code: string): string {
  return ACTION_LABELS[code] ?? code;
}

/** Kullanım tablosunda: bilinmeyen iç kod ekranda kod olarak değil "Diğer işlem" diye görünür. */
export function usageActionLabel(code: string | null | undefined): string {
  return (code && ACTION_LABELS[code]) || "Diğer işlem";
}
