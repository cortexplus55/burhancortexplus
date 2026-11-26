/**
 * Kurucu Kokpiti sağlık değerlendirmesi (Faz 13, 26 Kasım 2026). Saf: yoklamaların ham sonucundan yedi servis kartı ve
 * genel durum. Ağ çağrıları `health-run.ts`'te.
 *
 * Eşikler:
 * - Veritabanı: < 800 ms tamam, < 2000 ms yavaş (uyarı), daha uzun ya da hata kritik (genel durum "down").
 * - OpenAI bütçesi: bugünkü harcama günlük bütçenin %80'i uyarı, %100'ü kritik; kota bittiyse ya da anahtar
 *   reddedildiyse kritik.
 * - E-posta (Resend): anahtar ya da alan adı sorunluysa kritik; son 24 saatte 3+ başarısız gönderim ya da %20+ oran uyarı.
 * - Ödeme (PayTR): son 24 saatte 3+ başarısız ödeme ve hiç başarılı ödeme yoksa uyarı (akış takılmış olabilir).
 * - Redis (Upstash): yapılandırılmamış ya da yanıt yok → uyarı (hız sınırı bellekte çalışır, servis durmaz).
 * - Hata takibi (Sentry): bağlı değilse "bilinmiyor" (genel durumu bozmaz); son 24 saatte 1+ açık hata uyarı, 25+ kritik.
 * - Koruma modu: devredeyse uyarı (ağır AI işleri geçici kapalı).
 */

export type HealthLevel = "ok" | "warning" | "critical" | "unknown";
export type OverallStatus = "ok" | "degraded" | "down";
export type ServiceId =
  "database" | "openai" | "breaker" | "email" | "payments" | "redis" | "errors";

export type ServiceCheck = {
  id: ServiceId;
  label: string;
  level: HealthLevel;
  summary: string;
  detail?: string | null;
};

export const SERVICE_LABEL: Record<ServiceId, string> = {
  database: "Veritabanı",
  openai: "OpenAI bütçesi",
  breaker: "Koruma modu",
  email: "E-posta (Resend)",
  payments: "Ödeme (PayTR)",
  redis: "Hız sınırı (Upstash)",
  errors: "Hata takibi (Sentry)",
};

export const DB_SLOW_MS = 800;
export const DB_CRITICAL_MS = 2000;
export const BUDGET_WARNING_SHARE = 0.8;

const usd = (value: number) => `$${value.toFixed(2)}`;

export function evaluateDatabase(input: {
  latencyMs: number | null;
  error: string | null;
}): ServiceCheck {
  const base = { id: "database" as const, label: SERVICE_LABEL.database };
  if (input.error || input.latencyMs == null) {
    return {
      ...base,
      level: "critical",
      summary: "Yanıt vermiyor",
      detail: input.error ? input.error.slice(0, 160) : null,
    };
  }
  const ms = Math.round(input.latencyMs);
  if (ms >= DB_CRITICAL_MS)
    return { ...base, level: "critical", summary: `Çok yavaş: ${ms} ms` };
  if (ms >= DB_SLOW_MS)
    return { ...base, level: "warning", summary: `Yavaş: ${ms} ms` };
  return { ...base, level: "ok", summary: `${ms} ms` };
}

export type BudgetLevel = {
  level: "ok" | "warning" | "critical" | "unknown";
  share: number | null;
};

export function budgetLevel(
  spendUsd: number | null,
  budgetUsd: number,
): BudgetLevel {
  if (spendUsd == null || !Number.isFinite(spendUsd) || budgetUsd <= 0)
    return { level: "unknown", share: null };
  const share = spendUsd / budgetUsd;
  if (share >= 1) return { level: "critical", share };
  if (share >= BUDGET_WARNING_SHARE) return { level: "warning", share };
  return { level: "ok", share };
}

export type OpenAiReach = "ok" | "quota" | "auth" | "limited" | "down" | null;

