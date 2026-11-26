import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const sendEmail = vi.fn();
vi.mock("@/lib/email/mailer", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));

import {
  HEALTH_ALERT_COOLDOWN_MS,
  alertsFromChecks,
  resolvedKeysFromChecks,
  shouldSendAlert,
  taxReminderCandidates,
  type AlertCandidate,
} from "@/lib/founder-cockpit/alerts";
import { dispatchFounderAlerts } from "@/lib/founder-cockpit/alert-dispatch";
import {
  renderFounderAlertMail,
  testAlertCandidate,
} from "@/lib/founder-cockpit/alert-email";
import {
  evaluateBreaker,
  evaluateDatabase,
  evaluateEmail,
  evaluateErrors,
  evaluateOpenAi,
  evaluatePayments,
  evaluateRedis,
  overallStatus,
  type ServiceCheck,
} from "@/lib/founder-cockpit/health";
import { protectionActiveToday } from "@/lib/founder-cockpit/breaker";
import { countResendEvents, sentryApiBase } from "@/lib/founder-cockpit/probes";
import { monthlyDeadlines } from "@/lib/founder-cockpit/tax-calendar";

/*
  Kurucu Kokpiti alarmları (Faz 13). Sağlık ve bütçe alarmı aynı sorun için en çok saatte bir; vergi hatırlatması her son
  gün ve eşik (5 gün / 1 gün) için bir kez; bütçe alarmı gün ve eşik başına bir kez; deneme her zaman. E-posta gönderimi
  sahte; kayıt tablosu bellekte.
*/

const NOW = new Date("2026-11-26T09:00:00Z");
const healthy: ServiceCheck[] = [
  evaluateDatabase({ latencyMs: 120, error: null }),
  evaluateOpenAi({ spendUsd: 10, budgetUsd: 50, reach: "ok" }),
  evaluateBreaker({ enabled: false, activeToday: false, freeCap: null }),
  evaluateEmail({ state: "events", total: 40, failed: 0 }),
  evaluatePayments({
    paid24h: 4,
    failed24h: 0,
    pending24h: 0,
    lastPaidAt: null,
  }),
  evaluateRedis({ configured: true, pong: true, breakerOpen: false }),
  evaluateErrors({ state: "issues", count: 0, capped: false }),
];

describe("servis değerlendirmesi", () => {
  it("sağlıklı sistem: yedi kart, genel durum tamam, alarm yok", () => {
    expect(healthy).toHaveLength(7);
    expect(overallStatus(healthy)).toBe("ok");
    expect(
      alertsFromChecks(healthy, {
        day: "2026-11-26",
        breakerJustTriggered: false,
        spendText: "$10 / $50",
      }),
    ).toEqual([]);
  });

  it("veritabanı eşikleri: 800 ms yavaş, 2000 ms ve hata kritik (sistem çalışmıyor)", () => {
    expect(evaluateDatabase({ latencyMs: 799, error: null }).level).toBe("ok");
    expect(evaluateDatabase({ latencyMs: 800, error: null }).level).toBe(
      "warning",
    );
    expect(evaluateDatabase({ latencyMs: 2000, error: null }).level).toBe(
      "critical",
    );
    const down = evaluateDatabase({
      latencyMs: null,
      error: "connection refused",
    });
    expect(down.level).toBe("critical");
    expect(overallStatus([down, ...healthy.slice(1)])).toBe("down");
  });

  it("OpenAI bütçesi: %80 uyarı, %100 kritik; kota bitti kritik", () => {
    expect(
      evaluateOpenAi({ spendUsd: 39.9, budgetUsd: 50, reach: "ok" }).level,
    ).toBe("ok");
    expect(
      evaluateOpenAi({ spendUsd: 40, budgetUsd: 50, reach: "ok" }).level,
    ).toBe("warning");
    expect(
      evaluateOpenAi({ spendUsd: 50, budgetUsd: 50, reach: "ok" }).level,
    ).toBe("critical");
    expect(
      evaluateOpenAi({ spendUsd: 1, budgetUsd: 50, reach: "quota" }).summary,
    ).toBe("OpenAI kredisi bitti");
  });

  it("hata takibi bağlı değilse bilinmiyor; genel durumu bozmaz", () => {
    const errors = evaluateErrors({ state: "not_connected" });
    expect(errors.level).toBe("unknown");
    expect(overallStatus([...healthy.slice(0, 6), errors])).toBe("ok");
    expect(
      evaluateErrors({ state: "issues", count: 25, capped: false }).level,
    ).toBe("critical");
  });

  it("e-posta: 3 başarısız ya da %20 oran uyarı", () => {
    expect(
      evaluateEmail({ state: "events", total: 100, failed: 2 }).level,
    ).toBe("ok");
    expect(
      evaluateEmail({ state: "events", total: 100, failed: 3 }).level,
    ).toBe("warning");
    expect(evaluateEmail({ state: "events", total: 5, failed: 1 }).level).toBe(
      "warning",
    );
    expect(evaluateEmail({ state: "not_configured" }).level).toBe("critical");
  });

  it("ödeme: 3+ başarısız ve hiç başarılı yoksa uyarı", () => {
    expect(
      evaluatePayments({
        paid24h: 0,
        failed24h: 3,
        pending24h: 0,
        lastPaidAt: null,
      }).level,
    ).toBe("warning");
    expect(
      evaluatePayments({
        paid24h: 1,
        failed24h: 5,
        pending24h: 0,
        lastPaidAt: null,
      }).level,
    ).toBe("ok");
    expect(evaluatePayments(null).level).toBe("unknown");
  });

  it("Resend olayları yalnız son 24 saat; Sentry bölgesi DSN'den", () => {
    const rows = [
      { created_at: "2026-11-26 08:00:00.000000+00", last_event: "delivered" },
      { created_at: "2026-11-26T07:00:00Z", last_event: "bounced" },
      { created_at: "2026-11-24T07:00:00Z", last_event: "failed" },
    ];
    expect(countResendEvents(rows, NOW)).toEqual({ total: 2, failed: 1 });
    expect(sentryApiBase("https://abc@o123.ingest.de.sentry.io/456")).toBe(
      "https://de.sentry.io",
    );
    expect(sentryApiBase(null)).toBe("https://sentry.io");
  });
});

