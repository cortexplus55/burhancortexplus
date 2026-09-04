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
  "prompt.activated": "Bir AI talimatı yayına alındı",
  "role.granted": "Kullanıcıya yetki verildi",
  "role.revoked": "Kullanıcının yetkisi geri alındı",
  "smtp.verify_ok": "E-posta bağlantısı test edildi ve çalıştı",
  "teacher_application.reviewed": "Öğretmen başvurusu sonuçlandırıldı",
};

/** Kredi bedeli tablosundaki işlem kodları. */
export const ACTION_LABELS: Record<string, string> = {
  CHAT_MESSAGE: "Sohbette bir soru sorma",
  IMAGE_SOLUTION: "Fotoğraftan soru çözme",
  QUIZ_GENERATE: "Quiz üretme",
  FLASHCARD_GENERATE: "Flashcard seti üretme",
  EXAM_GENERATE: "Deneme sınavı üretme",
  STUDY_PLAN_GENERATE: "Çalışma planı üretme",
  DOCUMENT_PAGE_PROCESS: "Yüklenen dokümanın bir sayfasını işleme",
  PODCAST_GENERATE: "Podcast üretme",
  ORAL_EXAM: "Sözlü sınav",
  WRITTEN_EXAM: "Yazılı sınav değerlendirme",
};

/** Sistem durumundaki servislerin ne işe yaradığı. */
export const SERVICE_NOTES: Record<string, string> = {
  Supabase: "Kullanıcılar, sohbetler ve bütün veriler burada tutuluyor.",
  "Supabase service key": "Yönetim panelinin veriye erişmesi için gerekli.",
  OpenAI: "Yapay zekâ yanıtları buradan geliyor. Eksikse AI hiç çalışmaz.",
  PayTR: "Ödeme altyapısı. Eksikse paket satın alınamaz.",
  "Workspace SMTP": "Doğrulama ve bildirim e-postaları buradan gidiyor.",
  "Upstash Redis": "İstek sınırlama. Eksikse kötüye kullanım engeli zayıflar.",
  PostHog: "Kullanım istatistikleri. Eksikse kimin ne yaptığı ölçülmez.",
  Sentry: "Hata takibi. Eksikse bir kullanıcıda site patlarsa haberin olmaz.",
};

export function auditLabel(action: string): string {
  return AUDIT_LABELS[action] ?? action;
}

export function actionLabel(code: string): string {
  return ACTION_LABELS[code] ?? code;
}