export function evaluateOpenAi(input: {
  spendUsd: number | null;
  budgetUsd: number;
  reach: OpenAiReach;
}): ServiceCheck {
  const base = { id: "openai" as const, label: SERVICE_LABEL.openai };
  const budget = budgetLevel(input.spendUsd, input.budgetUsd);
  const spendText =
    input.spendUsd == null
      ? "harcama okunamadı"
      : `${usd(input.spendUsd)} / ${usd(input.budgetUsd)}`;
  const percent =
    budget.share == null ? "" : ` (%${Math.round(budget.share * 100)})`;
  if (input.reach === "quota")
    return {
      ...base,
      level: "critical",
      summary: "OpenAI kredisi bitti",
      detail: `Bugün ${spendText}`,
    };
  if (input.reach === "auth")
    return {
      ...base,
      level: "critical",
      summary: "OpenAI anahtarı reddedildi",
      detail: `Bugün ${spendText}`,
    };
  const reachNote =
    input.reach === "limited"
      ? "OpenAI hız sınırında"
      : input.reach === "down"
        ? "OpenAI'ye ulaşılamadı"
        : input.reach == null
          ? "Anahtar tanımlı değil"
          : null;
  const level: HealthLevel =
    budget.level === "critical"
      ? "critical"
      : budget.level === "warning" ||
          input.reach === "limited" ||
          input.reach === "down"
        ? "warning"
        : budget.level;
  return {
    ...base,
    level,
    summary: `Bugün ${spendText}${percent}`,
    detail: reachNote,
  };
}

export function evaluateBreaker(input: {
  enabled: boolean;
  activeToday: boolean;
  freeCap: { tripped: boolean; capUsd: number } | null;
}): ServiceCheck {
  const base = { id: "breaker" as const, label: SERVICE_LABEL.breaker };
  const freeNote = input.freeCap
    ? `Ücretsiz hesap tavanı ${usd(input.freeCap.capUsd)}${input.freeCap.tripped ? " (aşıldı, ücretsiz işler durdu)" : ""}`
    : null;
  if (input.activeToday) {
    return {
      ...base,
      level: "warning",
      summary: "Devrede: canlı sesli öğretmen ve video üretimi geçici kapalı",
      detail: freeNote,
    };
  }
  return {
    ...base,
    level: "ok",
    summary: input.enabled ? "Hazır (bütçe aşılınca devreye girer)" : "Kapalı",
    detail: freeNote,
  };
}

export type EmailProbe =
  | { state: "not_configured" }
  | { state: "config_problem"; detail: string }
  | { state: "events"; total: number; failed: number }
  | { state: "domain_ready" }
  | { state: "unreachable"; detail: string };

export const EMAIL_FAIL_COUNT = 3;
export const EMAIL_FAIL_SHARE = 0.2;

export function evaluateEmail(probe: EmailProbe): ServiceCheck {
  const base = { id: "email" as const, label: SERVICE_LABEL.email };
  switch (probe.state) {
    case "not_configured":
      return {
        ...base,
        level: "critical",
        summary: "Resend anahtarı tanımlı değil",
      };
    case "config_problem":
      return {
        ...base,
        level: "critical",
        summary: "Gönderim yapılandırması sorunlu",
        detail: probe.detail,
      };
    case "unreachable":
      return {
        ...base,
        level: "warning",
        summary: "Resend'e ulaşılamadı",
        detail: probe.detail,
      };
    case "domain_ready":
      return {
        ...base,
        level: "ok",
        summary: "Alan adı doğrulanmış",
        detail:
          "Anahtar yalnız gönderim yetkili; son 24 saatin sonuçları okunamadı.",
      };
    case "events": {
      const share = probe.total > 0 ? probe.failed / probe.total : 0;
      const level: HealthLevel =
        probe.failed >= EMAIL_FAIL_COUNT ||
        (probe.total >= 5 && share >= EMAIL_FAIL_SHARE)
          ? "warning"
          : "ok";
      return {
        ...base,
        level,
        summary: `Son 24 saat: ${probe.total} gönderim, ${probe.failed} başarısız`,
      };
    }
  }
}

