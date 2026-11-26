import type { ServiceCheck } from "@/lib/founder-cockpit/health";
import {
  dueDateLabel,
  daysUntil,
  reminderThresholdFor,
  taxReminderKey,
  type TaxDeadline,
} from "@/lib/founder-cockpit/tax-calendar";

/**
 * Kurucu alarmları (Faz 13, 26 Kasım 2026). Saf: hangi alarmın üretileceği ve gönderilip gönderilmeyeceği. Gönderim ve
 * kayıt `alert-dispatch.ts`'te.
 *
 * Spam koruması:
 * - Sağlık alarmı: aynı anahtar 60 dakikada en çok bir kez (sorun sürerse saatte bir hatırlatır).
 * - Bütçe alarmı: anahtar Türkiye gününü taşır (`budget:<gün>:80|100`): her eşik günde bir kez.
 * - Vergi hatırlatması: her son gün ve eşik (5 gün / 1 gün) için yalnız bir kez (`tax:<iş>:<dönem>:<eşik>`).
 * - Deneme e-postası: her basışta (kurucu elle gönderir; uçta dakikada bir sınır).
 * Sürekli bir durum (Upstash hiç bağlanmamış, Sentry'de birkaç eski hata) e-posta üretmez; yalnız kartta görünür.
 */

export type AlertSeverity = "info" | "warning" | "critical";
export type AlertKind = "health" | "budget" | "tax" | "test";

export type AlertCandidate = {
  key: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  /** Sorun özeti. */
  summary: string;
  /** Tahmini etki. */
  impact: string;
  /** "Şimdi ne yapmalısın?" */
  action: string;
};

export const HEALTH_ALERT_COOLDOWN_MS = 60 * 60 * 1000;

/** Bu aday şimdi gönderilir mi (`lastSentAt`: aynı anahtarın son gönderimi). */
export function shouldSendAlert(
  candidate: Pick<AlertCandidate, "kind">,
  lastSentAt: string | null,
  now: Date,
): boolean {
  if (candidate.kind === "test") return true;
  if (!lastSentAt) return true;
  if (candidate.kind === "tax" || candidate.kind === "budget") return false;
  const last = Date.parse(lastSentAt);
  return (
    !Number.isFinite(last) || now.getTime() - last >= HEALTH_ALERT_COOLDOWN_MS
  );
}

