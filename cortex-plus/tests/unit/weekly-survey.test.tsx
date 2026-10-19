// @vitest-environment jsdom
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { WeeklySurveyCard } from "@/components/feedback/weekly-survey-card";
import { SURVEY_COPY, isoWeekKey, summarizeWeeks, surveyAnswerSchema } from "@/lib/feedback/weekly-survey";
import { surveyEligibility } from "@/lib/feedback/weekly-survey-server";
import { familiarityLabel, failureReasonLabel, nodeKindLabel, subscriptionStatusLabel } from "@/lib/admin/support-labels";

/**
 * Haftalık kısa anket (19 Ekim 2026, kapalı beta; ürün sahibinin kararı: "Uygulama içi haftalık
 * kısa anket"). Dört soru, haftada en çok bir kez, yalnız o hafta çalışan ve hesabı iki günden
 * eski öğrenciye, Sınavlar sayfasında; cevaplar /admin/anket'te.
 */
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("anket: hafta ve özet", () => {
  it("İstanbul saatiyle ISO hafta; pazar gecesi yarısı yeni hafta", () => {
    expect(isoWeekKey(new Date("2026-10-19T09:00:00Z"))).toBe("2026-W43");
    expect(isoWeekKey(new Date("2026-10-18T20:30:00Z"))).toBe("2026-W42"); // Pazar 23:30 TRT
    expect(isoWeekKey(new Date("2026-10-18T21:30:00Z"))).toBe("2026-W43"); // Pazartesi 00:30 TRT
    expect(isoWeekKey(new Date("2027-01-01T09:00:00Z"))).toBe("2026-W53");
    expect(isoWeekKey(new Date("2027-01-04T09:00:00Z"))).toBe("2027-W01");
  });

  it("özet: cevap, şimdi değil, yardım ortalaması, tavsiye puanı, en çok kullanılan", () => {
    const row = (week: string, helpfulness: number | null, recommend: number | null, most: string | null, dismissed = false) => ({
      week_key: week,
      dismissed,
      helpfulness,
      recommend,
      most_used: most,
    });
    const [latest, older] = summarizeWeeks([
      row("2026-W43", 5, 10, "lesson"),
      row("2026-W43", 4, 9, "lesson"),
      row("2026-W43", 2, 3, "podcast"),
      row("2026-W43", 3, 7, null),
      row("2026-W43", null, null, null, true),
      row("2026-W42", 4, 8, "quiz"),
    ]);
    expect(latest).toEqual({
      week: "2026-W43",
      answers: 4,
      dismissed: 1,
      helpfulness: 3.5,
      nps: 25, // 2 öneren − 1 eleştiren, 4 cevap
      mostUsed: [
        { id: "lesson", label: "Ders", count: 2 },
        { id: "podcast", label: "Podcast", count: 1 },
      ],
    });
    expect(older).toMatchObject({ week: "2026-W42", answers: 1, nps: 0 });
  });

  it("cevap şeması: puanlar aralıkta, öneri en çok 600 harf, şimdi değil boş gövde", () => {
    expect(surveyAnswerSchema.safeParse({ action: "dismiss" }).success).toBe(true);
    expect(surveyAnswerSchema.safeParse({ action: "answer", helpfulness: 5, recommend: 10, mostUsed: "video" }).success).toBe(true);
    expect(surveyAnswerSchema.safeParse({ action: "answer", helpfulness: 6, recommend: 10 }).success).toBe(false);
    expect(surveyAnswerSchema.safeParse({ action: "answer", helpfulness: 3, recommend: 11 }).success).toBe(false);
    expect(surveyAnswerSchema.safeParse({ action: "answer", helpfulness: 3, recommend: 5, improve: "x".repeat(601) }).success).toBe(false);
  });
});

