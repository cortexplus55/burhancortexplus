import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/*
  Günlük özet e-postası (18 Ekim 2026, plan 4.8).

  Kurucu sabah posta kutusunda son 24 saati görür: yeni kayıt, ödeme, üretim hatası, takılı
  üretim. Üçüncü cron yok (Hobby sınırı) — günlük `subscription-renewal` turunun sonunda gider;
  aynı gün iki kez gitmez; posta öğrenci adı ya da e-postası taşımaz.
*/
vi.mock("@/lib/email/mailer", () => ({
  sendEmail: vi.fn(async () => ({ ok: true })),
}));

import {
  DIGEST_AUDIT_ACTION,
  collectDailyDigest,
  digestDayKey,
  digestRecipient,
  renderDailyDigest,
  sendDailyDigest,
} from "@/lib/admin/daily-digest";

type Row = Record<string, unknown>;
type State = {
  profiles: Row[];
  payments: Row[];
  failures: Row[];
  jobs: Row[];
  audit: Row[];
};

function table(state: State, name: string): Row[] {
  if (name === "profiles") return state.profiles;
  if (name === "payments") return state.payments;
  if (name === "lesson_generation_failures") return state.failures;
  if (name === "exam_prep_generation_jobs") return state.jobs;
  if (name === "audit_logs") return state.audit;
  throw new Error(`unexpected table ${name}`);
}