describe("alarm adayları", () => {
  const day = "2026-11-26";

  it("bütçe: %80 ve %100 ayrı anahtar, gün başına", () => {
    const warn = alertsFromChecks(
      [evaluateOpenAi({ spendUsd: 41, budgetUsd: 50, reach: "ok" })],
      { day, breakerJustTriggered: false, spendText: "$41 / $50" },
    );
    expect(warn.map((item) => item.key)).toEqual(["budget:2026-11-26:80"]);
    const over = alertsFromChecks(
      [evaluateOpenAi({ spendUsd: 55, budgetUsd: 50, reach: "ok" })],
      { day, breakerJustTriggered: true, spendText: "$55 / $50" },
    );
    expect(over.map((item) => item.key)).toEqual([
      "budget:2026-11-26:100",
      "breaker:2026-11-26",
    ]);
    expect(over.every((item) => item.severity === "critical")).toBe(true);
  });

  it("kritik veritabanı ve e-posta; her adayda özet, etki ve ne yapmalı", () => {
    const list = alertsFromChecks(
      [
        evaluateDatabase({ latencyMs: null, error: "timeout" }),
        evaluateEmail({
          state: "config_problem",
          detail: "Alan adı doğrulanmamış",
        }),
      ],
      { day, breakerJustTriggered: false, spendText: "" },
    );
    expect(list.map((item) => item.key)).toEqual([
      "health:database",
      "health:email",
    ]);
    for (const item of list) {
      expect(item.summary.length).toBeGreaterThan(10);
      expect(item.impact.length).toBeGreaterThan(10);
      expect(item.action.length).toBeGreaterThan(10);
    }
  });

  it("düzelen kart kendi alarmlarını çözer", () => {
    const keys = resolvedKeysFromChecks(healthy);
    expect(keys).toContain("health:database");
    expect(keys).toContain("health:email");
    expect(keys).not.toContain("budget:2026-11-26:80");
  });
});

describe("tekrar kuralı", () => {
  const at = (minutesAgo: number) =>
    new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();

  it("sağlık alarmı: 60 dakika dolmadan tekrar yok", () => {
    expect(HEALTH_ALERT_COOLDOWN_MS).toBe(60 * 60 * 1000);
    expect(shouldSendAlert({ kind: "health" }, null, NOW)).toBe(true);
    expect(shouldSendAlert({ kind: "health" }, at(59), NOW)).toBe(false);
    expect(shouldSendAlert({ kind: "health" }, at(60), NOW)).toBe(true);
  });

  it("vergi ve bütçe: bir kez; deneme her zaman", () => {
    expect(shouldSendAlert({ kind: "tax" }, at(60 * 24 * 10), NOW)).toBe(false);
    expect(shouldSendAlert({ kind: "budget" }, at(120), NOW)).toBe(false);
    expect(shouldSendAlert({ kind: "test" }, at(0), NOW)).toBe(true);
  });
});

