import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { makeRecordingDb, type RpcHandler } from "./helpers/recording-db";
import { readSource } from "./helpers/node-sources";

/*
  Ücretsiz hesap = deneme için TEK ders (11 Kasım 2026 akşamı, ürün sahibinin kararı).

  "Yeni kayıt olan denemesi için kayıtlı kullanıcıya sadece 1 ders ücretsiz vereceğiz. Daha fazlası için Plus'a
  yönlendireceğiz." Haftalık 3 ders hakkı kalktı; belge sınırı (tek hazırlık, toplam 25 sayfa) aynı.

  Bu dosya dört katmanı tutar:
   1. Kod kapısı (`free-lesson-gate.ts`): ders sayacına düşecek iş ücretsiz hesapta açılmaz; cüzdan bakiyesi
      (davet hediyesi) yetiyorsa onunla; abone, deneme ve önizlemesi kapalı kurucu etkilenmez.
   2. Tek giriş (`reserveCredits`): ret SQL çağrılmadan; bakiyeli ücretsiz hesap sayaçsız ayırır; mesaj, fotoğraf
      ve derse dahil sayaçları aynen.
   3. Uçlar: Çalışma Stüdyosu üretimleri, plan, zor soru ve düello kaynak okumadan ve motordan önce 402.
   4. SQL (göç 20261111180000): ders sınırı 0; öteki sınırlar, iade ve hediye davranışı aynen (PGlite'ta yayın sırasıyla).
  Yol adımı rotasının akışı (ilk dersin döngüsü açılır; "Farklı anlat", yeniden yazım, ilk olmayan hazırlık 402;
  2. konu `free_topic_limit`) gerçek rota koduyla `ilk-ders-dongusu.test.ts`te.
*/

const h = vi.hoisted(() => ({
  service: null as unknown,
  touched: [] as string[],
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: () => undefined,
}));
vi.mock("@/lib/api/guards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/guards")>()),
  withUser: async () => ({ ok: true, ctx: { userId: USER, service: h.service } }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => h.service,
  createClient: async () => h.service,
}));
// Motorlar ve kaynak okuyucuları sahte: çağrıldıklarını kaydederler. Kapı reddettiyse hiçbiri çağrılmamalı.
vi.mock("@/lib/ai/generate", () => ({
  generateJson: async () => {
    h.touched.push("generateJson");
    return { ok: false, status: 502, error: "invalid_ai_response" };
  },
  isPremiumUser: async () => false,
}));
vi.mock("@/lib/learning/exam-quiz-generate", () => ({
  generateExamQuiz: async () => {
    h.touched.push("generateExamQuiz");
    return { ok: false, status: 502, error: "generation_failed" };
  },
}));
vi.mock("@/lib/learning/teacher-engine-run", () => ({
  runWithTeacherModel: async () => {
    h.touched.push("runWithTeacherModel");
    return { ok: false, status: 502, error: "generation_failed", reasons: [] };
  },
}));
vi.mock("@/lib/learning/studio-teacher-source", () => ({
  studioTeacherSource: async () => {
    h.touched.push("source");
    return { mode: "topic", pages: [], edges: [], fileName: null, wholeDocument: false, matched: true, scopeLine: "" };
  },
}));
vi.mock("@/lib/documents/generation-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/documents/generation-context")>()),
  loadDocumentGenerationContext: async () => {
    h.touched.push("source");
    return null;
  },
}));

const USER = "00000000-0000-4000-8000-00000000aaaa";
const NOW = "2026-11-11T18:00:00.000Z";
type Row = Record<string, unknown>;

const read = (path: string) => readSource(path).replace(/\r\n/g, "\n");

/** Ücretsiz hesap: abonelik yok, yönetici değil. `balance` cüzdan bakiyesi (davet hediyesi 90 = 3 ders). */
function tables(options: { balance?: number; premium?: boolean; preview?: boolean; extra?: Record<string, Row[]> } = {}) {
  return {
    credit_wallets: [{ user_id: USER, balance: options.balance ?? 0 }],
    credit_rules: [
      { action_code: "STUDY_PLAN_GENERATE", credit_cost: 30, active: true },
      { action_code: "QUIZ_GENERATE", credit_cost: 10, active: true },
      { action_code: "FLASHCARD_GENERATE", credit_cost: 4, active: true },
      { action_code: "AI_CHAT_STANDARD", credit_cost: 3, active: true },
      { action_code: "IMAGE_SOLUTION", credit_cost: 4, active: true },
    ],
    subscriptions: options.premium
      ? [
          {
            user_id: USER,
            status: "active",
            current_period_end: "2099-01-01T00:00:00.000Z",
            cancel_at_period_end: false,
            plans: { is_premium: true, tier: "plus", name: "Plus", slug: "plus-aylik", monthly_allowance: 7200 },
          },
        ]
      : [],
    admin_free_preview: options.preview
      ? [{ user_id: USER, started_at: "2026-11-11T00:00:00.000Z", remaining: 0, period_ends_at: "2026-11-12T00:00:00.000Z" }]
      : [],
    credit_reservations: [],
    ...(options.extra ?? {}),
  } as Record<string, Row[]>;
}

/** SQL'in sahtesi: çağrıları kaydeder. Ders sayacında hak yok (göç sonrası): bakiyeden ya da `free_limit:lesson`. */
function sql(options: { admin?: boolean; balance?: number; premium?: boolean } = {}) {
  const calls: { name: string; action: string; meter: string | null }[] = [];
  let balance = options.balance ?? 0;
  const rpc: RpcHandler = (name, args) => {
    if (name === "is_admin") return { data: options.admin === true };
    if (name === "credit_reserve_metered") {
      const meter = (args.p_meter as string | null) ?? null;
      const action = String(args.p_action_code);
      calls.push({ name, action, meter });
      if (options.premium || options.admin) return { data: "res-plan" };
      const cost = { STUDY_PLAN_GENERATE: 30, QUIZ_GENERATE: 10, FLASHCARD_GENERATE: 4 }[action] ?? 3;
      if (meter === null) {
        if (balance < cost) return { error: { message: "insufficient_credits" } };
        balance -= cost;
        return { data: "res-balance" };
      }
      if (meter === "lesson") return { error: { message: "free_limit:lesson" } };
      return { data: `res-${meter}` };
    }
    if (name === "credit_claim_operation") return { data: { state: "claimed", amount: 0 } };
    return undefined;
  };
  return { calls, rpc, balance: () => balance };
}

