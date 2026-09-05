import type { AbuseSignal, AbuseSeverity } from "@/lib/abuse/record";

/**
 * Sinyal adlarının gündelik Türkçe karşılığı.
 *
 * Panelde `rate_limit` yazsaydı, paneli açan kişinin ne olduğunu anlaması için
 * koda bakması gerekirdi. Menüdeki diğer başlıklarda olduğu gibi burada da
 * ekranda görünen şey cümle, kod değil.
 */
export const ABUSE_LABELS: Record<string, string> = {
  rate_limit: "Sınıra takıldı",
  daily_cap: "Günlük tavanı doldurdu",
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

export type { AbuseSignal };