describe("vergi hatırlatması", () => {
  const deadlines = monthlyDeadlines("2026-11"); // 20 Aralık, 25 Aralık, 28 Aralık (Muhtasar 26 → 28), 28 Aralık

  it("5 gün kala: KDV 2 hatırlatması tahmini tutarla", () => {
    const list = taxReminderCandidates(deadlines, "2026-12-20", (item) =>
      item.kind === "kdv2"
        ? { amountText: "₺600,00", note: "1 yurt dışı fatura üzerinden." }
        : { amountText: null, note: null },
    );
    const kdv2 = list.find((item) => item.key === "tax:kdv2:2026-11:5")!;
    expect(kdv2.title).toBe("2 No.lu KDV (KDV 2) · Kasım 2026: 5 gün kaldı");
    expect(kdv2.summary).toContain("Tahmini tutar: ₺600,00.");
    expect(kdv2.action).toContain("1 yurt dışı fatura üzerinden.");
    // Faturaları toplama işi bugün (iç hatırlatma).
    expect(
      list.find((item) => item.key === "tax:invoice_collect:2026-11:1")!.title,
    ).toMatch(/bugün son gün/);
  });

  it("kaydırılan son gün nedeniyle yazılır; 1 gün kala ayrı anahtar", () => {
    const list = taxReminderCandidates(deadlines, "2026-12-27", () => ({
      amountText: null,
      note: null,
    }));
    const muhtasar = list.find(
      (item) => item.key === "tax:muhtasar_damga:2026-11:1",
    )!;
    expect(muhtasar.summary).toContain(
      "Cumartesi nedeniyle 26 Aralık 2026 Cumartesi yerine",
    );
    expect(muhtasar.severity).toBe("warning");
  });

  it("6 gün kala hatırlatma yok", () => {
    expect(
      taxReminderCandidates(deadlines, "2026-12-19", () => ({
        amountText: null,
        note: null,
      })).some((item) => item.key.startsWith("tax:kdv2")),
    ).toBe(false);
  });
});

describe("alarm e-postası", () => {
  it("konu önemi söyler; kokpit bağlantısı ve deneme notu", () => {
    const mail = renderFounderAlertMail(
      testAlertCandidate(),
      "https://cortexplus.app",
      { test: true },
    );
    expect(mail.subject).toBe("[Bilgi] Alarm hattı deneme e-postası");
    expect(mail.html).toContain("https://cortexplus.app/admin/kokpit");
    expect(mail.text).toContain("Şimdi ne yapmalısın?");
    expect(mail.text).toContain("deneme e-postasıdır");
  });

  it("dinamik metin kaçışla basılır", () => {
    const candidate: AlertCandidate = {
      ...testAlertCandidate(),
      kind: "health",
      key: "health:x",
      summary: "<script>alert(1)</script>",
    };
    expect(
      renderFounderAlertMail(candidate, "https://cortexplus.app").html,
    ).not.toContain("<script>alert(1)</script>");
  });
});

describe("koruma modu", () => {
  it("yalnız tetiklendiği Türkiye günü ve anahtar açıkken", () => {
    const on = {
      circuitBreakerEnabled: true,
      circuitBreakerTriggeredAt: "2026-11-26T06:00:00Z",
    };
    expect(protectionActiveToday(on, NOW)).toBe(true);
    // Gece yarısı (Türkiye) geçince kalkar: 26 Kasım 21:00 UTC = 27 Kasım 00:00 Türkiye.
    expect(protectionActiveToday(on, new Date("2026-11-26T21:00:00Z"))).toBe(
      false,
    );
    expect(
      protectionActiveToday({ ...on, circuitBreakerEnabled: false }, NOW),
    ).toBe(false);
    expect(
      protectionActiveToday({ ...on, circuitBreakerTriggeredAt: null }, NOW),
    ).toBe(false);
  });
});