function client(rows: Record<string, Row[]>, rpc?: RpcHandler) {
  return makeRecordingDb(rows, { timeline: [], rpc }).client;
}

beforeEach(() => {
  h.touched.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("kod kapısı: ders sayacına düşecek iş ücretsiz hesapta açılmaz", () => {
  it("ücretsiz hesap, bakiye yok: 'plus' (ders, test, kart)", async () => {
    const { freeLessonGate, freeLessonRefused, FREE_LESSON_CODE } = await import("@/lib/billing/free-lesson-gate");
    for (const action of ["STUDY_PLAN_GENERATE", "QUIZ_GENERATE", "FLASHCARD_GENERATE"] as const) {
      expect(await freeLessonGate(client(tables(), sql().rpc), USER, action), action).toBe("plus");
      expect(await freeLessonRefused(client(tables(), sql().rpc), USER, action), action).toBe(true);
    }
    expect(FREE_LESSON_CODE).toBe("free_lesson_limit");
  });

  it("cüzdan bakiyesi (davet hediyesi) işi karşılıyorsa 'gift'; yetmiyorsa 'plus'", async () => {
    const { freeLessonGate } = await import("@/lib/billing/free-lesson-gate");
    // Davet hediyesi 90 kredi = 3 ders.
    expect(await freeLessonGate(client(tables({ balance: 90 }), sql().rpc), USER, "STUDY_PLAN_GENERATE")).toBe("gift");
    expect(await freeLessonGate(client(tables({ balance: 30 }), sql().rpc), USER, "STUDY_PLAN_GENERATE")).toBe("gift");
    expect(await freeLessonGate(client(tables({ balance: 29 }), sql().rpc), USER, "STUDY_PLAN_GENERATE")).toBe("plus");
    expect(await freeLessonGate(client(tables({ balance: 10 }), sql().rpc), USER, "QUIZ_GENERATE")).toBe("gift");
    expect(await freeLessonGate(client(tables({ balance: 9 }), sql().rpc), USER, "QUIZ_GENERATE")).toBe("plus");
    // Kural satırı okunamazsa bedel fiyat tablosundan (ders 30).
    const noRules = tables({ balance: 29 });
    noRules.credit_rules = [];
    expect(await freeLessonGate(client(noRules, sql().rpc), USER, "STUDY_PLAN_GENERATE")).toBe("plus");
  });

  it("abone (Plus, kodla açılan deneme dahil) ve önizlemesi kapalı kurucu etkilenmez: 'open'", async () => {
    const { freeLessonGate } = await import("@/lib/billing/free-lesson-gate");
    expect(await freeLessonGate(client(tables({ premium: true }), sql().rpc), USER, "STUDY_PLAN_GENERATE")).toBe("open");
    expect(await freeLessonGate(client(tables(), sql({ admin: true }).rpc), USER, "QUIZ_GENERATE")).toBe("open");
  });

  it("'ücretsiz gibi gör' önizlemesindeki kurucu ücretsiz hesap gibi durur; cüzdanı hediye sayılmaz", async () => {
    const { freeLessonGate } = await import("@/lib/billing/free-lesson-gate");
    const previewing = tables({ preview: true, balance: 100_000 });
    expect(await freeLessonGate(client(previewing, sql({ admin: true }).rpc), USER, "STUDY_PLAN_GENERATE")).toBe("plus");
    // Aboneliği olan kurucu da önizlemede ücretsizdir (SQL ile aynı karar).
    const previewingPlus = tables({ preview: true, premium: true, balance: 100_000 });
    expect(await freeLessonGate(client(previewingPlus, sql({ admin: true }).rpc), USER, "QUIZ_GENERATE")).toBe("plus");
  });

  it("okuma düşerse ücretsiz iş verilmez: plan okunamıyorsa karar SQL'de ('open'), cüzdan okunamıyorsa sayaçsız ayırma ('gift')", async () => {
    const { freeLessonGate } = await import("@/lib/billing/free-lesson-gate");
    const broken = { from: () => { throw new Error("db down"); }, rpc: async () => ({ data: null, error: { message: "down" } }) };
    expect(await freeLessonGate(broken as never, USER, "STUDY_PLAN_GENERATE")).toBe("open");
    // Çağıran hesabın sayaçlı olduğunu biliyor (yol adımı): cüzdan okunamazsa ayırma sayaçsız yapılır, SQL bakiyeye bakar.
    expect(await freeLessonGate(broken as never, USER, "STUDY_PLAN_GENERATE", { metered: true })).toBe("gift");
  });
});

describe("tek giriş (reserveCredits): ret SQL'den önce; bakiye sayaçsız; öteki sayaçlar aynen", () => {
  it("ücretsiz hesapta Stüdyo işi (varsayılan sayaç ders): free_lesson_limit, SQL hiç çağrılmaz", async () => {
    const { reserveCredits, refusalCode } = await import("@/lib/credits/service");
    for (const action of ["QUIZ_GENERATE", "FLASHCARD_GENERATE", "STUDY_PLAN_GENERATE"] as const) {
      const db = sql();
      const result = await reserveCredits(client(tables(), db.rpc), USER, action, `key-${action}`);
      expect(result.ok, action).toBe(false);
      expect(result).toMatchObject({ reason: "insufficient_credits", refusal: { kind: "free_limit", meter: "lesson" } });
      expect(refusalCode(result as { reason: string }), action).toBe("free_lesson_limit");
      expect(db.calls, action).toEqual([]);
    }
  });

  it("hediye bakiyesi: iş sayaçsız ayrılır (bakiyeden); bakiye bitince free_lesson_limit ('hakkın doldu' değil)", async () => {
    const { reserveCredits, refusalCode } = await import("@/lib/credits/service");
    const db = sql({ balance: 30 });
    const rows = tables({ balance: 30 });
    const paid = await reserveCredits(client(rows, db.rpc), USER, "STUDY_PLAN_GENERATE", "gift-1");
    expect(paid.ok).toBe(true);
    // Göç uygulanmadan önce de eski haftalık sayaç artmasın diye sayaç boş gider (`credit_reserve`, bakiyeden).
    expect(db.calls).toEqual([{ name: "credit_reserve_metered", action: "STUDY_PLAN_GENERATE", meter: null }]);
    expect(db.balance()).toBe(0);
    // Kapı bakiyeyi yeterli gördü ama SQL yetmediğini söyledi (yarış): yine ders reddi.
    const raced = await reserveCredits(client(tables({ balance: 30 }), db.rpc), USER, "STUDY_PLAN_GENERATE", "gift-2");
    expect(raced.ok).toBe(false);
    expect(refusalCode(raced as { reason: string })).toBe("free_lesson_limit");
  });

  it("aynı anahtarla süren ya da bitmiş ayırma varsa kapı araya girmez (yineleme SQL'e gider)", async () => {
    const { reserveCredits } = await import("@/lib/credits/service");
    const db = sql({ balance: 10 });
    const rows = tables({ extra: { credit_reservations: [{ id: "r1", user_id: USER, idempotency_key: "same-key", status: "committed" }] } });
    await reserveCredits(client(rows, db.rpc), USER, "QUIZ_GENERATE", "same-key");
    expect(db.calls).toEqual([{ name: "credit_reserve_metered", action: "QUIZ_GENERATE", meter: null }]);
    // İade edilmiş ayırma yineleme sayılmaz.
    const refunded = sql();
    const refundedRows = tables({ extra: { credit_reservations: [{ id: "r2", user_id: USER, idempotency_key: "k2", status: "refunded" }] } });
    const result = await reserveCredits(client(refundedRows, refunded.rpc), USER, "QUIZ_GENERATE", "k2");
    expect(result.ok).toBe(false);
    expect(refunded.calls).toEqual([]);
  });

  it("abone ve kurucu: bugünkü yol (sayaç SQL'e olduğu gibi gider, SQL yok sayar)", async () => {
    const { reserveCredits } = await import("@/lib/credits/service");
    const plus = sql({ premium: true });
    expect((await reserveCredits(client(tables({ premium: true }), plus.rpc), USER, "STUDY_PLAN_GENERATE", "p1")).ok).toBe(true);
    expect(plus.calls).toEqual([{ name: "credit_reserve_metered", action: "STUDY_PLAN_GENERATE", meter: "lesson" }]);
    const founder = sql({ admin: true });
    expect((await reserveCredits(client(tables(), founder.rpc), USER, "QUIZ_GENERATE", "a1")).ok).toBe(true);
    expect(founder.calls).toEqual([{ name: "credit_reserve_metered", action: "QUIZ_GENERATE", meter: "lesson" }]);
  });

  it("aboneliği biten Plus (bakiyesiz) ders sayacındaki işte 'hakkın doldu' değil ders reddini görür; abone düz reddi", async () => {
    const { reserveCredits, refusalCode } = await import("@/lib/credits/service");
    // Abonenin hakkı biterse (SQL insufficient_credits) kod değişmez: düz `insufficient_credits`.
    const exhausted: RpcHandler = (name) =>
      name === "credit_reserve_metered" ? { error: { message: "insufficient_credits" } } : name === "is_admin" ? { data: false } : undefined;
    const result = await reserveCredits(client(tables({ premium: true }), exhausted), USER, "STUDY_PLAN_GENERATE", "plus-out");
    expect(result).toEqual({ ok: false, reason: "insufficient_credits" });
    expect(refusalCode(result as { reason: string })).toBe("insufficient_credits");
  });

  it("mesaj, fotoğraf ve derse dahil sayaçları aynen: kapı çağrılmaz, sayaç SQL'e olduğu gibi gider", async () => {
    const { reserveCredits } = await import("@/lib/credits/service");
    const db = sql();
    const service = client(tables(), db.rpc);
    expect((await reserveCredits(service, USER, "AI_CHAT_STANDARD", "c1")).ok).toBe(true);
    expect((await reserveCredits(service, USER, "IMAGE_SOLUTION", "ph1")).ok).toBe(true);
    // İlk dersin döngüsü ve ders içi yardım: "included".
    expect((await reserveCredits(service, USER, "STUDY_PLAN_GENERATE", "first-lesson", 1, { freeMeter: "included" })).ok).toBe(true);
    expect((await reserveCredits(service, USER, "QUIZ_GENERATE", "first-quiz", 1, { freeMeter: "included" })).ok).toBe(true);
    // Sayaçsız iş (belge): çağıran sayacı açıkça boş verdiyse kapı araya girmez, karar SQL'de.
    await reserveCredits(service, USER, "QUIZ_GENERATE", "meterless", 1, { freeMeter: null });
    expect(db.calls.map((call) => call.meter)).toEqual(["chat", "photo", "included", "included", null]);
  });

  it("SQL'in kendi reddi (göç sonrası `free_limit:lesson`) aynı koda çevrilir: iki hat tek kod", async () => {
    const { parseFreeRefusal, refusalCode } = await import("@/lib/credits/service");
    const { FREE_LESSON_CODE } = await import("@/lib/billing/free-lesson-gate");
    const refusal = parseFreeRefusal("free_limit:lesson");
    expect(refusal).toEqual({ kind: "free_limit", meter: "lesson" });
    expect(refusalCode({ reason: "insufficient_credits", refusal: refusal! })).toBe(FREE_LESSON_CODE);
  });
});

describe("uçlar: Çalışma Stüdyosu üretimi kaynak okumadan ve motordan önce 402", () => {
  const post = (body: Record<string, unknown>) =>
    new Request("https://cortexplus.test/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const routes = [
    ["test", "@/app/api/learning/quiz/generate/route", { topic: "Hücre bölünmesi", count: 5 }],
    ["kartlar", "@/app/api/learning/flashcards/generate/route", { topic: "Hücre bölünmesi", count: 10 }],
    ["doğru/yanlış", "@/app/api/learning/true-false/generate/route", { topic: "Hücre bölünmesi", count: 8 }],
    ["çalışma planı", "@/app/api/learning/study-plan/generate/route", { goal: "Biyoloji sınavı", weeks: 2, topicCount: 4 }],
  ] as const;

  it("ücretsiz hesap: 402 free_lesson_limit; kaynak okunmaz, motor çalışmaz, SQL çağrılmaz", async () => {
    for (const [name, path, body] of routes) {
      const db = sql();
      h.service = client(tables(), db.rpc);
      h.touched.length = 0;
      const { POST } = (await import(/* @vite-ignore */ path)) as { POST: (request: Request) => Promise<Response> };
      const response = await POST(post(body));
      const json = (await response.json()) as { code?: string; error?: string };
      expect(response.status, name).toBe(402);
      expect(json.code, name).toBe("free_lesson_limit");
      expect(json.error, name).toContain("Ücretsiz hesapta ilk dersin açık; devamı Plus'ta.");
      expect(json.error, name).not.toMatch(/hafta|Pazartesi|hakkın bitti/);
      expect(h.touched, name).toEqual([]);
      expect(db.calls, name).toEqual([]);
    }
  });

  it("Plus, kurucu ve hediye bakiyeli ücretsiz hesap kapıdan geçer (motor çağrılır)", async () => {
    const cases = [
      ["plus", () => client(tables({ premium: true }), sql({ premium: true }).rpc)],
      ["kurucu", () => client(tables(), sql({ admin: true }).rpc)],
      ["hediye", () => client(tables({ balance: 90 }), sql({ balance: 90 }).rpc)],
    ] as const;
    for (const [who, make] of cases) {
      for (const [name, path, body] of routes) {
        h.service = make();
        h.touched.length = 0;
        const { POST } = (await import(/* @vite-ignore */ path)) as { POST: (request: Request) => Promise<Response> };
        const response = await POST(post(body));
        expect(response.status, `${who} ${name}`).not.toBe(402);
        expect(h.touched.some((item) => item !== "source"), `${who} ${name}`).toBe(true);
      }
    }
  });

  it("zor soru ve düello da aynı kapıdan: kapı, üretimden ve kaynak aramasından önce", () => {
    const order = (path: string, gate: string, later: string[]) => {
      const source = read(path);
      const at = source.indexOf(gate);
      expect(at, `${path}: kapı yok`).toBeGreaterThan(0);
      for (const marker of later) expect(source.indexOf(marker, at), `${path}: ${marker} kapıdan önce`).toBeGreaterThan(at);
      expect(source).toContain("return errorResponse(402, FREE_LESSON_CODE);");
    };
    order("src/app/api/learning/exam-prep/challenge/route.ts", 'freeLessonRefused(service, userId, "QUIZ_GENERATE")', ["const outcome = await generateJson({"]);
    order("src/app/api/learning/exam-prep/duel/route.ts", 'freeLessonRefused(service, userId, "QUIZ_GENERATE")', ["loadSourceContext(service", "const outcome = await generateExamQuiz({"]);
    order("src/app/api/learning/quiz/generate/route.ts", 'freeLessonRefused(service, userId, "QUIZ_GENERATE")', ["loadDocumentGenerationContext(service", "const outcome = await generateExamQuiz({"]);
    order("src/app/api/learning/flashcards/generate/route.ts", 'freeLessonRefused(service, userId, "FLASHCARD_GENERATE")', ["studioTeacherSource(service", "runWithTeacherModel(service"]);
    order("src/app/api/learning/true-false/generate/route.ts", 'freeLessonRefused(service, userId, "QUIZ_GENERATE")', ["studioTeacherSource(service", "runWithTeacherModel(service"]);
    order("src/app/api/learning/study-plan/generate/route.ts", 'freeLessonRefused(service, userId, "STUDY_PLAN_GENERATE")', ["const outcome = await generateJson({"]);
    // Kayıtlı zor soru seti kapıdan ÖNCE ücretsiz döner.
    const challenge = read("src/app/api/learning/exam-prep/challenge/route.ts");
    expect(challenge.indexOf("cached: true")).toBeLessThan(challenge.indexOf("freeLessonRefused("));
  });

  it("yol adımı: kapı kayıtlı içeriğin yeniden açılışından sonra; kaynak, kayıt ve üretimden önce; önceden yazım da yazmaz", () => {
    const start = read("src/lib/learning/node/start.ts");
    const gate = start.indexOf('if (freeMeter === "lesson" && (await freeLessonRefused(service, userId, actionForKind(kind), { metered: true }))) {');
    expect(gate).toBeGreaterThan(0);
    // "Tekrar incele" / "Dersi tekrarla" kapılardan önce döner: kayıtlı içerik ücretsiz kalır.
    expect(start.indexOf("const reopenedEarly = await reopenSavedAttempt(")).toBeLessThan(gate);
    // İlk dersin döngüsü kapıdan önce "included"e çevrilir: o adımlar kapıya gelmez.
    expect(start.indexOf('const freeMeter: FreeMeter | null = firstLessonFree ? "included" : nodeMeter;')).toBeLessThan(gate);
    for (const later of ["await adoptBuildingLesson(context", "await servePrefetched(context", "await resolveStartSource(context", "await reserveStartAttempt(context", "return runStartGeneration("]) {
      expect(start.indexOf(later), later).toBeGreaterThan(gate);
    }
    const block = start.slice(gate, gate + 400);
    expect(block).toContain('if (prefetch) return NextResponse.json({ ok: true, skipped: "free_lesson" });');
    expect(block).toContain("return errorResponse(402, FREE_LESSON_CODE);");
    // Haftalık sayaca bakan eski önceden yazım koşulu kalktı.
    expect(start).not.toContain('freeMeter === "lesson" || firstLessonFree');
  });

  it("`reserveCredits` kapıyı sigortadan ve SQL'den önce çağırır (ders sayacındaki her çağıran için)", () => {
    const service = read("src/lib/credits/service.ts");
    const gate = service.indexOf("lessonGate = await freeLessonGate(service, userId, actionCode, { quantity: units });");
    expect(gate).toBeGreaterThan(0);
    expect(service.indexOf("await spendBreakerBlocks(service, userId, { meter })")).toBeGreaterThan(gate);
    expect(service.indexOf('service.rpc("credit_reserve_metered"')).toBeGreaterThan(gate);
    expect(service).toContain("p_meter: rpcMeter,");
  });
});

describe("metinler: tek kaynak, haftalık ders ve geri sayım yok, Plus kapısının dili", () => {
  it("sabitler: ders sayacında hak yok; ücretsiz cümlesi ilk ders + günlük mesaj + günlük fotoğraf", async () => {
    const meters = await import("@/lib/billing/free-meters");
    const copy = await import("@/lib/billing/free-tier-copy");
    expect(meters.FREE_LIMITS).toEqual({ lesson: 0, chat: 3, photo: 1, included: 40 });
    expect("FREE_LESSONS_PER_WEEK" in meters).toBe(false);
    expect(meters.VISIBLE_FREE_METERS).toEqual(["chat", "photo"]);
    expect(meters.FREE_TIER_SENTENCE).toBe(`${copy.FREE_FIRST_LESSON_CLAUSE}; ayrıca günde 3 sohbet mesajı ve günde 1 fotoğraftan soru çözümü`);
    expect(copy.FREE_FIRST_LESSON_SENTENCE).toBe(
      "İlk hazırlığında ilk dersin (Konu Anlatımı + Kartlar + Doğru/Yanlış + Konu Testi) süre sınırı olmadan ücretsiz.",
    );
    // Belge sınırı aynı; kapıda ve fiyat yüzeylerinde görünür, Plus'a yönlendirir.
    expect(copy.FREE_PAGE_TOTAL).toBe(25);
    expect(copy.FREE_PREP_LIMIT).toBe(1);
    expect(copy.FREE_DOCUMENT_SENTENCE).toBe("Ücretsiz hesapta tek sınav hazırlığı ve toplam 25 sayfa belge var; daha fazlası Plus'ta.");
    // Davet hediyesi ayrı ve değişmedi: 3 ders kadar kredi.
    expect(meters.REFERRAL_GIFT_LESSONS).toBe(3);
    for (const text of [meters.FREE_TIER_SENTENCE, meters.FREE_LESSON_GATE_LINE, meters.FREE_LESSON_REFUSAL_MESSAGE, copy.FREE_DOCUMENT_SENTENCE]) {
      const lower = text.toLocaleLowerCase("tr");
      expect(lower).not.toMatch(/hafta|pazartesi|sınırsız|kredi/);
    }
  });

  it("kapılar: ders sayacındaki iş 'doldu' demez, geri sayım göstermez; Plus cümlesi ve ücretsizde açık olanlar", async () => {
    const { nodeGateForCode } = await import("@/components/parity/exam-node/gates");
    const { creditGateCopy, beyondFreeMessage, FREE_LESSON_WORK_NAME, STUDIO_GENERATION_NAME } = await import("@/lib/billing/free-reach");
    const { FREE_TIER_SENTENCE } = await import("@/lib/billing/free-meters");
    const base = creditGateCopy("lesson", false);
    const gate = nodeGateForCode("free_lesson_limit", base, false);
    for (const item of [base, gate, creditGateCopy("quiz", false), creditGateCopy("flashcards", false)]) {
      expect(item.beyondFreeDaily).toBe(true);
      expect(item.meter).toBeUndefined();
      expect(item.message).toBe(beyondFreeMessage(FREE_LESSON_WORK_NAME));
    }
    expect(gate.message).toBe(
      `Bu çalışma Plus'ta. Ücretsiz hesapta ${FREE_TIER_SENTENCE.charAt(0).toLocaleLowerCase("tr")}${FREE_TIER_SENTENCE.slice(1)} açık.`,
    );
    expect(beyondFreeMessage(STUDIO_GENERATION_NAME)).toContain("Stüdyoda test, kart ve doğru/yanlış üretimi Plus'ta.");
    // Abone kendi dönem cümlesini görür.
    expect(nodeGateForCode("free_lesson_limit", creditGateCopy("lesson", true), true).message).toBe("Bu dönemki kullanım hakkın doldu.");
    // Gerçek sayaçlar (derse dahil adımların günlük sınırı) yerinde.
    expect(nodeGateForCode("free_included_limit", base, false)).toMatchObject({ meter: "included", beyondFreeDaily: false });
    const gateSource = read("src/components/paywall/credit-gate.tsx");
    expect(gateSource).toContain('const lessonBeyond = !isPremium && !beyondFreeDailyProp && gateMeter === "lesson";');
    expect(gateSource).toContain('if (!meter || meter === "lesson") return null;');
  });

  it("402 metni ve üretim hatası ekranı aynı cümle; yeniden deneme önerilmez", async () => {
    const { errorResponse } = await import("@/lib/api/guards");
    const { describeGenerationFailure } = await import("@/lib/learning/generation-failure");
    const { FREE_LESSON_REFUSAL_MESSAGE } = await import("@/lib/billing/free-meters");
    const body = (await (errorResponse(402, "free_lesson_limit") as Response).json()) as { error: string; code: string };
    expect(body).toMatchObject({ code: "free_lesson_limit", error: FREE_LESSON_REFUSAL_MESSAGE });
    // Yenilenme saati verilse de yazılmaz: beklemek çözmez.
    const failure = describeGenerationFailure("free_lesson_limit", "16 Kasım 2026 00:00", "lesson");
    expect(failure.message).not.toContain("16 Kasım");
    expect(failure).toMatchObject({ message: FREE_LESSON_REFUSAL_MESSAGE, canRetryNow: false, retryMintsNewId: false, action: { href: "/pay" } });
  });

  it("Çalışma Stüdyosu rozetleri tek kuraldan: test, kart, doğru/yanlış ve Plus işleri; fotoğraf ve anlatarak öğren açık", async () => {
    const { STUDIOS, studioNeedsPlus } = await import("@/lib/parity/studios");
    const { needsPlusOutsideFirstLesson, defaultFreeMeter } = await import("@/lib/billing/free-meters");
    const plus = STUDIOS.filter((studio) => studioNeedsPlus(studio, true)).map((studio) => studio.id);
    expect(plus).toEqual(["quiz", "flashcard", "dogru-yanlis", "podcast", "sozlu", "yazili"]);
    expect(STUDIOS.filter((studio) => !studioNeedsPlus(studio, true)).map((studio) => studio.id)).toEqual(["soru-coz", "anlat"]);
    // Rozet, stüdyonun uçta ayırdığı kodla aynı kuraldan.
    expect(read("src/app/api/learning/quiz/generate/route.ts")).toContain('"QUIZ_GENERATE"');
    expect(read("src/app/api/learning/flashcards/generate/route.ts")).toContain('actionCode: "FLASHCARD_GENERATE"');
    expect(read("src/app/api/learning/true-false/generate/route.ts")).toContain('actionCode: "QUIZ_GENERATE"');
    for (const code of ["QUIZ_GENERATE", "FLASHCARD_GENERATE", "STUDY_PLAN_GENERATE"] as const) {
      expect(defaultFreeMeter(code)).toBe("lesson");
      expect(needsPlusOutsideFirstLesson(code)).toBe(true);
    }
    expect(read("src/lib/parity/studios.ts")).toContain("needsPlusOutsideFirstLesson(studio.action)");
  });

  it("fiyat tablosu, Plus'ın bir ayı ve /krediler: 'haftada' ve 'ayda ~12 ders' yok; ücretsizde ders = ilk ders", async () => {
    const { tierComparisonRows, profilePlanView } = await import("@/lib/billing/tier-presentation");
    const { PLAN_WORK_BY_ID, freeVsPlusRows, freeDaysFor, FREE_FIRST_LESSON_CELL } = await import("@/lib/billing/plan-value");
    const rows = tierComparisonRows();
    for (const row of rows) expect(`${row.label} ${row.free}`, row.label).not.toMatch(/[Hh]aftada|haftalık/);
    expect(rows.find((row) => row.label === "AI kullanımı")?.free).toBe("İlk ders, günde 3 mesaj, günde 1 fotoğraftan çözüm");
    expect(rows.find((row) => row.label === "Sınav hazırlığı")?.free).toBe("1 (yenisi Plus'ta)");
    expect(rows.find((row) => row.label === "Belge işleme")?.free).toBe("Toplam 25 sayfa (fazlası Plus'ta)");
    expect(profilePlanView({ audience: "free", resetsAtLabel: "", periodKind: "daily", subscriptionPeriodEnd: null })?.hint).not.toMatch(/hafta|Pazartesi/);
    expect(PLAN_WORK_BY_ID.lesson.free).toBe("first");
    expect(freeVsPlusRows(String)[0]?.free).toBe(FREE_FIRST_LESSON_CELL);
    expect(freeDaysFor({ lesson: 2 })).toBeNull();
    const credits = read("src/app/krediler/page.tsx");
    expect(credits).not.toMatch(/label: "Bu haftaki ders"|weekly-lessons/);
    expect(credits).toContain("<FirstLessonRow status={firstLesson} />");
    expect(credits).toContain('none: "Hazırlığını kurunca açılır"');
    expect(credits).toContain('open: "Açık"');
    expect(credits).toContain('done: "Tamamlandı"');
    expect(read("src/lib/student/usage-limits.ts")).not.toContain("weekly-lessons");
  });

  it("src altında haftalık ders hakkını vaat eden cümle kalmadı (hukuki metinler hariç: sürüm isteyen ayrı karar)", () => {
    const files = [
      "src/lib/billing/free-meters.ts",
      "src/lib/billing/free-tier-copy.ts",
      "src/lib/billing/free-reach.ts",
      "src/lib/billing/tier-presentation.ts",
      "src/lib/billing/plan-value.ts",
      "src/lib/student/usage-limits.ts",
      "src/lib/email/lifecycle-templates.ts",
      "src/lib/api/guards.ts",
      "src/lib/learning/generation-failure.ts",
      "src/components/paywall/upgrade-sheet.tsx",
      "src/components/paywall/credit-gate.tsx",
      "src/components/parity/exam-node/gates.ts",
      "src/components/learning/studio/studio-shared.tsx",
      "src/app/krediler/page.tsx",
      "src/app/yardim/page.tsx",
      "src/app/ozellikler/page.tsx",
      "src/app/fiyatlandirma/page.tsx",
      "src/app/admin/page.tsx",
    ];
    for (const file of files) {
      // Yalnız metin sabitleri: tırnak ya da şablon içinde "Haftada N ders", "Bu haftaki … ders", "Pazartesi 00:00".
      const strings = (read(file).match(/(["'`])(?:(?!\1)[^\n])*\1/g) ?? []).join("\n");
      expect(strings, file).not.toMatch(/[Hh]aftada \$\{|[Hh]aftada \d+ ders|Bu haftaki \$?\{?[^"`]*ders|Pazartesi 00:00|haftalık ders hakkı Pazartesi/);
    }
  });
});

/* ------------------------------------------------------------------------------------------------------------------
   SQL: göç 20261111180000, canlıdaki yayın sırasıyla PGlite'ta (v2 → 20261024121000 → fiyat v3 + günlük 0 → bu göç).
   ------------------------------------------------------------------------------------------------------------------ */
describe("göç 20261111180000_free_lesson_trial: ders sınırı 0, gerisi aynen", () => {
  const file = (path: string) => readFileSync(path, "utf8");
  const migration = (name: string) => file(`supabase/migrations/${name}.sql`);
  const TRIAL = "20261111180000_free_lesson_trial";
  const db = new PGlite();

  const free = "11111111-1111-4111-8111-111111111111";
  const plus = "22222222-2222-4222-8222-222222222222";
  const gifted = "33333333-3333-4333-8333-333333333333";
  const admin = "66666666-6666-4666-8666-666666666666";
  const previewer = "77777777-7777-4777-8777-777777777777";
  const early = "99999999-9999-4999-8999-999999999991";
  const earlyGift = "99999999-9999-4999-8999-999999999992";
  const PLUS_PLAN = "aaaaaaaa-0000-4000-8000-000000000001";

  const metered = (user: string, code: string, key: string, meter: string | null = null) =>
    db.query<{ id: string }>("SELECT credit_reserve_metered($1, $2, $3, $4, $5) AS id", [user, code, key, 1, meter]);
  const refund = (id: string) => db.query("SELECT credit_refund($1)", [id]);
  const used = async (user: string, meter: string) =>
    (await db.query<{ used: number }>("SELECT COALESCE(sum(used), 0)::int AS used FROM free_usage WHERE user_id = $1 AND meter = $2", [user, meter])).rows[0]?.used ?? 0;
  const balance = async (user: string) =>
    (await db.query<{ balance: number }>("SELECT balance FROM credit_wallets WHERE user_id = $1", [user])).rows[0]?.balance;
  const limit = async (meter: string) =>
    (await db.query<{ n: number }>("SELECT free_meter_limit($1) AS n", [meter])).rows[0]?.n;
  /** Göç başlığında yazılı kayıt satırı (SQL ekranına göçle aynı çalıştırmada yapıştırılır). */
  const recordLine = (text: string) => {
    const plain = text.replace(/\r\n/g, "\n").split("\n").map((line) => line.replace(/^--\s?/, "")).join("\n");
    return [...plain.matchAll(/insert into supabase_migrations\.schema_migrations[^;]*;/gi)].map((match) => match[0]);
  };

  let beforeIds: { lesson: string } = { lesson: "" };

  beforeAll(async () => {
    const initial = file("supabase/migrations/20250825120000_init.sql");
    const base = initial
      .slice(initial.indexOf("CREATE TABLE public.credit_wallets"), initial.indexOf("CREATE TABLE public.payments"))
      .replace(/ REFERENCES public.profiles\(id\) ON DELETE CASCADE/g, "");
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; ${base}
      CREATE TABLE profiles(id uuid PRIMARY KEY, referred_by uuid, created_at timestamptz DEFAULT now());
      ALTER TABLE credit_wallets ADD COLUMN period_ends_at timestamptz DEFAULT now() + interval '1 day',
        ADD COLUMN period_allowance integer DEFAULT 6, ADD COLUMN period_kind text DEFAULT 'daily';
      CREATE TABLE plans(id uuid PRIMARY KEY, slug text, name text, credit_amount integer DEFAULT 0,
        monthly_allowance integer, billing_period text, is_premium boolean, active boolean DEFAULT true,
        updated_at timestamptz);
      CREATE TABLE subscriptions(user_id uuid, plan_id uuid, status text, current_period_end timestamptz);
      CREATE TABLE payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, beneficiary_user_id uuid, plan_id uuid);
      CREATE TABLE user_roles(user_id uuid NOT NULL, role text NOT NULL, revoked_at timestamptz);
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE SCHEMA supabase_migrations;
      CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY, name text);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
      CREATE FUNCTION account_verified(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
      CREATE FUNCTION referral_multiplier(uuid) RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
      CREATE FUNCTION unverified_allowance() RETURNS integer LANGUAGE sql AS $$ SELECT 2 $$;`);
    for (const name of [
      "20260923120001_uat_credit_atomicity",
      "20260925180000_admin_credit_bypass",
      "20261003120000_free_tier_one_lesson",
      "20261008100000_admin_free_preview",
    ]) {
      await db.exec(migration(name));
    }
    await db.exec(`INSERT INTO credit_rules(action_code, credit_cost) VALUES
        ('AI_CHAT_STANDARD', 1), ('AI_CHAT_ADVANCED', 1), ('STUDY_PLAN_GENERATE', 2), ('QUIZ_GENERATE', 2),
        ('FLASHCARD_GENERATE', 1), ('DOCUMENT_PAGE_PROCESS', 2), ('IMAGE_SOLUTION', 5);
      INSERT INTO plans(id, slug, name, monthly_allowance, billing_period, is_premium) VALUES
        ('${PLUS_PLAN}', 'plus-aylik', 'Plus', 400, 'monthly', true);
      INSERT INTO user_roles(user_id, role) VALUES ('${admin}', 'admin'), ('${previewer}', 'admin');`);
    await db.exec(migration("20261008120000_credit_system_v2"));
    await db.exec(migration("20261024121000_free_tier_counts"));
    // Kredi v3'ün (c) adımı: fiyatlar ve günlük kredi 0.
    await db.exec(`${migration("20261024120000_credit_prices_v3")}\n${migration("20261024123000_free_daily_zero")}`);
    for (const user of [free, plus, gifted, admin, previewer, early, earlyGift]) {
      await db.exec(`INSERT INTO profiles(id) VALUES ('${user}');
        INSERT INTO credit_wallets(user_id, balance, free_allowance_remaining) VALUES ('${user}', 0, 0);`);
    }
    await db.exec(`UPDATE credit_wallets SET balance = 90 WHERE user_id IN ('${gifted}', '${earlyGift}');
      UPDATE credit_wallets SET balance = 100000 WHERE user_id = '${previewer}';
      INSERT INTO subscriptions(user_id, plan_id, status) VALUES ('${plus}', '${PLUS_PLAN}', 'active');
      UPDATE credit_wallets SET period_ends_at = now() - interval '1 second' WHERE user_id = '${plus}';
      INSERT INTO auth.users(id) VALUES ('${previewer}');
      INSERT INTO admin_free_preview(user_id) VALUES ('${previewer}');`);
  }, 60_000);
  afterAll(() => db.close());

  describe("göçten ÖNCE (kod yayında, SQL eski): kod kapısı SQL'e güvenmez", () => {
    it("eski SQL'de ders sınırı hâlâ 3: kapı olmasaydı ücretsiz hesap haftada 3 iş açardı", async () => {
      expect(await limit("lesson")).toBe(3);
      const first = await metered(early, "STUDY_PLAN_GENERATE", "early-l1", "lesson");
      beforeIds = { lesson: first.rows[0]!.id };
      expect(await used(early, "lesson")).toBe(1);
    });

    it("yeni kodun bakiyeli ücretsiz hesap için yaptığı sayaçsız ayırma: bakiyeden düşer, eski haftalık sayaç artmaz", async () => {
      // `reserveCredits` hediye bakiyeli hesapta `p_meter` boş gönderir (bkz. yukarıdaki testler).
      await metered(earlyGift, "QUIZ_GENERATE", "early-gift-quiz", null);
      expect(await balance(earlyGift)).toBe(80);
      expect(await used(earlyGift, "lesson")).toBe(0);
      // Bakiyesi olmayan hesapta aynı çağrı düz reddedilir (kod bunu ders reddine çevirir); kapı zaten oraya getirmez.
      await expect(metered(early, "QUIZ_GENERATE", "early-null", null)).rejects.toThrow("insufficient_credits");
    });
  });

  describe("göç uygulandı", () => {
    beforeAll(async () => {
      const sql = migration(TRIAL);
      // Göç ve başlığındaki kayıt satırı tek çalıştırmada; ikinci çalıştırma da düşmemeli (on conflict).
      await db.exec(`${sql}\n${recordLine(sql).join("\n")}`);
      await db.exec(`${sql}\n${recordLine(sql).join("\n")}`);
    }, 30_000);

    it("kayıt satırı yazıldı ve `on conflict (version) do nothing` ile", async () => {
      const lines = recordLine(migration(TRIAL));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/values \('20261111180000', 'free_lesson_trial'\)\s+on conflict \(version\) do nothing;/i);
      const rows = await db.query<{ version: string; name: string }>("SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '20261111180000'");
      expect(rows.rows).toEqual([{ version: "20261111180000", name: "free_lesson_trial" }]);
    });

    it("yalnız aynı imzayla yeniden tanımlama: tablo, sütun, satır silinmez", () => {
      const body = migration(TRIAL).split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n");
      expect(body).not.toMatch(/\b(DROP|DELETE|TRUNCATE|ALTER TABLE|CREATE TABLE)\b/i);
      expect(body.match(/CREATE OR REPLACE FUNCTION public\.(\w+)/g)).toEqual([
        "CREATE OR REPLACE FUNCTION public.free_meter_limit",
        "CREATE OR REPLACE FUNCTION public.credit_reserve_metered",
      ]);
      expect(body).toContain("REVOKE ALL ON FUNCTION public.credit_reserve_metered(uuid, text, text, integer, text) FROM PUBLIC, anon, authenticated;");
      expect(body).toContain("GRANT EXECUTE ON FUNCTION public.credit_reserve_metered(uuid, text, text, integer, text) TO service_role;");
    });

    it("sınırlar kodla aynı: ders 0, mesaj 3, fotoğraf 1, derse dahil 40", async () => {
      const { FREE_LIMITS } = await import("@/lib/billing/free-meters");
      for (const meter of ["lesson", "chat", "photo", "included"] as const) {
        expect(await limit(meter), meter).toBe(FREE_LIMITS[meter]);
      }
      expect(await limit("lesson")).toBe(0);
    });

    it("ücretsiz hesap ders sayacından iş açamaz: free_limit:lesson; sayaç satırı yazılmaz, cüzdan değişmez", async () => {
      for (const code of ["STUDY_PLAN_GENERATE", "QUIZ_GENERATE", "FLASHCARD_GENERATE"]) {
        await expect(metered(free, code, `free-${code}`, "lesson"), code).rejects.toThrow("free_limit:lesson");
      }
      expect(await used(free, "lesson")).toBe(0);
      expect(await balance(free)).toBe(0);
      const rows = await db.query("SELECT 1 FROM credit_reservations WHERE user_id = $1", [free]);
      expect(rows.rows).toHaveLength(0);
    });

    it("ilk dersin döngüsü ve ders içi yardım ('included') aynen: tutar 0, günde 40", async () => {
      const lesson = await metered(free, "STUDY_PLAN_GENERATE", "first-lesson", "included");
      await metered(free, "QUIZ_GENERATE", "first-quiz", "included");
      await metered(free, "FLASHCARD_GENERATE", "first-cards", "included");
      expect(await used(free, "included")).toBe(3);
      const row = await db.query<{ amount: number; free_meter: string }>("SELECT amount, free_meter FROM credit_reservations WHERE id = $1", [lesson.rows[0]!.id]);
      expect(row.rows[0]).toEqual({ amount: 0, free_meter: "included" });
      // İade aynı gün hakkı geri verir.
      await refund(lesson.rows[0]!.id);
      expect(await used(free, "included")).toBe(2);
      await db.query("UPDATE free_usage SET used = 40 WHERE user_id = $1 AND meter = 'included'", [free]);
      await expect(metered(free, "QUIZ_GENERATE", "first-41", "included")).rejects.toThrow("free_limit:included");
    });

    it("günde 3 mesaj ve 1 fotoğraf aynen", async () => {
      for (let i = 1; i <= 3; i += 1) await metered(free, "AI_CHAT_STANDARD", `chat-${i}`, "chat");
      await expect(metered(free, "AI_CHAT_STANDARD", "chat-4", "chat")).rejects.toThrow("free_limit:chat");
      await metered(free, "IMAGE_SOLUTION", "photo-1", "photo");
      await expect(metered(free, "IMAGE_SOLUTION", "photo-2", "photo")).rejects.toThrow("free_limit:photo");
      expect([await used(free, "chat"), await used(free, "photo")]).toEqual([3, 1]);
    });

    it("hediye bakiyesi: ders sayacındaki iş bakiyeden ödenir (3 ders), iade bakiyeyi geri verir; bitince free_limit:lesson", async () => {
      const paid = await metered(gifted, "STUDY_PLAN_GENERATE", "gift-1", "lesson");
      expect(await balance(gifted)).toBe(60);
      const row = await db.query<{ amount: number; free_meter: string | null }>("SELECT amount, free_meter FROM credit_reservations WHERE id = $1", [paid.rows[0]!.id]);
      expect(row.rows[0]).toEqual({ amount: 30, free_meter: null });
      await refund(paid.rows[0]!.id);
      expect(await balance(gifted)).toBe(90);
      for (let i = 2; i <= 4; i += 1) await metered(gifted, "STUDY_PLAN_GENERATE", `gift-${i}`, "lesson");
      expect(await balance(gifted)).toBe(0);
      await expect(metered(gifted, "STUDY_PLAN_GENERATE", "gift-5", "lesson")).rejects.toThrow("free_limit:lesson");
      // Kodun gönderdiği sayaçsız ayırma da aynı sonucu verir.
      await expect(metered(gifted, "QUIZ_GENERATE", "gift-null", null)).rejects.toThrow("insufficient_credits");
      expect(await used(gifted, "lesson")).toBe(0);
    });

    it("Plus abone ve kurucu etkilenmez; önizlemedeki kurucu ücretsiz hesap gibi (cüzdanına düşmez)", async () => {
      await metered(plus, "STUDY_PLAN_GENERATE", "plus-1", "lesson");
      await metered(plus, "QUIZ_GENERATE", "plus-2", "lesson");
      expect(await used(plus, "lesson")).toBe(0);
      for (let i = 1; i <= 5; i += 1) await metered(admin, "STUDY_PLAN_GENERATE", `admin-${i}`, "lesson");
      expect(await used(admin, "lesson")).toBe(0);
      await expect(metered(previewer, "STUDY_PLAN_GENERATE", "pv-1", "lesson")).rejects.toThrow("free_limit:lesson");
      await metered(previewer, "STUDY_PLAN_GENERATE", "pv-first", "included");
      await metered(previewer, "AI_CHAT_STANDARD", "pv-chat", "chat");
      expect(await balance(previewer)).toBe(100000);
    });

    it("Plus'a özel iş, bilinmeyen sayaç ve bilinmeyen eylem aynen reddedilir", async () => {
      await expect(metered(free, "PODCAST_GENERATE", "pod", "lesson")).rejects.toThrow("plus_required");
      await expect(metered(free, "QUIZ_GENERATE", "bad-meter", "weekly")).rejects.toThrow("invalid_meter");
      await expect(metered(free, "__yok__", "bad-action", "lesson")).rejects.toThrow("invalid_action");
    });

    it("göçten önce haftalık sayaçla açılmış iş: yineleme aynı ayırmayı döndürür, iadesi düşmez", async () => {
      const replay = await metered(early, "STUDY_PLAN_GENERATE", "early-l1", "lesson");
      expect(replay.rows[0]?.id).toBe(beforeIds.lesson);
      await refund(beforeIds.lesson);
      expect(await used(early, "lesson")).toBe(0);
      // İade edilen eski iş yeniden denenirse artık açılmaz.
      await expect(metered(early, "STUDY_PLAN_GENERATE", "early-l1", "lesson")).rejects.toThrow("free_limit:lesson");
    });
  });
});