/** Küçük sahte PostgREST: eq/gte/lt süzgeçleri, head sayımı, insert. */
function client(state: State): SupabaseClient {
  return {
    from(name: string) {
      const rows = table(state, name);
      const filters: ((row: Row) => boolean)[] = [];
      let head = false;
      const matching = () => rows.filter((row) => filters.every((f) => f(row)));
      const builder: Record<string, unknown> = {
        select: (_cols: string, opts?: { head?: boolean }) => {
          head = Boolean(opts?.head);
          return builder;
        },
        eq: (col: string, value: unknown) => {
          filters.push((row) => row[col] === value);
          return builder;
        },
        gte: (col: string, value: string) => {
          filters.push((row) => String(row[col]) >= value);
          return builder;
        },
        lt: (col: string, value: string) => {
          filters.push((row) => String(row[col]) < value);
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        insert: async (values: Row) => {
          rows.push({ ...values });
          return { error: null };
        },
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
        then: (resolve: (value: { data: Row[] | null; count: number; error: null }) => void) => {
          const hit = matching();
          resolve({ data: head ? null : hit.map((row) => ({ ...row })), count: hit.length, error: null });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

const NOW = new Date("2026-10-18T06:00:00Z"); // 09:00 TRT, cron saati
const inWindow = "2026-10-17T20:00:00Z";
const outside = "2026-10-16T20:00:00Z";

function state(): State {
  return {
    profiles: [{ id: "u1", created_at: inWindow }, { id: "u2", created_at: inWindow }, { id: "old", created_at: outside }],
    payments: [
      { amount_try: 59900, status: "paid", created_at: inWindow },
      { amount_try: 59900, status: "paid", created_at: inWindow },
      { amount_try: 59900, status: "failed", created_at: inWindow },
      { amount_try: 59900, status: "paid", created_at: outside },
    ],
    failures: [
      { reason: "concept_dropped", created_at: inWindow },
      { reason: "concept_dropped", created_at: inWindow },
      { reason: "source_unavailable", created_at: inWindow },
      { reason: "slow_generation", created_at: inWindow },
      { reason: "generation_failed", created_at: outside },
    ],
    jobs: [
      { id: "j1", status: "creating", updated_at: "2026-10-18T05:00:00Z", user_id: "u1", exam_prep_id: "p", node_id: "n" },
      { id: "j2", status: "creating", updated_at: "2026-10-18T05:58:00Z", user_id: "u1", exam_prep_id: "p", node_id: "n" },
      { id: "j3", status: "ready", updated_at: "2026-10-18T05:00:00Z", user_id: "u1", exam_prep_id: "p", node_id: "n" },
    ],
    audit: [],
  };
}

describe("günlük özet: sayım", () => {
  it("son 24 saati sayar; yavaş üretim başarısız sayılmaz; takılı iş yalnız 10 dk'dan eski creating", async () => {
    const digest = await collectDailyDigest(client(state()), { now: NOW });
    expect(digest.signups).toBe(2);
    expect(digest.payments).toEqual({ paid: 2, paidKurus: 119800, failed: 1, pending: 0, refunded: 0 });
    expect(digest.failures.total).toBe(3);
    expect(digest.failures.slow).toBe(1);
    expect(digest.failures.byReason[0]).toMatchObject({ reason: "concept_dropped", label: "Kavram atıldı (düzelmedi)", count: 2 });
    expect(digest.stuck).toBe(1);
  });

  it("TRT günü anahtarı ve alıcı", () => {
    expect(digestDayKey(new Date("2026-10-17T22:30:00Z"))).toBe("2026-10-18");
    expect(digestRecipient({})).toBe("cortexplus@cortexplus.app");
    expect(digestRecipient({ ADMIN_DIGEST_EMAIL: "off" })).toBeNull();
    expect(digestRecipient({ ADMIN_DIGEST_EMAIL: "ops@example.com" })).toBe("ops@example.com");
  });
});

describe("günlük özet: metin", () => {
  it("konu satırı sayıları taşır, sorun varsa Dikkat ile başlar; kişisel veri yok", async () => {
    const digest = await collectDailyDigest(client(state()), { now: NOW });
    const mail = renderDailyDigest(digest, "https://cortexplus.app");
    expect(mail.subject).toMatch(/^Dikkat · Cortex Plus günlük özet · 18 Ekim 2026 · 2 kayıt · 2 ödeme · 3 hata$/);
    expect(mail.text).toContain("Yeni kayıt: 2");
    expect(mail.text).toContain("1 başarısız");
    expect(mail.text).toContain("Kavram atıldı (düzelmedi): 2");
    expect(mail.text).toContain("1 yavaş/yeniden yazım");
    expect(mail.html).toContain("/admin/ders-hatalari");
    expect(mail.text).not.toMatch(/@(?!cortexplus\.app)/);
  });

  it("sakin günde konu Dikkat ile başlamaz", () => {
    const mail = renderDailyDigest({
      from: "2026-10-17T06:00:00Z",
      to: NOW.toISOString(),
      signups: 0,
      payments: { paid: 0, paidKurus: 0, failed: 0, pending: 0, refunded: 0 },
      failures: { total: 0, slow: 0, byReason: [] },
      stuck: 0,
    });
    expect(mail.subject.startsWith("Cortex Plus günlük özet")).toBe(true);
    expect(mail.text).toContain("Dikkat isteyen bir şey yok.");
  });
});

describe("günlük özet: gönderim", () => {
  it("gönderir ve günlüğe yazar; aynı gün ikinci kez göndermez; force kilidi aşar", async () => {
    const s = state();
    const send = vi.fn(async (_mail: { to: string; subject: string }) => ({ ok: true as const }));
    const first = await sendDailyDigest(client(s), { now: NOW, send });
    expect(first.ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({ to: "cortexplus@cortexplus.app" });
    expect(s.audit).toHaveLength(1);
    expect(s.audit[0]).toMatchObject({ action: DIGEST_AUDIT_ACTION, entity_id: "2026-10-18" });

    const second = await sendDailyDigest(client(s), { now: NOW, send });
    expect(second).toEqual({ ok: false, reason: "already_sent" });
    expect(send).toHaveBeenCalledTimes(1);

    const forced = await sendDailyDigest(client(s), { now: NOW, send, force: true });
    expect(forced.ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("kapalıysa ya da posta gitmezse günlüğe yazmaz", async () => {
    const s = state();
    expect(await sendDailyDigest(client(s), { now: NOW, env: { ADMIN_DIGEST_EMAIL: "off" } })).toEqual({
      ok: false,
      reason: "disabled",
    });
    const failing = vi.fn(async (_mail: { to: string }) => ({ ok: false as const, reason: "smtp_send_failed" }));
    const result = await sendDailyDigest(client(s), { now: NOW, send: failing });
    expect(result).toEqual({ ok: false, reason: "send_failed", detail: "smtp_send_failed" });
    expect(s.audit).toHaveLength(0);
  });
});

describe("günlük özet: bekçi", () => {
  const root = path.resolve(__dirname, "..", "..");
  const read = (rel: string) => readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");

  it("günlük cron'un sonunda çağrılır; üçüncü cron açılmaz", () => {
    const cron = read("src/app/api/cron/subscription-renewal/route.ts");
    expect(cron).toContain("sendDailyDigest(service, { now })");
    const vercel = JSON.parse(read("vercel.json")) as { crons: unknown[] };
    expect(vercel.crons).toHaveLength(2);
  });

  it("ders hataları sayfası sebep adlarını aynı kaynaktan okur", () => {
    expect(read("src/app/admin/ders-hatalari/page.tsx")).toContain("FAILURE_REASON_LABEL");
  });
});