/** Bellekte alarm kaydı: `select…in…not…order…limit` okuması ve `insert`. */
function memoryLog(
  rows: { alert_key: string; created_at: string; sent_to: string | null }[],
  options: { missing?: boolean } = {},
) {
  const inserts: Record<string, unknown>[] = [];
  const missingError = {
    code: "42P01",
    message: 'relation "public.founder_alert_logs" does not exist',
  };
  const service = {
    from() {
      const query = {
        keys: [] as string[],
        select() {
          return query;
        },
        in(_column: string, keys: string[]) {
          query.keys = keys;
          return query;
        },
        not() {
          return query;
        },
        order() {
          return query;
        },
        limit() {
          if (options.missing)
            return Promise.resolve({ data: null, error: missingError });
          const data = rows
            .filter((row) => query.keys.includes(row.alert_key) && row.sent_to)
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
          return Promise.resolve({ data, error: null });
        },
        insert(row: Record<string, unknown>) {
          inserts.push(row);
          if (options.missing) return Promise.resolve({ error: missingError });
          rows.push({
            alert_key: String(row.alert_key),
            created_at: NOW.toISOString(),
            sent_to: (row.sent_to as string | null) ?? null,
          });
          return Promise.resolve({ error: null });
        },
      };
      return query;
    },
  };
  return { service: service as unknown as SupabaseClient, inserts };
}

describe("gönderim ve kayıt", () => {
  const database = alertsFromChecks(
    [evaluateDatabase({ latencyMs: null, error: "timeout" })],
    { day: "2026-11-26", breakerJustTriggered: false, spendText: "" },
  );

  beforeEach(() => {
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({ ok: true, via: "resend" });
  });

  it("ilk alarm gider ve kaydedilir; aynı saat içinde ikincisi gitmez", async () => {
    const { service, inserts } = memoryLog([]);
    const first = await dispatchFounderAlerts(
      service,
      database,
      "kurucu@example.com",
      NOW,
    );
    expect(first).toMatchObject({ sent: 1, skipped: 0, failed: 0 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]![0]).toMatchObject({
      to: "kurucu@example.com",
      subject: "[Kritik] Veritabanı yanıt vermiyor",
    });
    expect(inserts[0]).toMatchObject({
      alert_key: "health:database",
      severity: "critical",
      sent_to: "kurucu@example.com",
    });

    const again = await dispatchFounderAlerts(
      service,
      database,
      "kurucu@example.com",
      new Date(NOW.getTime() + 15 * 60_000),
    );
    expect(again).toMatchObject({ sent: 0, skipped: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(1);

    const hourLater = await dispatchFounderAlerts(
      service,
      database,
      "kurucu@example.com",
      new Date(NOW.getTime() + 61 * 60_000),
    );
    expect(hourLater.sent).toBe(1);
  });

  it("gönderilemeyen alarm kilit tutmaz: sonraki kontrolde yeniden denenir", async () => {
    const { service, inserts } = memoryLog([]);
    sendEmail.mockResolvedValueOnce({ ok: false, tried: ["resend"] });
    const first = await dispatchFounderAlerts(
      service,
      database,
      "kurucu@example.com",
      NOW,
    );
    expect(first.failed).toBe(1);
    expect(inserts[0]!.sent_to).toBeNull();
    const retry = await dispatchFounderAlerts(
      service,
      database,
      "kurucu@example.com",
      new Date(NOW.getTime() + 15 * 60_000),
    );
    expect(retry.sent).toBe(1);
  });

  it("vergi hatırlatması bir kez", async () => {
    const tax: AlertCandidate = {
      ...testAlertCandidate(),
      kind: "tax",
      key: "tax:kdv2:2026-11:5",
    };
    const { service } = memoryLog([]);
    expect(
      (await dispatchFounderAlerts(service, [tax], "k@example.com", NOW)).sent,
    ).toBe(1);
    expect(
      (
        await dispatchFounderAlerts(
          service,
          [tax],
          "k@example.com",
          new Date(NOW.getTime() + 3 * 86_400_000),
        )
      ).skipped,
    ).toBe(1);
  });

  it("kayıt tablosu yoksa yalnız deneme gider (kilitsiz alarm 15 dakikada bir tekrar ederdi)", async () => {
    const { service } = memoryLog([], { missing: true });
    const summary = await dispatchFounderAlerts(
      service,
      [...database, testAlertCandidate()],
      "k@example.com",
      NOW,
    );
    expect(summary).toMatchObject({ sent: 1, skipped: 1, logMissing: true });
    expect(sendEmail.mock.calls[0]![0].subject).toMatch(/^\[Bilgi\]/);
  });

  it("e-posta katmanı hata fırlatsa da gönderim düşmez", async () => {
    sendEmail.mockRejectedValueOnce(new Error("ağ"));
    const { service } = memoryLog([]);
    await expect(
      dispatchFounderAlerts(service, database, "k@example.com", NOW),
    ).resolves.toMatchObject({ failed: 1 });
  });
});