type Row = Record<string, unknown>;
function fakeService(tables: Record<string, Row[]>): SupabaseClient {
  return {
    from(name: string) {
      const rows = tables[name] ?? [];
      const filters: ((row: Row) => boolean)[] = [];
      let head = false;
      const matching = () => rows.filter((row) => filters.every((filter) => filter(row)));
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
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
        then: (resolve: (value: { data: Row[] | null; count: number; error: null }) => void) =>
          resolve({ data: head ? null : matching(), count: matching().length, error: null }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe("anket: kime gösterilir", () => {
  const now = new Date("2026-10-19T09:00:00Z");
  const base = () => ({
    feature_flags: [{ key: "weekly_survey", enabled: true }],
    weekly_surveys: [] as Row[],
    profiles: [{ id: "u", created_at: "2026-10-01T00:00:00Z" }],
    exam_prep_node_attempts: [{ user_id: "u", created_at: "2026-10-18T10:00:00Z" }],
  });

  it("o hafta çalışan, iki günden eski hesaba gösterilir", async () => {
    expect(await surveyEligibility(fakeService(base()), "u", now)).toEqual({ show: true, week: "2026-W43" });
  });

  it("anahtar kapalı, bu hafta cevap/şimdi değil var, yeni hesap ya da çalışmadıysa gösterilmez", async () => {
    const off = base();
    off.feature_flags[0]!.enabled = false;
    expect(await surveyEligibility(fakeService(off), "u", now)).toMatchObject({ show: false, reason: "off" });

    const done = base();
    done.weekly_surveys.push({ id: "s", user_id: "u", week_key: "2026-W43" });
    expect(await surveyEligibility(fakeService(done), "u", now)).toMatchObject({ show: false, reason: "done" });

    const fresh = base();
    fresh.profiles[0]!.created_at = "2026-10-18T12:00:00Z";
    expect(await surveyEligibility(fakeService(fresh), "u", now)).toMatchObject({ show: false, reason: "new_account" });

    const idle = base();
    idle.exam_prep_node_attempts[0]!.created_at = "2026-10-05T10:00:00Z";
    expect(await surveyEligibility(fakeService(idle), "u", now)).toMatchObject({ show: false, reason: "inactive" });
  });

  it("geçen haftaki cevap bu haftayı kapatmaz", async () => {
    const last = base();
    last.weekly_surveys.push({ id: "s", user_id: "u", week_key: "2026-W42" });
    expect(await surveyEligibility(fakeService(last), "u", now)).toMatchObject({ show: true });
  });
});

describe("anket: kart", () => {
  function stubFetch(show: boolean) {
    const calls: { method: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        calls.push({ method, body: init?.body ? JSON.parse(String(init.body)) : null });
        return new Response(JSON.stringify(method === "GET" ? { show, week: "2026-W43" } : { ok: true }), { status: 200 });
      }),
    );
    return calls;
  }

  it("sunucu göster demezse hiçbir şey çizmez", async () => {
    stubFetch(false);
    const { container } = render(<WeeklySurveyCard />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.innerHTML).toBe("");
  });

  it("iki puan seçilmeden gönderilmez; gönderince teşekkür eder", async () => {
    const calls = stubFetch(true);
    render(<WeeklySurveyCard />);
    await screen.findByText(SURVEY_COPY.title);
    const send = screen.getByRole("button", { name: SURVEY_COPY.submit });
    expect(send).toHaveProperty("disabled", true);
    fireEvent.click(screen.getAllByRole("radio", { name: "4" })[0]!);
    fireEvent.click(screen.getAllByRole("radio", { name: "9" })[0]!);
    fireEvent.click(screen.getByRole("radio", { name: "Podcast" }));
    expect(send).toHaveProperty("disabled", false);
    fireEvent.click(send);
    await screen.findByText(SURVEY_COPY.thanks);
    expect(calls.at(-1)).toEqual({
      method: "POST",
      body: { action: "answer", helpfulness: 4, recommend: 9, mostUsed: "podcast", improve: null },
    });
  });

  it("şimdi değil: haftanın satırını yazar ve kart kapanır", async () => {
    const calls = stubFetch(true);
    const { container } = render(<WeeklySurveyCard />);
    await screen.findByText(SURVEY_COPY.title);
    fireEvent.click(screen.getByText(SURVEY_COPY.dismiss));
    await waitFor(() => expect(container.innerHTML).toBe(""));
    expect(calls.at(-1)).toEqual({ method: "POST", body: { action: "dismiss" } });
  });
});

describe("anket: göç", () => {
  const db = new PGlite();
  beforeAll(async () => {
    await db.exec(`CREATE TABLE public.profiles(id uuid PRIMARY KEY);
      CREATE TABLE public.feature_flags(key text PRIMARY KEY, enabled boolean NOT NULL DEFAULT false, description text,
        updated_at timestamptz NOT NULL DEFAULT now());
      INSERT INTO public.profiles VALUES ('11111111-1111-4111-8111-111111111111');`);
    await db.exec(read("supabase/migrations/20261019170000_weekly_surveys.sql"));
  }, 30_000);
  afterAll(() => db.close());
  const user = "11111111-1111-4111-8111-111111111111";

  it("anahtar açık gelir; kullanıcı başına haftada bir satır; cevapsız satır yalnız şimdi değil olabilir", async () => {
    const flag = await db.query<{ enabled: boolean }>("SELECT enabled FROM feature_flags WHERE key = 'weekly_survey'");
    expect(flag.rows).toEqual([{ enabled: true }]);
    await expect(db.query("INSERT INTO weekly_surveys(user_id, week_key) VALUES ($1, '2026-W43')", [user])).rejects.toThrow();
    await db.query("INSERT INTO weekly_surveys(user_id, week_key, dismissed) VALUES ($1, '2026-W43', true)", [user]);
    await expect(
      db.query("INSERT INTO weekly_surveys(user_id, week_key, helpfulness, recommend) VALUES ($1, '2026-W43', 4, 9)", [user]),
    ).rejects.toThrow();
    await db.query("INSERT INTO weekly_surveys(user_id, week_key, helpfulness, recommend, most_used) VALUES ($1, '2026-W44', 4, 9, 'lesson')", [user]);
    await expect(db.query("INSERT INTO weekly_surveys(user_id, week_key, helpfulness, recommend) VALUES ($1, 'W45', 4, 9)", [user])).rejects.toThrow();
    await expect(
      db.query("INSERT INTO weekly_surveys(user_id, week_key, helpfulness, recommend) VALUES ($1, '2026-W45', 6, 9)", [user]),
    ).rejects.toThrow();
  });
});

describe("anket ve destek görünümü: bekçi", () => {
  it("kart Sınavlar sayfasında; hafta sunucuda hesaplanır; hesap silinince satırlar gider", () => {
    expect(read("src/components/parity/exam-prep.tsx")).toContain("<WeeklySurveyCard />");
    const route = read("src/app/api/feedback/weekly/route.ts");
    expect(route).toContain("week_key: eligibility.week");
    expect(route).not.toMatch(/body\.week|week_key: answer/);
    const purge = read("src/lib/privacy/account-deletion.ts");
    for (const table of ["weekly_surveys", "star_events", "exam_wizard_drafts"]) expect(purge).toContain(`"${table}"`);
    expect(read("src/lib/admin/nav.ts")).toContain('href: "/admin/anket"');
  });

  it("destek sayfaları ham kod göstermez", () => {
    expect(nodeKindLabel("quiz")).toBe("Konu testi");
    expect(nodeKindLabel("final_check")).toBe("Son kontrol");
    expect(familiarityLabel("basics")).toBe("Temel bilgileri biliyorum");
    expect(failureReasonLabel("slow_generation")).toBe("Yavaş üretim (düzeltme turu)");
    expect(subscriptionStatusLabel("inactive")).toBe("bitti");
    expect(nodeKindLabel("yeni_tur")).toBe("yeni_tur");
    const prep = read("src/app/admin/kullanicilar/[userId]/hazirlik/[prepId]/page.tsx");
    expect(prep).toContain("nodeKindLabel(node.kind as string)");
    expect(prep).toContain("familiarityLabel(topic.familiarity as string)");
    expect(read("src/app/admin/kullanicilar/[userId]/page.tsx")).toContain("subscriptionStatusLabel(");
  });
});
