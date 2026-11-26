import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { istanbulDayStartIso } from "@/lib/admin/cockpit-math";
import { readAiSpend } from "@/lib/admin/ops-gauges";
import { probeOpenAi, probeRedis } from "@/lib/admin/system-probes";
import { spendBreakerState } from "@/lib/billing/spend-breaker";
import { istanbulDay } from "@/lib/istanbul-day";
import { missingRelation } from "@/lib/learning/missing-column";
import {
  alertsFromChecks,
  resolvedKeysFromChecks,
} from "@/lib/founder-cockpit/alerts";
import {
  dispatchFounderAlerts,
  resolveAlerts,
  type DispatchSummary,
} from "@/lib/founder-cockpit/alert-dispatch";
import {
  protectionActiveToday,
  resetHeavyAiProtectionCache,
} from "@/lib/founder-cockpit/breaker";
import {
  budgetLevel,
  evaluateBreaker,
  evaluateDatabase,
  evaluateEmail,
  evaluateErrors,
  evaluateOpenAi,
  evaluatePayments,
  evaluateRedis,
  overallStatus,
  type OverallStatus,
  type ServiceCheck,
} from "@/lib/founder-cockpit/health";
import {
  probeDatabase,
  probeEmail,
  probePayments,
  probeSentry,
} from "@/lib/founder-cockpit/probes";
import {
  loadCockpitSettings,
  saveCockpitSettings,
} from "@/lib/founder-cockpit/settings";

/**
 * Sağlık kontrolü (Faz 13, 26 Kasım 2026): 15 dakikada bir Vercel zamanlayıcısıyla (`/api/cron/founder-health-check`),
 * kokpitteki "Şimdi kontrol et" ile ve dış izleme servisinden (aynı uç, `Authorization: Bearer $CRON_SECRET`).
 * Yoklamalar paralel; sonuç kayda (`founder_health_snapshots`), alarmlar e-postaya. Koruma modu burada tetiklenir.
 * Bütün yoklamalar ücretsizdir (OpenAI'ye yalnız model listesi sorulur, üretim yok).
 */

export type HealthReport = {
  checkedAt: string;
  overall: OverallStatus;
  dailyAiSpendUsd: number | null;
  budgetUsd: number;
  services: ServiceCheck[];
  protectionActive: boolean;
  breakerJustTriggered: boolean;
  alerts: DispatchSummary | null;
  snapshotStored: boolean;
};

const usd = (value: number) => `$${value.toFixed(2)}`;