/** Kartlardan alarm adayları. `day`: Türkiye günü (bütçe anahtarı için). */
export function alertsFromChecks(
  checks: readonly ServiceCheck[],
  context: { day: string; breakerJustTriggered: boolean; spendText: string },
): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const check of checks) {
    if (check.id === "database" && check.level === "critical") {
      out.push({
        key: "health:database",
        kind: "health",
        severity: "critical",
        title: "Veritabanı yanıt vermiyor",
        summary: `Supabase'e bağlanılamadı ya da çok yavaş (${check.summary}).`,
        impact:
          "Öğrenciler giriş yapamayabilir; ders, test ve ödeme kayıtları yazılamaz.",
        action:
          "Supabase panelinde projenin çalıştığını (duraklatılmamış olduğunu) ve durum sayfasını kontrol et. Sorun sürerse Supabase desteğine yaz.",
      });
    } else if (check.id === "database" && check.level === "warning") {
      out.push({
        key: "health:database_slow",
        kind: "health",
        severity: "warning",
        title: "Veritabanı yavaşladı",
        summary: `Basit bir sorgu ${check.summary.replace(/^Yavaş: /, "")} sürdü.`,
        impact:
          "Sayfalar geç açılabilir; uzun sürerse bazı istekler zaman aşımına düşer.",
        action:
          "Supabase panelinde CPU, bellek ve disk kullanımına bak; yavaş sorgu raporunu kontrol et.",
      });
    }
    if (check.id === "openai" && /kredisi bitti/.test(check.summary)) {
      out.push({
        key: "health:openai_quota",
        kind: "health",
        severity: "critical",
        title: "OpenAI kredisi bitti",
        summary: "OpenAI isteklere 'kota doldu' yanıtı veriyor.",
        impact:
          "Ders, test, sohbet ve podcast üretimi duruyor; öğrenciler hata görür.",
        action:
          "OpenAI panelinde (Billing) kredi yükle ya da aylık sınırı yükselt. Yükleme birkaç dakika içinde etkili olur.",
      });
    } else if (check.id === "openai" && /reddedildi/.test(check.summary)) {
      out.push({
        key: "health:openai_auth",
        kind: "health",
        severity: "critical",
        title: "OpenAI anahtarı reddedildi",
        summary: "OpenAI, sunucudaki API anahtarını kabul etmiyor.",
        impact: "Bütün yapay zekâ özellikleri duruyor.",
        action:
          "OpenAI panelinde anahtarın silinmediğini ya da iptal edilmediğini kontrol et; gerekirse yeni anahtarı Vercel ortam değişkenine gir ve yeniden yayınla.",
      });
    } else if (
      check.id === "openai" &&
      (check.level === "warning" || check.level === "critical") &&
      /^Bugün/.test(check.summary)
    ) {
      const critical = check.level === "critical";
      out.push({
        key: `budget:${context.day}:${critical ? 100 : 80}`,
        kind: "budget",
        severity: critical ? "critical" : "warning",
        title: critical
          ? "Günlük OpenAI bütçesi aşıldı"
          : "Günlük OpenAI bütçesinin %80'i doldu",
        summary: `Bugünkü harcama: ${context.spendText}.`,
        impact: critical
          ? "Harcama bütçeyi geçti; koruma modu açıksa canlı sesli öğretmen ve video üretimi geçici olarak durur."
          : "Bu hızla gün bitmeden bütçe aşılabilir.",
        action:
          "Kokpitte en çok harcayan işi ve kullanıcıyı kontrol et (AI Kullanımı). Normal bir yoğunluksa bütçeyi yükselt; değilse koruma modunu aç.",
      });
    }
    if (check.id === "email" && check.level === "critical") {
      out.push({
        key: "health:email",
        kind: "health",
        severity: "critical",
        title: "E-posta gönderimi çalışmıyor",
        summary: check.detail
          ? `${check.summary}: ${check.detail}`
          : check.summary,
        impact:
          "Kayıt doğrulama, şifre sıfırlama, ödeme onayı ve hatırlatma e-postaları gitmez.",
        action:
          "Resend panelinde anahtarın geçerli ve cortexplus.app alan adının doğrulanmış olduğunu kontrol et.",
      });
    } else if (
      check.id === "email" &&
      check.level === "warning" &&
      /başarısız/.test(check.summary)
    ) {
      out.push({
        key: "health:email_failures",
        kind: "health",
        severity: "warning",
        title: "E-postalarda başarısız gönderim arttı",
        summary: check.summary,
        impact:
          "Bazı öğrencilere doğrulama ya da hatırlatma e-postası ulaşmamış olabilir.",
        action:
          "Resend panelinde Emails sayfasında 'bounced' ve 'failed' kayıtlarına bak; alıcı adresleri ya da alan adı itibarı sorunlu olabilir.",
      });
    }
    if (check.id === "payments" && check.level === "warning") {
      out.push({
        key: "health:payments",
        kind: "health",
        severity: "warning",
        title: "Ödemeler başarısız oluyor",
        summary: check.summary,
        impact: "Öğrenciler Plus satın alamıyor olabilir.",
        action:
          "PayTR mağaza panelinde son işlemleri ve hata kodlarını kontrol et; /admin/odemeler sayfasında başarısız ödemelere bak.",
      });
    }
    if (
      check.id === "redis" &&
      check.level === "warning" &&
      /Yanıt yok/.test(check.summary)
    ) {
      out.push({
        key: "health:redis",
        kind: "health",
        severity: "warning",
        title: "Upstash Redis yanıt vermiyor",
        summary: check.summary,
        impact:
          "Hız sınırı ve üretim yuvaları sunucu belleğine düşer; yoğunlukta sınırlar gevşer.",
        action:
          "Upstash panelinde veritabanının çalıştığını ve aylık istek sınırının dolmadığını kontrol et.",
      });
    }
    if (check.id === "errors" && check.level === "critical") {
      out.push({
        key: "health:errors",
        kind: "health",
        severity: "critical",
        title: "Hata sayısı arttı",
        summary: check.summary,
        impact: "Öğrenciler bir sayfada ya da işlemde hata alıyor olabilir.",
        action:
          "Sentry'de son 24 saatin en sık hatasını aç; yeni bir yayından sonra başladıysa geri almayı düşün.",
      });
    }
  }
  if (context.breakerJustTriggered) {
    out.push({
      key: `breaker:${context.day}`,
      kind: "budget",
      severity: "critical",
      title: "Koruma modu devreye girdi",
      summary: `Günlük OpenAI bütçesi aşıldı (${context.spendText}); ağır yapay zekâ işleri durduruldu.`,
      impact:
        "Canlı sesli öğretmen ve video üretimi bugün için kapalı; ders, test ve sohbet çalışmaya devam ediyor.",
      action:
        "Kokpitte 'Korumayı kaldır'a basarak hemen açabilirsin. Gece yarısı (Türkiye saati) koruma kendiliğinden kalkar.",
    });
  }
  return out;
}

