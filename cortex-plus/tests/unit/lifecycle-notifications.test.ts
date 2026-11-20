import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  COOLDOWN_SLOT_GRACE_MS,
  LIFECYCLE_COOLDOWN_MS,
  claimDispatch,
  cooldownActive,
  dedupeKeys,
  legacyOnceKey,
  preDispatchCheck,
  settleDispatch,
} from "@/lib/notifications/dispatch-guard";
import { istanbulClock, isQuietHour, isoWeekOf, inStudySlot } from "@/lib/notifications/schedule";
import { jobsForSlot } from "@/lib/notifications/jobs/plan";
import { oneClickHeaders, oneClickUnsubscribeUrl, preferencesPageUrl } from "@/lib/notifications/unsubscribe-links";
import { preferencesByToken, preferencesFromRow } from "@/lib/notifications/preferences";
import { safeActionUrl } from "@/lib/notifications/in-app";
import { quotaCrossed } from "@/lib/notifications/quota-alert";
import { cronAuthorized } from "@/lib/notifications/cron-auth";

/*
  Faz 6 (20 Kasım 2026): yaşam döngüsü bildirimleri. Gece 22:00–08:00 sessizliği, 24 saat kuralı, dedupe_key tekilliği,
  abonelikten çıkma anahtarı, dilim planı ve göç (PGlite'ta: tablolar, kopyalar, tekillik, iki kez çalıştırma).
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
/** Türkiye saati (UTC+3) → Date. */
const tr = (iso: string) => new Date(`${iso}+03:00`);

describe("sessiz saat ve dilimler (Türkiye saati)", () => {
  it("gece 23:30 ve 07:59 sessiz; 08:00 ve 21:59 değil", () => {
    expect(isQuietHour(tr("2026-11-20T23:30:00"))).toBe(true);
    expect(isQuietHour(tr("2026-11-21T07:59:00"))).toBe(true);
    expect(isQuietHour(tr("2026-11-21T08:00:00"))).toBe(false);
    expect(isQuietHour(tr("2026-11-20T21:59:00"))).toBe(false);
    expect(isQuietHour(tr("2026-11-20T22:00:00"))).toBe(true);
  });

  it("saat UTC'den bağımsız Türkiye günüyle okunur", () => {
    const clock = istanbulClock(new Date("2026-11-22T16:00:00Z"));
    expect(clock).toEqual({ day: "2026-11-22", hour: 19, minute: 0, weekday: 7 });
    expect(isoWeekOf(new Date("2026-11-22T16:00:00Z"))).toBe("2026-W47");
  });

  it("dilim planı: 18:30 plan bitişi ve sınav arifesi önce; 19:00 Pazar karnesi; 19:30 1. konu; gece hiçbir şey", () => {
    expect(jobsForSlot(istanbulClock(tr("2026-11-20T18:31:00"))).map((job) => job.kind)).toEqual([
      "expiry",
      "exam_eve",
      "smart_trap",
      "daily_reminders",
    ]);
    expect(jobsForSlot(istanbulClock(tr("2026-11-22T19:02:00")))).toEqual([
      { kind: "activation" },
      { kind: "weekly" },
      { kind: "smart_trap", studyHour: 19 },
      { kind: "daily_reminders", studyHour: 19, dailyMails: true },
    ]);
    expect(jobsForSlot(istanbulClock(tr("2026-11-20T19:30:00")))).toEqual([{ kind: "free_first_unit" }]);
    expect(jobsForSlot(istanbulClock(tr("2026-11-20T21:00:00"))).map((job) => job.kind)).toEqual(["smart_trap", "daily_reminders"]);
    expect(jobsForSlot(istanbulClock(tr("2026-11-20T23:30:00")))).toEqual([]);
    expect(inStudySlot({ hour: 18, minute: 44 }, 18)).toBe(true);
    expect(inStudySlot({ hour: 18, minute: 10 }, 18)).toBe(false);
  });

  it("cron ucu yalnız doğru anahtarla açılır; gece turu iş koşturmaz", () => {
    const request = (value?: string) => new Request("https://x/api", { headers: value ? { authorization: value } : {} });
    expect(cronAuthorized(request("Bearer gizli-anahtar"), { CRON_SECRET: "gizli-anahtar" })).toBe(true);
    expect(cronAuthorized(request("Bearer yanlis"), { CRON_SECRET: "gizli-anahtar" })).toBe(false);
    expect(cronAuthorized(request("Bearer gizli-anahtar"), {})).toBe(false);
    const route = read("src/app/api/cron/lifecycle-notifications/route.ts");
    expect(route).toContain("if (isQuietHour(now))");
    expect(route).toContain("cronAuthorized(request)");
  });
});

