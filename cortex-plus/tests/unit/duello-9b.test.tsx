// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PGlite } from "@electric-sql/pglite";

/*
  Düello 9B (15 Kasım 2026, Burhan onayı: "20 kredi ücreti ve günlük sınırı ONAYLIYORUM"; aynı gün "bayrakla birleştir").
  Yeni kurma kuralları `duel.v2` bayrağı arkasında: DUEL_GENERATE (20 kredi), günlük kurma sınırı (ücretsiz 1, Plus /
  Sınav Haftası 10, Sigma 30, kurucu sınırsız), düello seti istem eki, kendi notundan yazılan düelloda kurucuya paylaşım
  uyarısı. Bayrak KAPALIYKEN bugünkü düello birebir aynı (fiyat, sınır, istem). `duel.enabled` adına dokunulmadı.
*/

// ---- Uç için sahte bağımlılıklar (model, kredi ve veritabanı yok) ----
const h = vi.hoisted(() => ({
  flag: false,
  todayCount: 0,
  plan: "free" as "free" | "plus" | "sigma",
  founder: false,
  generateCalls: [] as Array<Record<string, unknown>>,
  refusedWith: [] as string[],
  dailyCalls: 0,
}));

vi.mock("@/lib/api/guards", () => ({
  withUser: async () => ({ ok: true, ctx: { userId: "u-1", service: fakeRouteService() } }),
  errorResponse: (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json" } }),
}));
vi.mock("@/lib/admin/feature-flags", () => ({
  isFeatureEnabled: async (_service: unknown, key: string) => key === "duel.v2" && h.flag,
}));
vi.mock("@/lib/billing/free-lesson-gate", () => ({
  FREE_LESSON_CODE: "free_lesson_limit",
  freeLessonRefused: async (_service: unknown, _user: string, action: string) => {
    h.refusedWith.push(action);
    return false;
  },
}));
vi.mock("@/lib/ai/generate", () => ({ isPremiumUser: async () => false }));
vi.mock("@/lib/learning/student-pedagogy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/learning/student-pedagogy")>()),
  studentOptionCount: async () => 5,
}));
vi.mock("@/lib/learning/source-context", () => ({
  EMPTY_SOURCE_CONTEXT: { block: "" },
  loadSourceContext: async () => ({
    block: "\nKAYNAK ALINTILARI:\n[1] Serbest düşme: bu derste yerçekimi ivmesi g = 10 m/s² alınız.",
  }),
}));
vi.mock("@/lib/credits/service", () => ({ commitCredits: async () => undefined, refundCredits: async () => undefined }));
vi.mock("@/lib/billing/entitlements", () => ({
  getUserEntitlements: async () => ({ plan: h.plan, isPremium: h.plan !== "free" }),
}));
vi.mock("@/lib/billing/free-preview", () => ({ billingExempt: async () => h.founder }));
vi.mock("@/lib/learning/exam-quiz-generate", () => ({
  generateExamQuiz: async (input: Record<string, unknown>) => {
    h.generateCalls.push(input);
    const questions = Array.from({ length: 7 }, (_, i) => ({
      text: `Soru ${i + 1}`,
      options: ["A", "B", "C", "D", "E"],
      correct: ["A"],
      multi: false,
    }));
    return { ok: true, questions, reservationId: "r-1" };
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/duello/abc12345",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

function fakeRouteService() {
  const chain = (table: string) => {
    const filters: Record<string, unknown> = {};
    const q: Record<string, unknown> = {};
    q.select = (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) {
        // Günlük sınır sayımı (yalnız bayrak açıkken çağrılmalı).
        h.dailyCalls += 1;
        const counter = {
          eq: () => counter,
          gte: async () => ({ count: h.todayCount, error: null }),
        };
        return counter;
      }
      return q;
    };
    q.eq = (column: string, value: unknown) => {
      filters[column] = value;
      return q;
    };
    q.limit = async () => ({ data: [], error: null });
    q.maybeSingle = async () => {
      if (table === "exam_preps") {
        return { data: { id: "p-1", title: "Fizik", exam_type: "YKS", active_topic_id: null, document_id: "d-1" }, error: null };
      }
      return { data: null, error: null };
    };
    q.insert = async () => ({ error: null });
    return q;
  };
  return { from: chain } as never;
}

async function postDuel() {
  const { POST } = await import("@/app/api/learning/exam-prep/duel/route");
  return POST(
    new Request("https://cortexplus.app/api/learning/exam-prep/duel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prepId: "11111111-1111-4111-8111-111111111111" }),
    }),
  );
}

const read = (path: string) => readFileSync(path, "utf8");

beforeEach(() => {
  h.flag = false;
  h.todayCount = 0;
  h.plan = "free";
  h.founder = false;
  h.generateCalls = [];
  h.refusedWith = [];
  h.dailyCalls = 0;
});
afterEach(() => cleanup());

/** Bugünkü (main, #673 öncesi) uçtaki istemin son satırı: bayrak kapalıyken istem burada biter. */
const TODAY_PROMPT_END =
  "Her soruyu göndermeden önce bilimsel ve matematiksel doğruluğunu kontrol et. Soru kökü ile doğru seçenek tam olarak uyuşsun.";

describe("bayrak KAPALI: bugünkü düello birebir (regresyon)", () => {
  it("QUIZ_GENERATE (10 kredi), günlük sınır yok, istem eki yok, eylem kodu verilmez", async () => {
    h.todayCount = 50; // bayrak kapalıyken sayılmamalı
    const res = await postDuel();
    expect(res.status).toBe(200);
    expect(h.refusedWith).toEqual(["QUIZ_GENERATE"]);
    expect(h.dailyCalls).toBe(0);
    expect(h.generateCalls).toHaveLength(1);
    const input = h.generateCalls[0];
    expect("actionCode" in input).toBe(false); // generateExamQuiz varsayılanı QUIZ_GENERATE
    const prompt = String(input.userPrompt);
    expect(prompt.endsWith(TODAY_PROMPT_END)).toBe(true);
    expect(prompt).not.toContain("DÜELLO SETİ");
  });

  it("statik kapı ve fiyat bugünkü gibi: duel.start → QUIZ_GENERATE, DUEL_ACCESS günlük hak yok", async () => {
    const { ACTION_CODE, actionCost, DUEL_ACCESS } = await import("@/lib/entitlements/config");
    expect(ACTION_CODE["duel.start"]).toBe("QUIZ_GENERATE");
    expect(actionCost("duel.start")).toBe(10);
    expect(DUEL_ACCESS.dailyLimit).toBeNull();
  });
});

describe("bayrak AÇIK: 20 kredi, günlük sınır, istem eki", () => {
  it("DUEL_GENERATE ile ücretlenir, istem eki sonda; öbür bütün üretim girdileri bayrak kapalıyla aynı", async () => {
    await postDuel();
    const off = h.generateCalls[0];
    h.generateCalls = [];
    h.refusedWith = [];
    h.flag = true;
    const res = await postDuel();
    expect(res.status).toBe(200);
    expect(h.refusedWith).toEqual(["DUEL_GENERATE"]);
    const on = h.generateCalls[0];
    expect(on.actionCode).toBe("DUEL_GENERATE");
    const { DUEL_SET_RULE } = await import("@/lib/learning/duel-prompt");
    expect(String(on.userPrompt)).toBe(`${String(off.userPrompt)}\n${DUEL_SET_RULE}`);
    // Denetim atlanmaz: kaynak, kaynak desteği şartı, deneme sayısı, kimlik dışı her alan aynı; "sanity" kapatılmaz.
    const strip = (x: Record<string, unknown>) => {
      const { actionCode: _a, userPrompt: _p, idempotencyKey: _i, service: _s, ...rest } = x;
      return rest;
    };
    expect(strip(on)).toEqual(strip(off));
    expect(on).not.toHaveProperty("sanity");
    expect(on.requireSourceSupport).toBe(true);
  });

  it("sınıra gelince üretimden önce 429 ve açık ileti; altındaysa kurar", async () => {
    h.flag = true;
    h.todayCount = 1; // ücretsiz: 1
    const res = await postDuel();
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe("duel_daily_limit");
    expect(body.error).toBe(
      "Bugün en çok 1 düello kurabilirsin. Kurduğun düelloları oynamak, botla oynamak ve rövanş açık; yarın yeniden kurabilirsin.",
    );
    expect(h.generateCalls).toHaveLength(0);
    h.plan = "plus";
    h.todayCount = 9;
    expect((await postDuel()).status).toBe(200);
    h.todayCount = 10;
    expect((await postDuel()).status).toBe(429);
    h.founder = true;
    h.todayCount = 500;
    expect((await postDuel()).status).toBe(200);
  });

  it("ücretsiz hesapta kredi yetmezse hata değil yükseltme penceresi (402 → CreditGate → UpgradeSheet)", () => {
    const button = read("src/components/duel/new-duel-button.tsx");
    expect(button).toMatch(/if \(res\.status === 402\) \{\s*setPaywall\(true\);/);
    expect(read("src/components/paywall/credit-gate.tsx")).toContain("<UpgradeSheet");
    // Günlük sınır iletisi öğrenciye olduğu gibi gösterilir (toast).
    expect(button).toContain('throw new Error(data?.error ?? "Düello kurulamadı. Biraz sonra yeniden dene.")');
  });
});

describe("hocanın kuralı (SOURCE_NUMBER_PRIORITY) ve denetim atlanmaz", () => {
  it("istem eki kaynak sayı önceliğini aynen taşır; ders/konu sözcüğü yok", async () => {
    const { DUEL_SET_RULE } = await import("@/lib/learning/duel-prompt");
    const { SOURCE_NUMBER_PRIORITY } = await import("@/lib/learning/teaching-rubric");
    expect(DUEL_SET_RULE.endsWith(SOURCE_NUMBER_PRIORITY)).toBe(true);
    const own = DUEL_SET_RULE.replace(SOURCE_NUMBER_PRIORITY, "").replace("20 saniyede", "");
    expect(own).not.toMatch(/\d{2,}/);
    expect(own).not.toMatch(/matematik|fizik|kimya|biyoloji|tarih|hücre|fonksiyon/i);
  });

  it("notta g = 10 ise: kaynak alıntısı yazara gider, istem eki kuralların ALTINDA (İSTEK), sistem istemi önceliği söyler", async () => {
    h.flag = true;
    await postDuel();
    const input = h.generateCalls[0];
    expect(String(input.sourceExcerpt)).toContain("g = 10 m/s² alınız");
    const { quizSystem, quizUserPrompt } = await import("@/lib/learning/teacher-quiz");
    const { SOURCE_NUMBER_PRIORITY } = await import("@/lib/learning/teaching-rubric");
    // generateExamQuiz'in teacher motoruna verdiği biçim (exam-quiz-generate.ts): kaynak varsa "document" kipi.
    const motorInput = {
      topicLabel: "Serbest düşme",
      prepTitle: "Fizik",
      pages: [],
      mode: "document" as const,
      count: 9,
      sourceBlock: String(input.sourceExcerpt).trim(),
      brief: String(input.userPrompt),
    };
    const system = quizSystem("document");
    const user = quizUserPrompt(motorInput as never);
    expect(system).toContain(SOURCE_NUMBER_PRIORITY);
    expect(user).toContain("İSTEK (kurallarla çelişirse kurallar geçerli):");
    expect(user).toContain("g = 10 m/s² alınız");
    expect(user.indexOf("İSTEK")).toBeLessThan(user.indexOf("g = 10"));
  });
});

describe("günlük sınır sayımı", () => {
  it("İstanbul günü; plan başına; kurucu yok", async () => {
    const { istanbulDayStartIso } = await import("@/lib/learning/duel-daily");
    expect(istanbulDayStartIso(new Date("2026-11-14T22:30:00Z"))).toBe("2026-11-15T00:00:00+03:00");
    const { duelDailyLimit, DUEL_V2_DAILY_LIMIT } = await import("@/lib/entitlements/config");
    expect(DUEL_V2_DAILY_LIMIT).toEqual({ free: 1, plus: 10, sigma: 30 });
    expect(duelDailyLimit("sigma", true)).toBeNull();
  });
});

describe("göç: yalnız ekleme, geri alma yalnız o satırı kapatır", () => {
  it("credit_rules'a yalnız DUEL_GENERATE eklenir; var olan satırlar ve tablo aynı kalır", async () => {
    const db = new PGlite();
    const init = read("supabase/migrations/20250825120000_init.sql");
    const table = init.slice(init.indexOf("CREATE TABLE public.credit_rules"), init.indexOf("CREATE TABLE public.credit_ledger"));
    await db.exec(table);
    await db.exec(`INSERT INTO public.credit_rules(action_code, credit_cost, description) VALUES
      ('QUIZ_GENERATE', 10, 'Test'), ('AI_CHAT_STANDARD', 3, 'Mesaj');`);
    const snapshot = async () =>
      (
        await db.query<{ action_code: string; credit_cost: number; active: boolean; description: string }>(
          "SELECT action_code, credit_cost, active, description FROM public.credit_rules ORDER BY action_code",
        )
      ).rows;
    const columns = async () =>
      (await db.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'credit_rules' ORDER BY ordinal_position",
      )).rows.map((r) => r.column_name);
    const before = await snapshot();
    const colsBefore = await columns();
    const sql = read("supabase/migrations/20261115140000_duel_generate_credits.sql");
    expect(sql).not.toMatch(/\b(DROP|DELETE|TRUNCATE|ALTER)\b/i);
    await db.exec(sql);
    const after = await snapshot();
    expect(await columns()).toEqual(colsBefore);
    expect(after.filter((r) => r.action_code !== "DUEL_GENERATE")).toEqual(before);
    expect(after.find((r) => r.action_code === "DUEL_GENERATE")).toMatchObject({ credit_cost: 20, active: true });
    // İkinci kez uygulamak bozmaz.
    await db.exec(sql);
    expect((await snapshot()).length).toBe(after.length);
    // Geri alma: yalnız o satır kapanır, silinmez.
    const rollback = read("supabase/rollback/20261115_duello_9b_geri_al.sql");
    expect(rollback).not.toMatch(/\b(DROP|DELETE|TRUNCATE|ALTER)\b/i);
    await db.exec(rollback);
    const rolled = await snapshot();
    expect(rolled.filter((r) => r.action_code !== "DUEL_GENERATE")).toEqual(before);
    expect(rolled.find((r) => r.action_code === "DUEL_GENERATE")).toMatchObject({ active: false, credit_cost: 20 });
    await db.close();
  });

  it("fiyat tablosu ile göç aynı sayı; ücretsizde ders sayacı (Plus değil, hediye bakiyesiyle açılır)", async () => {
    const { CREDIT_PRICE_TABLE } = await import("@/lib/credits/price-table");
    expect(CREDIT_PRICE_TABLE.DUEL_GENERATE.credits).toBe(20);
    const { defaultFreeMeter, isPlusOnlyAction } = await import("@/lib/billing/free-meters");
    expect(defaultFreeMeter("DUEL_GENERATE")).toBe("lesson");
    expect(isPlusOnlyAction("DUEL_GENERATE")).toBe(false);
  });
});

describe("paylaşım uyarısı ve panel", () => {
  const QUESTIONS = [{ text: "Soru 1?", options: ["A", "B", "C", "D", "E"] }];

  it("verilince paylaşım düğmelerinin altında, verilmezse yok", async () => {
    const { DuelPlay } = await import("@/components/duel/duel-play");
    const { DUEL_NOTE_SHARE_WARNING } = await import("@/lib/learning/duel-share");
    expect(DUEL_NOTE_SHARE_WARNING).toBe("Sorular senin notundan hazırlandı; bağlantıyı alan herkes soruları görür.");
    const { unmount } = render(
      <DuelPlay code="abc12345" title="Deneme" topic={null} creatorName="Ayşe" questions={QUESTIONS} initialBoard={[]} signedIn shareWarning={DUEL_NOTE_SHARE_WARNING} />,
    );
    const note = screen.getByText(DUEL_NOTE_SHARE_WARNING);
    const actions = document.querySelector(".cp-duel-actions");
    expect(actions!.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    unmount();
    render(<DuelPlay code="abc12345" title="Deneme" topic={null} creatorName="Ayşe" questions={QUESTIONS} initialBoard={[]} signedIn />);
    expect(screen.queryByText(DUEL_NOTE_SHARE_WARNING)).toBeNull();
  });

  it("sayfa uyarıyı yalnız bayrak açık + kurucu + belgeli hazırlıkta verir", () => {
    const page = read("src/app/duello/[code]/page.tsx");
    expect(page).toMatch(
      /userId && userId === duel\.creator_id && duel\.exam_prep_id && \(await isFeatureEnabled\(service, DUEL_V2_FLAG, userId\)\)/,
    );
    expect(page).toContain("if (prep?.document_id) shareWarning = DUEL_NOTE_SHARE_WARNING;");
  });

  it("panelde duel.v2 satırı ve yalnız kurucuya açma; duel.enabled adı kullanılmaz", () => {
    const flags = read("src/app/admin/feature-flags/page.tsx");
    expect(flags).toContain('key: "duel.v2"');
    expect(flags).toContain('const PILOT_SELF = new Set(["duel.v2", "teacher.v2"]);');
    const actions = read("src/app/admin/actions.ts");
    expect(actions).toContain('const SELF_PILOT_FLAGS = ["duel.v2", "teacher.v2"] as const;');
    // Satır yoksa kapalı oluşturulur (arada herkese açılmasın).
    expect(actions).toMatch(/insert\(\{\s*key: parsed\.data\.key,\s*enabled: false,/);
    for (const path of ["src/app/api/learning/exam-prep/duel/route.ts", "src/app/duello/[code]/page.tsx", "src/lib/entitlements/config.ts"]) {
      expect(read(path)).not.toMatch(/["']duel\.enabled["']/);
    }
  });
});
