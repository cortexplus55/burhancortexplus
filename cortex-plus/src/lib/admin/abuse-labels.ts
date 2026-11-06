import type { AbuseSignal, AbuseSeverity } from "@/lib/abuse/record";

/**
 * Sinyal adlarının gündelik Türkçe karşılığı.
 *
 * Panelde `rate_limit` yazsaydı, paneli açan kişinin ne olduğunu anlaması için
 * koda bakması gerekirdi. Menüdeki diğer başlıklarda olduğu gibi burada da
 * ekranda görünen şey cümle, kod değil.
 */
export const ABUSE_LABELS: Record<string, string> = {
  rate_limit: "Hız Sınırına takıldı",
  daily_cap: "Günlük Tavanı doldurdu",
  moderation: "İçerik denetimi işaretledi",
  multi_account: "Çoklu hesap şüphesi",
  token_bruteforce: "Kod deneme",
  storage_cap: "Yükleme alanı doldu",
  session_spread: "Aynı hesap çok yerden",
};

export const ABUSE_EXPLANATIONS: Record<string, string> = {
  rate_limit:
    "Kısa sürede beklenenden çok istek gönderdi. Tek başına suç değil: sayfayı hızlı tıklayan bir öğrenci de buraya düşebilir.",
  daily_cap:
    "Gün boyunca bir ucun tavanına dayandı. Bir öğrencinin normal gününde olması beklenmez.",
  moderation:
    "Yazdığı ya da ürettiği metni içerik denetimi işaretledi. Konusuna göre bakılması gerekir.",
  multi_account:
    "Aynı kişiye ait olabilecek birden çok hesap belirtisi. Ücretsiz hak toplamak için açılmış olabilir.",
  token_bruteforce:
    "Var olmayan kodları arka arkaya denedi. Başkasının sınıfına ya da yükleme bağlantısına girmeye çalışıyor olabilir.",
  storage_cap:
    "Yükleme alanını doldurdu. Ders notu yükleyen biri buraya kolay kolay gelmez.",
  session_spread:
    "Aynı hesap birbirinden çok farklı yerlerden aynı anda kullanılıyor. Hesap paylaşımı olabilir.",
};

export function abuseLabel(signal: string): string {
  return ABUSE_LABELS[signal] ?? signal;
}

export function severityTone(
  severity: AbuseSeverity | string,
): "ok" | "warn" | "bad" | "mute" {
  if (severity === "high") return "bad";
  if (severity === "medium") return "warn";
  return "mute";
}

export function severityLabel(severity: AbuseSeverity | string): string {
  if (severity === "high") return "Bakılmalı";
  if (severity === "medium") return "Dikkat";
  return "Not";
}

/**
 * Olayın geldiği uç (`scope`). Ham uç adı ana satırda yazılmaz; bilinenler adıyla, bilinmeyenler ön ekinden bir
 * bölüme bağlanır. Ham ad yalnız küçük ikincil yazıda kalır.
 */
export const ABUSE_SCOPE_LABELS: Record<string, string> = {
  chat: "Sohbet",
  solve: "Fotoğraftan soru çözme",
  "doc-upload": "Belge yükleme",
  "document-image": "Belgedeki resimleri okuma",
  "phone-upload": "Telefondan yükleme",
  "join-class": "Sınıfa katılma kodu",
  "exam-prep-node": "Yol etkinliği (ders, test, podcast)",
  "exam-prep-create": "Hazırlık kurma",
  "exam-mock": "Yazılı deneme",
  "promo-redeem": "Kod kullanma",
  "csp-report": "Tarayıcı güvenlik raporu",
  signup: "Kayıt",
  "email-verify": "E-posta doğrulama",
  "email-verify-resend": "Doğrulama e-postasını yeniden gönderme",
  podcast: "Podcast",
  "podcast-audio": "Podcast sesi",
  "question-report": "Soruda hata bildirme",
  "twin-question": "İkiz soru",
  "two-option-hint": "İki şık arasında kaldım",
  "paytr-token": "Ödeme sayfası",
  "parent-pay-link": "Veli ödeme bağlantısı",
  "parent-pay-checkout": "Veli ödemesi",
};

/** Ön ek → bölüm (bilinmeyen uç için). Sıra önemli: uzun ön ek önce. */
const ABUSE_SCOPE_PREFIXES: [string, string][] = [
  ["exam-prep-", "Sınav hazırlığı"],
  ["exam-", "Deneme ve sınav"],
  ["oral-", "Sözlü deneme"],
  ["doc-", "Belgeler"],
  ["documents-", "Belgeler"],
  ["phone-", "Telefondan yükleme"],
  ["podcast", "Podcast"],
  ["school", "Okul"],
  ["classroom", "Sınıf"],
  ["promo", "Kod kullanma"],
  ["payment", "Ödeme"],
  ["paytr", "Ödeme"],
  ["parent-pay", "Veli ödemesi"],
  ["subscription", "Abonelik"],
  ["signup", "Kayıt"],
  ["email-", "E-posta"],
  ["prep-", "Sınav hazırlığı"],
  ["quiz-", "Test"],
  ["duel", "Düello"],
  ["profile", "Profil"],
  ["weekly-survey", "Haftalık anket"],
];

export const UNKNOWN_SCOPE_LABEL = "Diğer bir uç";

export function abuseScopeLabel(scope: string | null | undefined): string {
  if (!scope) return "—";
  const known = ABUSE_SCOPE_LABELS[scope];
  if (known) return known;
  const prefix = ABUSE_SCOPE_PREFIXES.find(([head]) => scope.startsWith(head));
  return prefix ? prefix[1] : UNKNOWN_SCOPE_LABEL;
}

export type { AbuseSignal };