describe("gönderim kilidi: sessiz saat, 24 saat, tekillik", () => {
  it("yaşam döngüsü e-postası 23:30'da engellenir; işlem e-postası engellenmez", () => {
    const night = tr("2026-11-20T23:30:00");
    expect(preDispatchCheck({ category: "lifecycle" }, night, null)).toBe("quiet_hours");
    expect(preDispatchCheck({ category: "transactional" }, night, null)).toBeNull();
  });

  it("son 24 saatte yaşam döngüsü e-postası gittiyse ikincisi gitmez; dünkü aynı dilim engellenmez", () => {
    const now = tr("2026-11-20T19:00:00");
    const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
    expect(cooldownActive(ago(3 * 3_600_000), now)).toBe(true);
    expect(cooldownActive(ago(LIFECYCLE_COOLDOWN_MS - COOLDOWN_SLOT_GRACE_MS - 60_000), now)).toBe(true);
    // Dün 19:00:20'de giden, bugün 19:00:05'teki turu engellemez (yarım saat pay).
    expect(cooldownActive(ago(LIFECYCLE_COOLDOWN_MS - 15_000), now)).toBe(false);
    expect(cooldownActive(ago(25 * 3_600_000), now)).toBe(false);
    expect(preDispatchCheck({ category: "lifecycle" }, now, ago(3 * 3_600_000))).toBe("cooldown");
    expect(preDispatchCheck({ category: "transactional" }, now, ago(3 * 3_600_000))).toBeNull();
  });

  it("tekilleştirme anahtarları: biçim tek kaynaktan; eski 'bir kez' karşılığı göçle aynı", () => {
    const user = "00000000-0000-4000-8000-000000000001";
    expect(dedupeKeys.welcome(user)).toBe(`welcome:${user}`);
    expect(dedupeKeys.expiry("sub-1", "24h")).toBe("expiry_24h:sub-1");
    expect(dedupeKeys.examEve("prep-1", 24)).toBe("exam_eve_24h:prep-1");
    expect(dedupeKeys.weekly(user, "2026-W47")).toBe(`weekly:${user}:2026-W47`);
    expect(legacyOnceKey(dedupeKeys.welcome(user), user)).toBe("once:welcome");
    expect(legacyOnceKey(dedupeKeys.purchase("ORD123"), user)).toBe("once:purchase:ORD123");
  });

  it("aynı dedupe_key ikinci kez alınamaz; gönderim düşerse kilit geri alınır; 24 saat kuralı kayıttan okunur", async () => {
    const db = fakeDispatchDb();
    const now = tr("2026-11-20T19:00:00");
    const request = { userId: "u1", templateKey: "weekly_study_digest", dedupeKey: "weekly:u1:2026-W47", category: "lifecycle" as const, now };
    const first = await claimDispatch(db.client, request);
    expect(first).toMatchObject({ ok: true, legacy: false });
    // Aynı gün: 24 saat kuralı zaten engeller. 25 saat sonra bile aynı anahtar ikinci kez alınamaz.
    expect(await claimDispatch(db.client, request)).toMatchObject({ ok: false });
    expect(await claimDispatch(db.client, { ...request, now: new Date(now.getTime() + 25 * 3_600_000) })).toEqual({
      ok: false,
      reason: "duplicate",
    });
    // Başka bir yaşam döngüsü e-postası aynı gün: 24 saat kuralı.
    expect(await claimDispatch(db.client, { ...request, templateKey: "smart_trap_nudge", dedupeKey: "smart_trap:u1:2026-W47" })).toEqual({
      ok: false,
      reason: "cooldown",
    });
    // İşlem e-postası kurala tabi değil.
    expect(await claimDispatch(db.client, { ...request, templateKey: "payment_confirmed", dedupeKey: "purchase:ORD1", category: "transactional" })).toMatchObject({ ok: true });
    // Düşen gönderim: kilit kalkar, yeniden alınabilir.
    if (!first.ok) throw new Error("claim");
    await settleDispatch(db.client, request, first, false);
    expect(db.rows.some((row) => row.dedupe_key === "weekly:u1:2026-W47")).toBe(false);
    expect(await claimDispatch(db.client, request)).toMatchObject({ ok: true });
  });
});

