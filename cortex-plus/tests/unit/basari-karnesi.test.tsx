// @vitest-environment jsdom
/**
 * Sınav sonrası başarı toplayıcı (Faz 7, 20 Kasım 2026): "🎓 Sınavın Nasıl Geçti?" kartı, kayıt ucu ve göç.
 * Bekçi: yalnız hazırlığın sahibi; sınav gününün ertesinden önce kayıt yok; serbest metin kırpılır; hazırlık puanı
 * imzalı anlık görüntüden (tarayıcının yazdığı sayı değil); gösterim izni açıkça verilmedikçe kapalı; göçten önce
 * (tablo yok) not eski yoldan kaydedilir, yorum düşer ve söylenir, hiçbir şey çökmez; göç PGlite'ta yalnız ekleme,
 * tarayıcı rollerine kapalı; hesap silme tablo yokken de ilerler.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { message: vi.fn(), success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/learning/exam-result-load", () => ({
  loadExamBaseline: vi.fn(async () => ({ pct: 40, source: "first_day_activity" })),
}));

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const PREP = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-11-20T09:00:00.000Z");

type Row = Record<string, unknown>;

/** Tablo taklidi; `missing` tablolar PostgREST'in "tablo yok" hatasını döner. */
function fakeService(input: { preps: Row[]; missing?: string[] }) {
  const upserts: { table: string; row: Row; options: unknown }[] = [];
  const updates: { table: string; values: Row; filters: Row }[] = [];
  const service = {
    from(table: string) {
      const filters: Row = {};
      let mode: "select" | "update" = "select";
      let values: Row = {};
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        },
        update: (next: Row) => {
          mode = "update";
          values = next;
          return builder;
        },
        upsert: async (row: Row, options: unknown) => {
          if (input.missing?.includes(table)) {
            return { data: null, error: { code: "PGRST205", message: `Could not find the table 'public.${table}' in the schema cache` } };
          }
          upserts.push({ table, row, options });
          return { data: null, error: null };
        },
        maybeSingle: async () => {
          const rows = table === "exam_preps" ? input.preps : [];
          return { data: rows.find((row) => Object.entries(filters).every(([key, value]) => row[key] === value)) ?? null, error: null };
        },
        then: (resolve: (value: unknown) => unknown) => {
          if (mode === "update") updates.push({ table, values, filters: { ...filters } });
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
  return { service, upserts, updates };
}

const prepRow = (over: Row = {}) => ({ id: PREP, user_id: USER, exam_date: "2026-11-18", learning_preferences: { style: "examples", examResultSnoozedUntil: "2026-11-19" }, ...over });

let feedback: typeof import("@/lib/learning/exam-feedback");
let snapshot: typeof import("@/lib/learning/readiness-snapshot");

beforeAll(async () => {
  vi.stubEnv("APP_SECRET", "test-secret-with-enough-length-0123456789");
  vi.resetModules();
  snapshot = await import("@/lib/learning/readiness-snapshot");
  feedback = await import("@/lib/learning/exam-feedback");
});
afterAll(() => vi.unstubAllEnvs());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("hazırlık puanının imzalı anlık görüntüsü", () => {
  it("aynı hazırlık ve öğrencide okunur; başka hazırlık, başka öğrenci, bozuk imza ve süresi geçmiş belirteç okunmaz", () => {
    const token = snapshot.createReadinessToken({ prepId: PREP, userId: USER, pct: 63 }, NOW.getTime())!;
    expect(snapshot.readReadinessToken(token, { prepId: PREP, userId: USER }, NOW.getTime())).toBe(63);
    expect(snapshot.readReadinessToken(token, { prepId: PREP, userId: OTHER }, NOW.getTime())).toBeNull();
    expect(snapshot.readReadinessToken(token, { prepId: OTHER, userId: USER }, NOW.getTime())).toBeNull();
    expect(snapshot.readReadinessToken(token.replace(".63.", ".99."), { prepId: PREP, userId: USER }, NOW.getTime())).toBeNull();
    expect(snapshot.readReadinessToken(token, { prepId: PREP, userId: USER }, NOW.getTime() + snapshot.READINESS_SNAPSHOT_TTL_MS + 1)).toBeNull();
    expect(snapshot.createReadinessToken({ prepId: "x", userId: USER, pct: 50 })).toBeNull();
    expect(snapshot.createReadinessToken({ prepId: PREP, userId: USER, pct: 140 })).toBeNull();
  });
});

describe("saveExamFeedback", () => {
  it("tablo varken: yorum, imzalı puan ve kapalı izinle kaydedilir; sayısal not başarı kartını da yazar; erteleme silinir", async () => {
    const { service, upserts, updates } = fakeService({ preps: [prepRow()] });
    const token = snapshot.createReadinessToken({ prepId: PREP, userId: USER, pct: 63 }, NOW.getTime());
    const out = await feedback.saveExamFeedback(
      service as never,
      { prepId: PREP, userId: USER, actualScore: "  88 ", comment: "Çok   işime yaradı.", displayName: "  Örnek A. ", readinessToken: token },
      NOW,
    );
    expect(out).toMatchObject({ ok: true, testimonialSaved: true, result: { score: 88, baselinePct: 40 } });
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      table: "exam_feedback_testimonials",
      row: { user_id: USER, exam_prep_id: PREP, predicted_readiness_pct: 63, actual_score: "88", comment: "Çok işime yaradı.", display_name: "Örnek A.", allow_public_showcase: false },
      options: { onConflict: "exam_prep_id" },
    });
    const prefs = updates.find((row) => row.table === "exam_preps")!;
    expect(prefs.filters).toEqual({ id: PREP, user_id: USER });
    expect(prefs.values.learning_preferences).toMatchObject({ style: "examples", examResult: { score: 88 }, examFeedbackAt: NOW.toISOString() });
    expect(prefs.values.learning_preferences).not.toHaveProperty("examResultSnoozedUntil");
  });

  it("harf notu ve açık izin: yorum kaydedilir, başarı kartı yazılmaz, soru kapanır; tarayıcının yolladığı sahte puan okunmaz", async () => {
    const { service, upserts, updates } = fakeService({ preps: [prepRow()] });
    const out = await feedback.saveExamFeedback(
      service as never,
      { prepId: PREP, userId: USER, actualScore: "AA", comment: "Teşekkürler", allowPublicShowcase: true, readinessToken: "hazirlik.sahte.99" },
      NOW,
    );
    expect(out).toMatchObject({ ok: true, testimonialSaved: true, result: null });
    expect(upserts[0]!.row).toMatchObject({ actual_score: "AA", allow_public_showcase: true, predicted_readiness_pct: null });
    expect(updates[0]!.values.learning_preferences).not.toHaveProperty("examResult");
    expect(updates[0]!.values.learning_preferences).toHaveProperty("examFeedbackAt");
  });

  it("göçten önce (tablo yok): sayısal not eski yoldan kaydedilir, yorum düşer ve söylenir; harf notu nazik ret", async () => {
    const numeric = fakeService({ preps: [prepRow()], missing: ["exam_feedback_testimonials"] });
    const saved = await feedback.saveExamFeedback(numeric.service as never, { prepId: PREP, userId: USER, actualScore: "72", comment: "Yorum" }, NOW);
    expect(saved).toMatchObject({ ok: true, testimonialSaved: false, result: { score: 72 } });
    expect(numeric.updates[0]!.values.learning_preferences).toMatchObject({ examResult: { score: 72 } });
    expect(numeric.updates[0]!.values.learning_preferences).not.toHaveProperty("examFeedbackAt");
    if (saved.ok) expect(saved.message).toMatch(/Yorumunu bu sefer kaydedemedik/);

    const letter = fakeService({ preps: [prepRow()], missing: ["exam_feedback_testimonials"] });
    const refused = await feedback.saveExamFeedback(letter.service as never, { prepId: PREP, userId: USER, actualScore: "BB", comment: "Yorum" }, NOW);
    expect(refused).toMatchObject({ ok: false, status: 503, code: "feedback_unavailable" });
    expect(letter.updates).toHaveLength(0);
  });

  it("sahiplik, sınav günü ve boş alan", async () => {
    const foreign = fakeService({ preps: [prepRow({ user_id: OTHER })] });
    expect(await feedback.saveExamFeedback(foreign.service as never, { prepId: PREP, userId: USER, actualScore: "80", comment: "x" }, NOW)).toMatchObject({ ok: false, status: 404 });
    expect(foreign.upserts).toHaveLength(0);
    const today = fakeService({ preps: [prepRow({ exam_date: "2026-11-20" })] });
    expect(await feedback.saveExamFeedback(today.service as never, { prepId: PREP, userId: USER, actualScore: "80", comment: "x" }, NOW)).toMatchObject({ ok: false, status: 409, code: "exam_not_passed" });
    const blank = fakeService({ preps: [prepRow()] });
    expect(await feedback.saveExamFeedback(blank.service as never, { prepId: PREP, userId: USER, actualScore: "   ", comment: "x" }, NOW)).toMatchObject({ ok: false, status: 400 });
  });

  it("uç: oturum, hız sınırı ve şema; kaydı ortak işleve bırakır", () => {
    const route = read("src/app/api/learning/exam-prep/exam-feedback/route.ts");
    expect(route).toContain('withUser(request, { scope: "exam-feedback"');
    expect(route).toContain("bodySchema.safeParse");
    expect(route).toContain("saveExamFeedback(service, { ...parsed.data, userId })");
    expect(route).not.toMatch(/parsed\.data\.userId|readinessPct/);
  });
});