export async function runFounderHealthCheck(
  service: SupabaseClient,
  options: { now?: Date; sendAlerts?: boolean } = {},
): Promise<HealthReport> {
  const now = options.now ?? new Date();
  const { settings, stored } = await loadCockpitSettings(service);
  const dayStart = istanbulDayStartIso(now);

  const [db, spend, reach, email, payments, redis, sentry, freeCap] =
    await Promise.all([
      probeDatabase(service),
      readAiSpend(service, dayStart).catch(() => null),
      probeOpenAi().catch(() => "down" as const),
      probeEmail(now),
      probePayments(service, now),
      probeRedis().catch(() => ({
        configured: false,
        pong: false,
        breakerOpen: false,
      })),
      probeSentry(),
      spendBreakerState(service, now, { fresh: true }).catch(() => null),
    ]);

  const spendUsd = spend ? spend.usd : null;
  // Koruma modu: anahtar açık, bütçe aşıldı ve bugün henüz tetiklenmediyse şimdi tetikle.
  let triggeredAt = settings.circuitBreakerTriggeredAt;
  let breakerJustTriggered = false;
  const overBudget =
    budgetLevel(spendUsd, settings.dailyAiBudgetUsd).level === "critical";
  if (
    stored &&
    settings.circuitBreakerEnabled &&
    overBudget &&
    !protectionActiveToday(settings, now)
  ) {
    const saved = await saveCockpitSettings(service, {
      circuit_breaker_triggered_at: now.toISOString(),
    });
    if (saved.ok) {
      triggeredAt = now.toISOString();
      breakerJustTriggered = true;
      resetHeavyAiProtectionCache();
    }
  }
  const protectionActive = protectionActiveToday(
    {
      circuitBreakerEnabled: settings.circuitBreakerEnabled,
      circuitBreakerTriggeredAt: triggeredAt,
    },
    now,
  );

  const services: ServiceCheck[] = [
    evaluateDatabase(db),
    evaluateOpenAi({ spendUsd, budgetUsd: settings.dailyAiBudgetUsd, reach }),
    evaluateBreaker({
      enabled: settings.circuitBreakerEnabled,
      activeToday: protectionActive,
      freeCap: freeCap
        ? { tripped: freeCap.tripped, capUsd: freeCap.cap.capUsd }
        : null,
    }),
    evaluateEmail(email),
    evaluatePayments(payments),
    evaluateRedis(redis),
    evaluateErrors(sentry),
  ];
  const overall = overallStatus(services);

  let snapshotStored = false;
  const { error: snapshotError } = await service
    .from("founder_health_snapshots")
    .insert({
      checked_at: now.toISOString(),
      overall_status: overall,
      daily_ai_spend_usd: spendUsd,
      services_json: services,
    });
  if (!snapshotError) snapshotStored = true;
  else if (!missingRelation(snapshotError))
    console.error("founder_health_snapshot_failed", {
      error: snapshotError.message,
    });

  let alerts: DispatchSummary | null = null;
  if (options.sendAlerts !== false) {
    const spendText =
      spendUsd == null
        ? "okunamadı"
        : `${usd(spendUsd)} / ${usd(settings.dailyAiBudgetUsd)}`;
    const candidates = alertsFromChecks(services, {
      day: istanbulDay(now),
      breakerJustTriggered,
      spendText,
    });
    alerts = await dispatchFounderAlerts(
      service,
      candidates,
      settings.alertEmail,
      now,
    );
    await resolveAlerts(service, resolvedKeysFromChecks(services), now);
  }

  return {
    checkedAt: now.toISOString(),
    overall,
    dailyAiSpendUsd: spendUsd,
    budgetUsd: settings.dailyAiBudgetUsd,
    services,
    protectionActive,
    breakerJustTriggered,
    alerts,
    snapshotStored,
  };
}

export type StoredSnapshot = {
  checkedAt: string;
  overall: OverallStatus;
  dailyAiSpendUsd: number | null;
  services: ServiceCheck[];
};

/** Son kayıtlı kontrol (sayfa açılışı yoklama yapmaz; "Şimdi kontrol et" yapar). Tablo yoksa null. */
export async function loadLatestSnapshot(
  service: SupabaseClient,
): Promise<StoredSnapshot | null> {
  const { data, error } = await service
    .from("founder_health_snapshots")
    .select("checked_at, overall_status, daily_ai_spend_usd, services_json")
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const overall =
    row.overall_status === "down"
      ? "down"
      : row.overall_status === "degraded"
        ? "degraded"
        : "ok";
  return {
    checkedAt: String(row.checked_at ?? ""),
    overall,
    dailyAiSpendUsd:
      row.daily_ai_spend_usd == null ? null : Number(row.daily_ai_spend_usd),
    services: Array.isArray(row.services_json)
      ? (row.services_json as ServiceCheck[])
      : [],
  };
}

/** 30 günden eski kayıtlar (günlük vergi işinde). */
export async function pruneHealthSnapshots(
  service: SupabaseClient,
  now: Date = new Date(),
): Promise<void> {
  const cutoff = new Date(
    now.getTime() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { error } = await service
    .from("founder_health_snapshots")
    .delete()
    .lt("checked_at", cutoff);
  if (error && !missingRelation(error))
    console.error("founder_health_prune_failed", { error: error.message });
}