describe("abonelikten çıkma ve bağlantılar", () => {
  const token = "a".repeat(64);

  it("tek tık (RFC 8058) başlıkları ve sayfa adresi anahtarla", () => {
    const headers = oneClickHeaders(token, "weeklyDigestEmail", "https://cortexplus.app");
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(headers["List-Unsubscribe"]).toContain(oneClickUnsubscribeUrl(token, "weeklyDigestEmail", "https://cortexplus.app"));
    expect(preferencesPageUrl(token, "https://cortexplus.app")).toBe(`https://cortexplus.app/bildirim-tercihleri?token=${token}`);
  });

  it("biçimi tutmayan anahtar veritabanına hiç sorulmaz", async () => {
    let asked = 0;
    const client = { from: () => { asked += 1; throw new Error("sorulmamalı"); } } as never;
    expect(await preferencesByToken(client, "kisa")).toBeNull();
    expect(await preferencesByToken(client, `${"g".repeat(64)}`)).toBeNull();
    expect(asked).toBe(0);
  });

  it("satır yoksa bütün anahtarlar açık ve saat 19; geçersiz saat varsayılana döner", () => {
    expect(preferencesFromRow(null)).toMatchObject({ studyRemindersEmail: true, weeklyDigestEmail: true, inAppNotifications: true, preferredStudyHour: 19 });
    expect(preferencesFromRow({ preferred_study_hour: 23, weekly_digest_email: false })).toMatchObject({ preferredStudyHour: 19, weeklyDigestEmail: false });
  });

  it("bildirim bağlantısı yalnız sitenin kendi yolu", () => {
    expect(safeActionUrl("/deneme-sinavlari/1/tekrar")).toBe("/deneme-sinavlari/1/tekrar");
    expect(safeActionUrl("https://kotu.example")).toBeNull();
    expect(safeActionUrl("//kotu.example")).toBeNull();
    expect(safeActionUrl("javascript:alert(1)")).toBeNull();
  });

  it("hakkın %80'i eşiği: ücretsiz hesapta (dönem hakkı yok) bildirim yok", () => {
    expect(quotaCrossed({ period_allowance: 7200, free_allowance_remaining: 1440 })).toBe(true);
    expect(quotaCrossed({ period_allowance: 7200, free_allowance_remaining: 1441 })).toBe(false);
    expect(quotaCrossed({ period_allowance: 0, free_allowance_remaining: 0 })).toBe(false);
  });
});

/* ───────────── şablon üretimleri ───────────── */