describe("göç (PGlite)", () => {
  const db = new PGlite();
  beforeAll(async () => {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE TABLE public.exam_preps (id uuid PRIMARY KEY, user_id uuid);
      INSERT INTO auth.users VALUES ('${USER}'), ('${OTHER}');
      INSERT INTO public.exam_preps VALUES ('${PREP}', '${USER}');`);
    const sql = read("supabase/migrations/20261120141000_faz7_basari_karnesi.sql");
    await db.exec(sql);
    await db.exec(sql); // iki kez çalıştırmak zararsız
  }, 60_000);
  afterAll(() => db.close());

  it("yalnız ekleme; hazırlık başına tek satır; varsayılan izin kapalı; tarayıcı rollerine kapalı; silinince gider", async () => {
    const sql = read("supabase/migrations/20261120141000_faz7_basari_karnesi.sql");
    // 20 Kasım 2026, #712 yayınından sonra uygulandı.
    expect(sql.split("\n")[0]).toMatch(/^-- UYGULANDI: 20 Kasım 2026/);
    expect(sql).not.toMatch(/^\s*(DROP|DELETE|UPDATE|TRUNCATE)\b/im);
    await db.query(`INSERT INTO exam_feedback_testimonials (user_id, exam_prep_id, actual_score, comment) VALUES ($1, $2, '85', 'iyi')`, [USER, PREP]);
    const { rows } = await db.query<{ allow_public_showcase: boolean; predicted_readiness_pct: string | null }>("SELECT allow_public_showcase, predicted_readiness_pct FROM exam_feedback_testimonials");
    expect(rows[0]).toEqual({ allow_public_showcase: false, predicted_readiness_pct: null });
    await expect(db.query(`INSERT INTO exam_feedback_testimonials (user_id, exam_prep_id, actual_score, comment) VALUES ($1, $2, '90', 'ikinci')`, [USER, PREP])).rejects.toThrow(/duplicate key|unique/i);
    await expect(db.query(`INSERT INTO exam_feedback_testimonials (user_id, exam_prep_id, comment) VALUES ($1, $2, 'notsuz')`, [OTHER, PREP])).rejects.toThrow(/null/i);
    const privileges = await db.query<{ anon: boolean; auth: boolean; service: boolean; rls: boolean }>(`SELECT
      has_table_privilege('anon', 'public.exam_feedback_testimonials', 'SELECT') AS anon,
      has_table_privilege('authenticated', 'public.exam_feedback_testimonials', 'INSERT') AS auth,
      has_table_privilege('service_role', 'public.exam_feedback_testimonials', 'INSERT') AS service,
      (SELECT relrowsecurity FROM pg_class WHERE relname = 'exam_feedback_testimonials') AS rls`);
    expect(privileges.rows[0]).toEqual({ anon: false, auth: false, service: true, rls: true });
    await db.query("DELETE FROM public.exam_preps WHERE id = $1", [PREP]);
    expect((await db.query("SELECT 1 FROM exam_feedback_testimonials")).rows).toHaveLength(0);
  });
});

describe("hesap silme", () => {
  it("tablo listede ve isteğe bağlı: tablo yokken silme ilerler", async () => {
    const source = read("src/lib/privacy/account-deletion.ts");
    const list = source.slice(source.indexOf("const USER_CONTENT_TABLES"), source.indexOf("] as const;"));
    const optional = source.slice(source.indexOf("const OPTIONAL_PURGE_TABLES"), source.indexOf("]);", source.indexOf("const OPTIONAL_PURGE_TABLES")));
    expect(list).toContain('"exam_feedback_testimonials"');
    expect(optional).toContain('"exam_feedback_testimonials"');

    const deleted: string[] = [];
    const service = {
      from(table: string) {
        let operation = "";
        const query: Record<string, unknown> = {
          select: () => ((operation = "select"), query),
          update: () => ((operation = "update"), query),
          delete: () => ((operation = "delete"), query),
          eq: () => query,
          in: () => query,
          limit: () => query,
          then: (resolve: (value: unknown) => unknown) => {
            if (operation === "delete" && table === "exam_feedback_testimonials") {
              return Promise.resolve(resolve({ data: null, error: { code: "PGRST205", message: "Could not find the table in the schema cache" } }));
            }
            if (operation === "delete") deleted.push(table);
            if (table === "payments") return Promise.resolve(resolve({ data: null, count: 0, error: null }));
            return Promise.resolve(resolve({ data: table === "documents" ? [] : null, error: null }));
          },
        };
        return query;
      },
      storage: { from: () => ({ remove: async () => ({ error: null }) }) },
      auth: { admin: { deleteUser: async () => ({ error: null }) } },
    };
    const { purgeUserData } = await import("@/lib/privacy/account-deletion");
    expect(await purgeUserData(service as never, USER)).toEqual({ ok: true });
    expect(deleted).toContain("exam_preps");
  });
});

describe("kart", () => {
  it("soru, hazırlık puanı, işaretsiz izin kutusu; gönderim yeni uca imzalı belirteçle; erteleme eski uçta", async () => {
    const { ExamResultCard, EXAM_FEEDBACK_URL, EXAM_RESULT_URL } = await import("@/components/parity/exam-result-card");
    const { EXAM_FEEDBACK_TITLE, EXAM_FEEDBACK_SHOWCASE_CONSENT, examFeedbackLead } = await import("@/lib/learning/exam-result");
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        calls.push({ url, body });
        const payload = body.later ? { ok: true, snoozed: true } : { ok: true, testimonialSaved: true, result: null, message: "Teşekkürler! Notun ve yorumun kaydedildi." };
        return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );
    render(<ExamResultCard prepId={PREP} due stored={null} landingUrl="https://cortexplus.app/" readinessPct={63} readinessToken="imzali-belirtec" />);
    expect(screen.getByRole("heading", { name: EXAM_FEEDBACK_TITLE })).toBeTruthy();
    expect(screen.getByText(examFeedbackLead(63))).toBeTruthy();
    expect(examFeedbackLead(63)).toBe("Sınav öncesi Cortex Plus hazırlık puanın %63 idi. Gerçek sınavdan kaç aldın?");
    expect(examFeedbackLead(0)).toBe("Gerçek sınavdan kaç aldın?");
    const consent = screen.getByLabelText(EXAM_FEEDBACK_SHOWCASE_CONSENT) as HTMLInputElement;
    expect(consent.checked).toBe(false);
    const send = screen.getByRole("button", { name: "Gönder" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Sınav notun"), { target: { value: "AA" } });
    fireEvent.change(screen.getByLabelText("Kısa yorumun"), { target: { value: "Çok yardımcı oldu" } });
    fireEvent.click(send);
    expect(await screen.findByText(/Teşekkürler! Notun ve yorumun kaydedildi\./)).toBeTruthy();
    expect(calls[0]).toEqual({
      url: EXAM_FEEDBACK_URL,
      body: { prepId: PREP, actualScore: "AA", comment: "Çok yardımcı oldu", displayName: null, allowPublicShowcase: false, readinessToken: "imzali-belirtec" },
    });
    cleanup();

    render(<ExamResultCard prepId={PREP} due stored={null} landingUrl="https://cortexplus.app/" />);
    fireEvent.click(screen.getByText("Notum henüz açıklanmadı"));
    await vi.waitFor(() => expect(screen.queryByRole("heading", { name: EXAM_FEEDBACK_TITLE })).toBeNull());
    expect(calls[1]).toEqual({ url: EXAM_RESULT_URL, body: { prepId: PREP, later: true } });
    cleanup();

    // × bu ziyaret için kapatır, istek atmaz.
    render(<ExamResultCard prepId={PREP} due stored={null} landingUrl="https://cortexplus.app/" />);
    fireEvent.click(screen.getByRole("button", { name: "Kartı kapat" }));
    expect(screen.queryByRole("heading", { name: EXAM_FEEDBACK_TITLE })).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it("sayfa: yorum verildiyse soru kapanır; puan sayfanın gösterdiği sayıdan imzalanır", async () => {
    const { examResultDue } = await import("@/lib/learning/exam-result");
    expect(examResultDue({ examDate: "2026-11-18", today: "2026-11-20" })).toBe(true);
    expect(examResultDue({ examDate: "2026-11-18", today: "2026-11-20", feedbackAt: NOW.toISOString() })).toBe(false);
    expect(examResultDue({ examDate: "2026-11-20", today: "2026-11-20" })).toBe(false);
    const page = read("src/app/deneme-sinavlari/[prepId]/page.tsx");
    expect(page).toContain("feedbackAt: resultPrefs.examFeedbackAt ?? null");
    expect(page).toContain("readinessPct: progressView.scorePct");
    expect(page).toContain("createReadinessToken({ prepId: prep.id as string, userId: user.id, pct: progressView.scorePct })");
    const { parseLearningPreferences } = await import("@/lib/learning/exam-prep-ui-path");
    expect(parseLearningPreferences({ examFeedbackAt: NOW.toISOString() }).examFeedbackAt).toBe(NOW.toISOString());
    expect(parseLearningPreferences({ examFeedbackAt: "dün" })).not.toHaveProperty("examFeedbackAt");
  });
});

