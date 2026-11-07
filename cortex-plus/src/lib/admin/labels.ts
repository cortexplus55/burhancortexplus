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
  "email.campaign_created": "Toplu e-posta gönderimi başlatıldı",
  "email.campaign_cancelled": "Toplu e-posta gönderimi durduruldu",
  "email.single_sent": "Tek kişiye e-posta gönderildi",
  "email.test_sent": "Deneme e-postası gönderildi",
  "email.referral_cap.saved": "Davet hediyesi günlük tavanı değiştirildi",
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
  // 6 Kasım 2026: kodun yazdığı bütün eylemler (bekçi: yonetim-sistem.test.ts kaynakta arar).
  "payment.token.created": "Ödeme sayfası açıldı (sözleşme onayıyla)",
  "payment.completed": "Ödeme tamamlandı",
  "payment.amount_mismatch": "Ödeme tutarı beklenenle uyuşmadı",
  "payment.refund.partial": "Ödemenin bir kısmı iade edildi",
  "subscription.extended": "Abonelik süresi elle uzatıldı",
  "subscription.cancelled": "Öğrenci aboneliğini yenilemeyeceğini bildirdi",
  "subscription.resumed": "Öğrenci aboneliğini yeniden sürdürdü",
  "subscription.test_granted": "Deneme amaçlı abonelik tanımlandı",
  "support.created": "Destek talebi açıldı",
  "support.answered": "Destek talebi cevaplandı olarak işaretlendi",
  "support.prep_viewed": "Destek için öğrencinin hazırlığına bakıldı",
  "prompt.saved": "Bir AI talimatının yeni sürümü kaydedildi",
  "promo.redeemed": "Bir kod kullanıldı",
  "campaign.started": "Duyuru bandı başlatıldı",
  "campaign.ended": "Duyuru bandı kapatıldı",
  "pool_item.restored": "Karantinadaki soru havuza geri alındı",
  "pool_item.rejected": "Karantinadaki soru reddedildi",
  "pool_item.regenerated": "Karantinadaki soru reddedildi ve yerine yenisi üretildi",
  "pool_item.superseded_archived": "Eski sürüm sorular arşivlendi",
  "ops.daily_digest": "Günlük özet e-postası gönderildi",
  "ops.daily_digest_manual": "Günlük özet e-postası elle gönderildi",
  "generation.admin_reset": "Takılı kalan bir üretim elle sıfırlandı",
  "document.analysis_rerun": "Belgenin öğretmen analizi yeniden başlatıldı",
  "teacher.application.approved": "Öğretmen başvurusu onaylandı",
  "teacher.application.rejected": "Öğretmen başvurusu reddedildi",
  "user.suspended": "Hesap askıya alındı",
  "user.unsuspended": "Hesabın askısı kaldırıldı",
  free_preview_on: "\"Ücretsiz gibi gör\" önizlemesi açıldı",
  free_preview_off: "\"Ücretsiz gibi gör\" önizlemesi kapatıldı",
  "subscription.granted": "Kullanıcıya ücretsiz paket tanımlandı",
  "subscription.cancelled_by_admin": "Kullanıcının aboneliği yönetici tarafından iptal edildi",
  "stars.adjusted": "Kullanıcının yıldızı değiştirildi",
  "email.confirmed_by_admin": "Kullanıcının e-postası onaylı işaretlendi",
  "devices.reset": "Kullanıcı bütün cihazlardan çıkarıldı",
  "exam_preps.deleted_by_founder": "Kullanıcının hazırlıkları kalıcı olarak silindi",
  "documents.deleted_by_founder": "Kullanıcının belgeleri kalıcı olarak silindi",
  "system.maintenance_run": "Elle bakım: yetim yüklemeler ve soğuk vektörler temizlendi",
};

/** İşlem kaydının "ilgili kayıt" türü (`entity_type`) — ham tablo adı gösterilmez. */
export const ENTITY_LABELS: Record<string, string> = {
  admin_gate: "Yönetim girişi",
  credit_rule: "Kredi kuralı",
  day: "Gün",
  document: "Belge",
  email_campaign: "E-posta gönderimi",
  exam_prep: "Sınav hazırlığı",
  exam_prep_generation_job: "Üretim işi",
  feature_flag: "Özellik anahtarı",
  item_bank: "Havuz sorusu",
  payment: "Ödeme",
  plan: "Paket",
  profile: "Hesap",
  promo_batch: "Kod paketi",
  promo_campaign: "Duyuru bandı",
  promo_code: "Kod",
  prompt_version: "AI talimatı",
  subscription: "Abonelik",
  support_request: "Destek talebi",
  system: "Sistem",
  teacher_application: "Öğretmen başvurusu",
  user: "Hesap",
  user_role: "Yetki",
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

/** Sistem sayfasında servisin görünen adı (kod içindeki ad İngilizce kalabilir; ekranda Türkçe). */
export const SERVICE_DISPLAY: Record<string, string> = {
  "Supabase service key": "Supabase servis anahtarı",
  "Workspace SMTP": "E-posta sunucusu (Workspace SMTP)",
  Resend: "İşlem e-postası (Resend)",
  "Upstash Redis": "Hız Sınırı sayacı (Upstash Redis)",
  PostHog: "Kullanım istatistiği (PostHog)",
  Sentry: "Hata takibi (Sentry)",
};

export function serviceDisplay(name: string): string {
  return SERVICE_DISPLAY[name] ?? name;
}

/** Bilinmeyen eylemde ham kod ana satıra çıkmaz; kod yalnız küçük ikincil yazıda kalır. */
export const UNKNOWN_AUDIT_LABEL = "Tanımlanmamış işlem";

export function auditLabel(action: string): string {
  return AUDIT_LABELS[action] ?? UNKNOWN_AUDIT_LABEL;
}

export function entityLabel(entityType: string | null | undefined): string {
  if (!entityType) return "—";
  return ENTITY_LABELS[entityType] ?? "Diğer kayıt";
}

/** Kimlik ya da kısa kod: uzun kimlik ilk 8 karakteriyle (tamamı ipucunda). */
export function shortEntityId(id: string | null | undefined): string {
  if (!id) return "";
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export function actionLabel(code: string): string {
  return ACTION_LABELS[code] ?? code;
}

/** Kullanım tablosunda: bilinmeyen iç kod ekranda kod olarak değil "Diğer işlem" diye görünür. */
export function usageActionLabel(code: string | null | undefined): string {
  return (code && ACTION_LABELS[code]) || "Diğer işlem";
}