describe("sekiz şablon: konu satırı, tek ana düğme, abonelikten çıkma yalnız yaşam döngüsünde", () => {
  it("örnek girdilerle her şablon beklenen konu satırını ve doğru alt bilgiyi üretir", async () => {
    const samples = await import("@/lib/email/templates/sample-inputs");
    const { renderWelcomeOnboarding } = await import("@/lib/email/templates/welcome-onboarding");
    const { renderPaymentConfirmed } = await import("@/lib/email/templates/payment-confirmed");
    const { renderActivation24h } = await import("@/lib/email/templates/activation-24h");
    const { renderFreeFirstUnitCompleted } = await import("@/lib/email/templates/free-first-unit-completed");
    const { renderSmartTrapNudge } = await import("@/lib/email/templates/smart-trap-nudge");
    const { renderExamEveCheatSheet } = await import("@/lib/email/templates/exam-eve-cheat-sheet");
    const { renderSubscriptionExpiryReminder } = await import("@/lib/email/templates/subscription-expiry-reminder");
    const { renderWeeklyStudyDigest } = await import("@/lib/email/templates/weekly-study-digest");

    const transactional = [
      [renderWelcomeOnboarding(samples.SAMPLE_WELCOME_ONBOARDING), "Hoş geldin Elif! İlk sınav yolunu 2 dakikada kuralım"],
      [renderPaymentConfirmed(samples.SAMPLE_PAYMENT_CONFIRMED), "Plus paketin aktif! Sınav yolunda tüm kilitler açıldı"],
    ] as const;
    const lifecycle = [
      [renderActivation24h(samples.SAMPLE_ACTIVATION_24H), 'Ders notun yoksa bile "Belgem yok" ile 30 saniyede başlayabilirsin'],
      [renderFreeFirstUnitCompleted(samples.SAMPLE_FREE_FIRST_UNIT_COMPLETED), "1. konuyu %82 ile bitirdin! Kalan 11 konun hazır"],
      [renderSmartTrapNudge(samples.SAMPLE_SMART_TRAP_NUDGE), 'TYT Matematik: "Üslü Sayılar" konusunda açık kalan 5 sınav tuzağın var'],
      [renderExamEveCheatSheet(samples.SAMPLE_EXAM_EVE_CHEAT_SHEET), "Sınavına 48 saat kaldı!"],
      [renderSubscriptionExpiryReminder(samples.SAMPLE_SUBSCRIPTION_EXPIRY_REMINDER), "Plus döneminin bitmesine 3 gün kaldı (Kartından otomatik çekim yapılmaz)"],
      [renderWeeklyStudyDigest(samples.SAMPLE_WEEKLY_STUDY_DIGEST), "Haftalık Cortex Plus Karnen: 3 yeni konu öğrendin"],
    ] as const;

    for (const [mail, subject] of transactional) {
      expect(mail.subject).toContain(subject);
      expect(mail.html).not.toContain(samples.SAMPLE_PREFERENCES_URL);
      expect(mail.text.length).toBeGreaterThan(80);
    }
    for (const [mail, subject] of lifecycle) {
      expect(mail.subject).toContain(subject);
      expect(mail.html).toContain(samples.SAMPLE_PREFERENCES_URL.replace(/&/g, "&amp;"));
      expect(mail.text).toContain(samples.SAMPLE_PREFERENCES_URL);
      expect(mail.html).toContain('max-width:600px');
    }
    const payment = renderPaymentConfirmed(samples.SAMPLE_PAYMENT_CONFIRMED);
    expect(payment.text).toContain("KDV dahil");
    expect(payment.text).toContain("Otomatik çekim yapılmaz");
    for (const [mail] of [...transactional, ...lifecycle]) expect(`${mail.subject} ${mail.text}`).not.toMatch(/%100/);
  });

  it("yaşam döngüsü işleri şablona tercih bağlantısını verir ve gönderimi kilitten geçirir", () => {
    const jobs = read("src/lib/notifications/jobs/lifecycle.ts");
    expect(jobs.match(/sendGuardedMail\(service, \{/g)?.length).toBe(6);
    expect(jobs.match(/category: "lifecycle"/g)?.length).toBe(6);
    expect(jobs).toContain('unsubscribe: "marketing"');
    expect(jobs).toContain("isFeatureEnabled(service, MARKETING_EMAIL_FLAG)");
    // Sınav sabahı kâğıdı Plus'ta: ücretsiz hesaba vaat edilmez.
    expect(jobs).toContain("cramSheetAvailable: !locked");
  });
  it("yönetimdeki önizleme gerçekte gönderilen şablonu çizer (sekiz şablon + deneme, kimseye gitmez)", async () => {
    const { LIFECYCLE_MAILS } = await import("@/lib/email/lifecycle-templates");
    const { renderLifecycleSample } = await import("@/lib/email/lifecycle");
    const { renderWelcomeOnboarding } = await import("@/lib/email/templates/welcome-onboarding");
    const { SAMPLE_WELCOME_ONBOARDING } = await import("@/lib/email/templates/sample-inputs");
    const keys = new Set(LIFECYCLE_MAILS.map((mail) => mail.templateKey));
    for (const key of ["welcome_onboarding", "payment_confirmed", "activation_24h", "free_first_unit_completed", "smart_trap_nudge", "exam_eve_cheat_sheet", "subscription_expiry_reminder", "weekly_study_digest"]) {
      expect(keys.has(key)).toBe(true);
    }
    for (const mail of LIFECYCLE_MAILS) {
      const rendered = renderLifecycleSample(mail.id, "https://cortexplus.app");
      expect(rendered.subject.length).toBeGreaterThan(5);
      expect(rendered.html).toContain("cortexplus.app");
    }
    expect(renderLifecycleSample("welcome", "https://cortexplus.app").subject).toBe(renderWelcomeOnboarding(SAMPLE_WELCOME_ONBOARDING).subject);
    expect(renderLifecycleSample("plus_monthly", "https://cortexplus.app").html).toContain("Otomatik çekim yapılmaz");
  });
});

/* ───────────── göç (PGlite) ───────────── */

const MIGRATION = "supabase/migrations/20261120120000_faz6_bildirim_eposta.sql";
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const GONE = "33333333-3333-4333-8333-333333333333";
let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, study_reminder_email boolean NOT NULL DEFAULT true);
    CREATE TABLE public.notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, title text NOT NULL, body text, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.email_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, template_key text NOT NULL, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO auth.users (id) VALUES ('${U1}'), ('${U2}');
    INSERT INTO public.profiles (id, study_reminder_email) VALUES ('${U1}', false), ('${U2}', true), ('${GONE}', false);
    INSERT INTO public.notifications (id, user_id, title, body, read_at) VALUES
      ('aaaaaaaa-0000-4000-8000-000000000001', '${U1}', 'Okunmuş', 'gövde', now()),
      ('aaaaaaaa-0000-4000-8000-000000000002', '${U2}', 'Okunmamış', null, null),
      ('aaaaaaaa-0000-4000-8000-000000000003', '${GONE}', 'Silinmiş hesap', 'x', null);
    INSERT INTO public.email_events (user_id, template_key, status) VALUES
      ('${U1}', 'once:welcome', 'sent'),
      ('${U1}', 'once:purchase:ORD9', 'sent'),
      ('${U2}', 'once:welcome', 'claimed');
  `);
  await pg.exec(read(MIGRATION));
});

afterAll(async () => {
  await pg?.close();
});

describe("göç 20261120120000 (PGlite)", () => {
  it("yalnız ekler: DROP, DELETE, UPDATE, TRUNCATE yok", () => {
    const sql = read(MIGRATION)
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|INDEX|POLICY|CONSTRAINT)\b/i);
    expect(sql).not.toMatch(/\b(DELETE\s+FROM|TRUNCATE|UPDATE\s+public\.)/i);
  });

  it("eski kayıtlar kopyalanır: kapalı hatırlatma, bildirimler (aynı kimlik, okundu), gönderilmiş 'bir kez' anahtarları", async () => {
    const prefs = await pg.query<{ user_id: string; study_reminders_email: boolean; unsubscribe_token: string }>(
      "SELECT user_id, study_reminders_email, unsubscribe_token FROM public.user_notification_preferences",
    );
    expect(prefs.rows).toHaveLength(1);
    expect(prefs.rows[0]).toMatchObject({ user_id: U1, study_reminders_email: false });
    expect(prefs.rows[0]!.unsubscribe_token).toMatch(/^[0-9a-f]{64}$/);

    const notes = await pg.query<{ id: string; is_read: boolean; kind: string; body: string }>(
      "SELECT id, is_read, kind, body FROM public.in_app_notifications ORDER BY id",
    );
    expect(notes.rows).toEqual([
      { id: "aaaaaaaa-0000-4000-8000-000000000001", is_read: true, kind: "legacy", body: "gövde" },
      { id: "aaaaaaaa-0000-4000-8000-000000000002", is_read: false, kind: "legacy", body: "" },
    ]);

    const log = await pg.query<{ dedupe_key: string; template_key: string; category: string }>(
      "SELECT dedupe_key, template_key, category FROM public.email_dispatch_log ORDER BY dedupe_key",
    );
    expect(log.rows).toEqual([
      { dedupe_key: "purchase:ORD9", template_key: "purchase", category: "transactional" },
      { dedupe_key: `welcome:${U1}`, template_key: "welcome", category: "transactional" },
    ]);
    // Kodun ürettiği anahtarla aynı.
    expect(log.rows.map((row) => row.dedupe_key).sort()).toEqual([dedupeKeys.purchase("ORD9"), dedupeKeys.welcome(U1)].sort());
  });

  it("dedupe_key tekil; abonelikten çıkma anahtarı her satırda ayrı; saat 18–21 dışı reddedilir", async () => {
    await expect(
      pg.query("INSERT INTO public.email_dispatch_log (user_id, template_key, dedupe_key, category) VALUES ($1, 'x', $2, 'lifecycle')", [U2, `welcome:${U1}`]),
    ).rejects.toThrow(/duplicate key|unique/i);
    await pg.query("INSERT INTO public.user_notification_preferences (user_id) VALUES ($1)", [U2]);
    const tokens = await pg.query<{ unsubscribe_token: string }>("SELECT unsubscribe_token FROM public.user_notification_preferences");
    expect(new Set(tokens.rows.map((row) => row.unsubscribe_token)).size).toBe(2);
    await expect(pg.query("UPDATE public.user_notification_preferences SET preferred_study_hour = 22 WHERE user_id = $1", [U2])).rejects.toThrow();
    await expect(
      pg.query("INSERT INTO public.email_dispatch_log (user_id, template_key, dedupe_key, category) VALUES ($1, 'x', 'y', 'reklam')", [U2]),
    ).rejects.toThrow();
  });

  it("bildirimde aynı olay iki kez yazılamaz (kullanıcı + dedupe_key)", async () => {
    const insert = () =>
      pg.query("INSERT INTO public.in_app_notifications (user_id, kind, title, body, dedupe_key) VALUES ($1, 'quota_80_pct', 't', 'b', 'quota_80:2026-12-01')", [U2]);
    await insert();
    await expect(insert()).rejects.toThrow(/duplicate key|unique/i);
  });

  it("ikinci kez çalışınca hiçbir şey çoğalmaz", async () => {
    const count = async () =>
      (await pg.query<{ n: number }>(
        "SELECT (SELECT count(*) FROM public.in_app_notifications)::int + (SELECT count(*) FROM public.email_dispatch_log)::int + (SELECT count(*) FROM public.user_notification_preferences)::int AS n",
      )).rows[0]!.n;
    const before = await count();
    await pg.exec(read(MIGRATION));
    expect(await count()).toBe(before);
  });
});

/** `email_dispatch_log` için küçük bellek içi taklit (tekil anahtar, son gönderim okuması, silme). */
function fakeDispatchDb() {
  const rows: { id: string; user_id: string; template_key: string; dedupe_key: string; category: string; sent_at: string }[] = [];
  let next = 0;
  const client = {
    from(table: string) {
      if (table !== "email_dispatch_log") throw new Error(`beklenmeyen tablo ${table}`);
      const filters: [string, unknown][] = [];
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => {
          const match = rows
            .filter((row) => filters.every(([column, value]) => (row as Record<string, unknown>)[column] === value))
            .sort((a, b) => b.sent_at.localeCompare(a.sent_at))[0];
          return { data: match ? { sent_at: match.sent_at } : null, error: null };
        },
        insert: (row: (typeof rows)[number]) => ({
          select: () => ({
            maybeSingle: async () => {
              if (rows.some((existing) => existing.dedupe_key === row.dedupe_key)) {
                return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
              }
              next += 1;
              rows.push({ ...row, id: `log-${next}` });
              return { data: { id: `log-${next}` }, error: null };
            },
          }),
        }),
        delete: () => ({
          eq: async (column: string, value: unknown) => {
            for (let index = rows.length - 1; index >= 0; index -= 1) {
              if ((rows[index] as Record<string, unknown>)[column] === value) rows.splice(index, 1);
            }
            return { error: null };
          },
        }),
      };
      return builder;
    },
  };
  return { client: client as never, rows };
}