/** Sağlıklı kartın kapattığı alarm anahtarları (açık kayıtlar "çözüldü" işaretlenir). */
export function resolvedKeysFromChecks(
  checks: readonly ServiceCheck[],
): string[] {
  const keys: string[] = [];
  for (const check of checks) {
    if (check.level !== "ok") continue;
    if (check.id === "database")
      keys.push("health:database", "health:database_slow");
    if (check.id === "openai")
      keys.push("health:openai_quota", "health:openai_auth");
    if (check.id === "email")
      keys.push("health:email", "health:email_failures");
    if (check.id === "payments") keys.push("health:payments");
    if (check.id === "redis") keys.push("health:redis");
    if (check.id === "errors") keys.push("health:errors");
  }
  return keys;
}

export type TaxEstimate = { amountText: string | null; note: string | null };

/** Bugün gönderilmesi gereken vergi hatırlatmaları (5 gün / 1 gün kala, eşik başına bir kez). */
export function taxReminderCandidates(
  deadlines: readonly TaxDeadline[],
  todayIso: string,
  estimate: (item: TaxDeadline) => TaxEstimate,
): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const item of deadlines) {
    const threshold = reminderThresholdFor(todayIso, item.dueDate);
    if (!threshold) continue;
    const left = daysUntil(todayIso, item.dueDate);
    const when = left === 0 ? "bugün son gün" : `${left} gün kaldı`;
    const amount = estimate(item);
    const shifted = item.shiftedFrom
      ? ` (${item.shiftedFrom} nedeniyle ${dueDateLabel(item.originalDate)} yerine)`
      : "";
    out.push({
      key: taxReminderKey(item, threshold),
      kind: "tax",
      severity: threshold === 1 ? "warning" : "info",
      title: `${item.title} · ${item.periodLabel}: ${when}`,
      summary: `Son gün ${dueDateLabel(item.dueDate)}${shifted}.${amount.amountText ? ` Tahmini tutar: ${amount.amountText}.` : ""}`,
      impact: item.internal
        ? "Faturalar gecikirse 2 No.lu KDV ve mali müşavir paketi eksik kalır."
        : "Süre kaçarsa gecikme faizi ve usulsüzlük cezası doğabilir.",
      action: [item.hint, amount.note].filter(Boolean).join(" "),
    });
  }
  return out;
}

export const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  info: "Bilgi",
  warning: "Uyarı",
  critical: "Kritik",
};