export type PaymentStats = {
  paid24h: number;
  failed24h: number;
  pending24h: number;
  lastPaidAt: string | null;
};

export function evaluatePayments(stats: PaymentStats | null): ServiceCheck {
  const base = { id: "payments" as const, label: SERVICE_LABEL.payments };
  if (!stats)
    return { ...base, level: "unknown", summary: "Ödeme kayıtları okunamadı" };
  const last = stats.lastPaidAt
    ? `Son başarılı ödeme: ${stats.lastPaidAt.slice(0, 16).replace("T", " ")} UTC`
    : "Henüz başarılı ödeme yok";
  if (stats.failed24h >= 3 && stats.paid24h === 0) {
    return {
      ...base,
      level: "warning",
      summary: `Son 24 saat: ${stats.failed24h} başarısız, 0 başarılı`,
      detail: last,
    };
  }
  return {
    ...base,
    level: "ok",
    summary: `Son 24 saat: ${stats.paid24h} başarılı, ${stats.failed24h} başarısız`,
    detail: last,
  };
}

export type RedisProbeResult = {
  configured: boolean;
  pong: boolean;
  breakerOpen: boolean;
};

export function evaluateRedis(probe: RedisProbeResult): ServiceCheck {
  const base = { id: "redis" as const, label: SERVICE_LABEL.redis };
  if (!probe.configured)
    return {
      ...base,
      level: "warning",
      summary: "Bağlı değil: hız sınırı sunucu belleğinde",
    };
  if (probe.breakerOpen || !probe.pong)
    return {
      ...base,
      level: "warning",
      summary: "Yanıt yok: hız sınırı geçici olarak bellekte",
    };
  return { ...base, level: "ok", summary: "PING yanıtı geldi" };
}

export type SentryProbe =
  | { state: "not_connected" }
  | { state: "unreachable"; detail: string }
  | { state: "issues"; count: number; capped: boolean };

export const SENTRY_CRITICAL_COUNT = 25;

export function evaluateErrors(probe: SentryProbe): ServiceCheck {
  const base = { id: "errors" as const, label: SERVICE_LABEL.errors };
  if (probe.state === "not_connected")
    return {
      ...base,
      level: "unknown",
      summary: "Bağlı değil",
      detail:
        "SENTRY_AUTH_TOKEN, SENTRY_ORG ve SENTRY_PROJECT tanımlanınca sayılır.",
    };
  if (probe.state === "unreachable")
    return {
      ...base,
      level: "unknown",
      summary: "Sentry'ye ulaşılamadı",
      detail: probe.detail,
    };
  const text = `${probe.count}${probe.capped ? "+" : ""}`;
  if (probe.count >= SENTRY_CRITICAL_COUNT)
    return {
      ...base,
      level: "critical",
      summary: `Son 24 saatte ${text} açık hata`,
    };
  if (probe.count > 0)
    return {
      ...base,
      level: "warning",
      summary: `Son 24 saatte ${text} açık hata`,
    };
  return { ...base, level: "ok", summary: "Son 24 saatte açık hata yok" };
}

/** Veritabanı kritikse "down"; herhangi bir uyarı ya da kritik varsa "degraded"; yoksa "ok". "unknown" bozmaz. */
export function overallStatus(
  services: readonly ServiceCheck[],
): OverallStatus {
  if (
    services.some((item) => item.id === "database" && item.level === "critical")
  )
    return "down";
  if (
    services.some(
      (item) => item.level === "warning" || item.level === "critical",
    )
  )
    return "degraded";
  return "ok";
}

export const OVERALL_LABEL: Record<OverallStatus, string> = {
  ok: "Her şey yolunda",
  degraded: "Dikkat isteyen bir şey var",
  down: "Sistem çalışmıyor",
};
