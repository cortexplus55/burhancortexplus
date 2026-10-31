import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
  Paket J2 (31 Ekim 2026) — dört madde, ders bağımsız örneklerle (fizik, tarih, kimya, hukuk):
  #7  15 sayfadan büyük belge ilk 12 sayfayla başlar, kalanı 40-50 sayfalık pencerelerle gelir.
  #8  Asıl model 429/5xx/ağ kopmasıyla düşerse istek bir kez yedek modelle yinelenir; yarım JSON onarılır.
  #9  Aynı adım için iki sekme aynı kaydı ve aynı kredi yuvasını paylaşır; podcast/video tek üretim.
  #10 "🚩 Soruda hata bildir": hatalı soru düzeltilir ya da tam puan, ödül günde 3 bildirimle sınırlı.
*/

vi.mock("@/lib/ai/provider-quota", () => ({ noteProviderQuotaExhausted: vi.fn(async () => undefined) }));
vi.mock("@/lib/rate-limit", () => ({ redisPipeline: vi.fn(async () => null) }));

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("#7 pencereli işleme 15 sayfadan büyük belgede", () => {
  it("16 sayfadan itibaren ilk 12 sayfa önce, kalan sayfalar pencereyle", async () => {
    const { FAST_START_MIN_PAGES, HEAD_PAGES } = await import("@/lib/documents/document-head");
    const { nextWindow, WINDOW_PAGES, SINGLE_WINDOW_MAX_PAGES } = await import("@/lib/documents/document-windows");
    expect(FAST_START_MIN_PAGES).toBe(16);
    expect(HEAD_PAGES).toBe(12);
    // 20 sayfalık fizik notu: 1-12 hemen, 13-20 tek pencere.
    expect(nextWindow({ attachedThrough: 12, total: 20 })).toMatchObject({ from: 13, to: 20 });
    // 300 sayfalık tarih kitabı: her pencere 40-50 sayfa.
    let through = 12;
    const sizes: number[] = [];
    for (;;) {
      const window = nextWindow({ attachedThrough: through, total: 300 });
      if (!window) break;
      sizes.push(window.to - window.from + 1);
      through = window.to;
    }
    expect(through).toBe(300);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(WINDOW_PAGES);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(SINGLE_WINDOW_MAX_PAGES);
  });
});

describe("#8 yarım kalan JSON onarılır", () => {
  it("açık dize ve kapanmamış dizi kapanır, yarım son öğe atılır", async () => {
    const { repairTruncatedJson } = await import("@/lib/ai/json-repair");
    const cut = '{"questions":[{"text":"Newton\'un ikinci yasası","options":["F=ma","F=mv"]},{"text":"Osmanlı kuruluş tari';
    const repaired = JSON.parse(repairTruncatedJson(cut)) as { questions: Array<{ text: string }> };
    expect(repaired.questions[0].text).toBe("Newton'un ikinci yasası");
    const keyOnly = JSON.parse(repairTruncatedJson('{"title":"Mol kavramı","summary":')) as Record<string, unknown>;
    expect(keyOnly).toEqual({ title: "Mol kavramı" });
    const trailing = JSON.parse(repairTruncatedJson('```json\n{"items":[1,2,3,')) as { items: number[] };
    expect(trailing.items).toEqual([1, 2, 3]);
  });

  it("sağlam JSON'a dokunmaz; parseModelJson yarım çıktıyı da okur", async () => {
    const { repairTruncatedJson } = await import("@/lib/ai/json-repair");
    const { parseModelJson } = await import("@/lib/learning/teaching-standards");
    expect(JSON.parse(repairTruncatedJson('{"a":[1,{"b":"c"}]}'))).toEqual({ a: [1, { b: "c" }] });
    const parsed = parseModelJson('{"cards":[{"front":"Anayasa nedir","back":"Temel hukuk metni"},{"front":"Yasa') as {
      cards: unknown[];
    };
    expect(parsed.cards).toHaveLength(1);
  });
});

describe("#8 yedek model", () => {
  const body = (model: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ model, messages: [{ role: "user", content: "x" }], ...extra });

  it("metin uçlarında asıl modelin alanları çıkar, model değişir; öbür uçlarda geçilmez", async () => {
    const { failoverInit, failoverModel } = await import("@/lib/ai/openai-client");
    const init = { method: "POST", body: body("gpt-6-luna", { reasoning_effort: "low", service_tier: "priority" }), headers: { "content-length": "99" } };
    const next = failoverInit("https://api.openai.com/v1/chat/completions", init, "gpt-4.1");
    expect(JSON.parse(String(next?.body))).toEqual({ model: "gpt-4.1", messages: [{ role: "user", content: "x" }] });
    expect(new Headers(next?.headers).has("content-length")).toBe(false);
    expect(failoverInit("https://api.openai.com/v1/embeddings", init, "gpt-4.1")).toBeNull();
    expect(failoverInit("https://api.openai.com/v1/chat/completions", { body: body("gpt-4.1") }, "gpt-4.1")).toBeNull();
    expect(failoverModel({ OPENAI_FAILOVER: "off" })).toBeNull();
    expect(failoverModel({})).toBe("gpt-4.1");
  });

  function completion(model: string) {
    return new Response(
      JSON.stringify({
        id: "c1",
        object: "chat.completion",
        created: 1,
        model,
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: `{"model":"${model}"}` } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  async function run(first: () => Promise<Response>) {
    const { openaiClient } = await import("@/lib/ai/openai-client");
    const seen: string[] = [];
    const fetch = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const model = String((JSON.parse(String(init?.body)) as { model: string }).model);
      seen.push(model);
      return seen.length === 1 ? first() : completion(model);
    });
    const client = openaiClient({ apiKey: "test", fetch: fetch as never, maxRetries: 0 });
    const result = await client.chat.completions
      .create({ model: "gpt-6-luna", messages: [{ role: "user", content: "x" }] })
      .then((r) => r.choices[0]?.message?.content ?? "", (e: unknown) => `error:${(e as { status?: number }).status ?? "net"}`);
    return { seen, result };
  }

  it.each([429, 500, 502, 503])("%i → aynı istek gpt-4.1 ile, öğrenci hata görmez", async (status) => {
    const { seen, result } = await run(async () => new Response('{"error":{"message":"busy"}}', { status }));
    expect(seen).toEqual(["gpt-6-luna", "gpt-4.1"]);
    expect(result).toBe('{"model":"gpt-4.1"}');
  });

  it("ağ kopması da yedeğe geçer", async () => {
    const { seen, result } = await run(async () => {
      throw new TypeError("fetch failed");
    });
    expect(seen).toEqual(["gpt-6-luna", "gpt-4.1"]);
    expect(result).toBe('{"model":"gpt-4.1"}');
  });

  it("kota bitti 429'u yedeğe geçmez (aynı hesap), hata çağırana döner", async () => {
    const { seen, result } = await run(
      async () =>
        new Response('{"error":{"code":"insufficient_quota","type":"insufficient_quota","message":"You exceeded your current quota"}}', {
          status: 429,
        }),
    );
    expect(seen).toEqual(["gpt-6-luna"]);
    expect(result).toBe("error:429");
  });
});

describe("#9 çift sekme tek kayıt, tek kredi", () => {
  it("kredi anahtarı kaydın yuvasından: istek kimliği girmez", async () => {
    const { creditIdempotencyKeyForSlot } = await import("@/lib/learning/attempt-lifecycle");
    const key = creditIdempotencyKeyForSlot({ userId: "u1", nodeId: "n1", attemptId: "a1" });
    expect(key).toBe("exam_node_slot_u1_n1_a1");
    expect(creditIdempotencyKeyForSlot({ userId: "u1", nodeId: "n1", attemptId: "a1" })).toBe(key);
  });

  it("veritabanı aynı adım için tek 'hazırlanıyor' kaydına izin verir", async () => {
    const db = new PGlite();
    await db.exec(`CREATE TABLE public.exam_prep_node_attempts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL, node_id uuid NOT NULL, status text NOT NULL);`);
    await db.exec(read("supabase/migrations/20261031190000_one_creating_attempt.sql"));
    const u = "11111111-1111-4111-8111-111111111111";
    const n = "22222222-2222-4222-8222-222222222222";
    await db.query("INSERT INTO exam_prep_node_attempts (user_id, node_id, status) VALUES ($1, $2, 'creating')", [u, n]);
    await expect(
      db.query("INSERT INTO exam_prep_node_attempts (user_id, node_id, status) VALUES ($1, $2, 'creating')", [u, n]),
    ).rejects.toThrow(/duplicate key|unique/i);
    await db.query("UPDATE exam_prep_node_attempts SET status = 'active'");
    await expect(
      db.query("INSERT INTO exam_prep_node_attempts (user_id, node_id, status) VALUES ($1, $2, 'creating')", [u, n]),
    ).resolves.toBeTruthy();
    await db.close();
    // PGlite'ı test içinde açar: CI makinesinde açılış 5 sn'yi geçebiliyor (31 Ekim, #453'ün ilk koşusu).
  }, 30_000);

  it("kayıt aşaması öbür sekmenin kaydında bekletir; bayat kayıt yeni isteği kilitlemez", () => {
    const reserve = read("src/lib/learning/node/reserve.ts");
    expect(reserve).toContain("takeOverOrWaitForTwin");
    expect(reserve).toContain('shared: true');
    expect(reserve).toMatch(/creditKey = creditIdempotencyKeyForSlot\(/);
    expect(reserve).toContain('"23505"');
    const life = read("src/components/parity/exam-node/use-node-lifecycle.ts");
    expect(life).toMatch(/SHARED_WAIT_MS/);
    expect(life).toContain("{ twin: true }");
    // Normal açılışta ek sorgu yok: öbür sekmenin kaydına yalnız 23505 sonrası ve bekleyen sekmenin isteğinde bakılır.
    expect(reserve.indexOf("takeOverOrWaitForTwin(context)")).toBeGreaterThan(reserve.indexOf(".insert(creatingRow)"));
    expect(read("src/lib/learning/node/start.ts")).toContain("parsed.data.twin === true");
  });

  it("podcast ve video süren üretimi paylaşır: ikinci istek bekler, sonucu okur", async () => {
    const { shareInFlight, resetInflightForTests } = await import("@/lib/ai/inflight-share");
    resetInflightForTests();
    let runs = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const run = async () => {
      runs += 1;
      await gate;
      return "üretildi";
    };
    const first = shareInFlight("u:prep:topic:podcast", run, async () => "önbellekten", { sleep: async () => undefined, pollMs: 1 });
    const second = shareInFlight("u:prep:topic:podcast", run, async () => "önbellekten", {
      sleep: () => new Promise((resolve) => setTimeout(resolve, 2)),
      pollMs: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    release();
    expect(await first).toBe("üretildi");
    expect(await second).toBe("önbellekten");
    expect(runs).toBe(1);
    expect(read("src/app/api/learning/exam-prep/podcast/route.ts")).toContain("shareInFlight(");
    expect(read("src/app/api/learning/exam-prep/video/route.ts")).toContain("shareInFlight(");
  });
});

describe("#10 soruda hata bildir", () => {
  const question = {
    type: "choice" as const,
    text: "Hangi element soy gazdır?",
    options: ["Sodyum", "Neon", "Klor", "Kalsiyum"],
    correct: ["Sodyum"],
    multi: false,
  };

  it("anahtar kesinse düzeltilir (harfle ya da metinle); değilse soru geçersiz sayılır", async () => {
    const { readReportDecision } = await import("@/lib/learning/question-report/decision");
    expect(readReportDecision({ valid: true, kind: "key", correctOptions: ["Neon"], explanation: "Neon soy gazdır." }, question)).toMatchObject({
      action: "fix",
      correctedKey: ["Neon"],
    });
    expect(readReportDecision({ valid: true, kind: "key", correctOptions: ["B"] }, question)?.correctedKey).toEqual(["Neon"]);
    expect(readReportDecision({ valid: true, kind: "key", correctOptions: ["B) Neon"] }, question)?.correctedKey).toEqual(["Neon"]);
    // Şıklarda olmayan anahtar ya da aynı anahtar: düzeltilmez, geçersiz sayılır.
    expect(readReportDecision({ valid: true, kind: "key", correctOptions: ["Argon"] }, question)?.action).toBe("void");
    expect(readReportDecision({ valid: true, kind: "key", correctOptions: ["Sodyum"] }, question)?.action).toBe("void");
    // Tek cevaplı soruya iki anahtar yazılmaz.
    expect(readReportDecision({ valid: true, kind: "key", correctOptions: ["Neon", "Klor"] }, question)?.action).toBe("void");
    expect(readReportDecision({ valid: true, kind: "ambiguous" }, question)?.action).toBe("void");
    expect(readReportDecision({ valid: false, kind: "key", correctOptions: ["Neon"] }, question)).toMatchObject({ valid: false, action: "none" });
    expect(readReportDecision({ valid: true, kind: "none" }, question)?.valid).toBe(false);
    expect(readReportDecision("bozuk", question)).toBeNull();
  });

  it("düzeltilen soru eski açıklamayı ve şık gerekçelerini bırakır; geçersiz soru herkese tam puan, kanıt yazmaz", async () => {
    const { voidedRow } = await import("@/lib/learning/question-report/apply");
    const { normalizeQuizQuestion, scoreQuizAnswers, publicQuizQuestion } = await import("@/lib/learning/exam-quiz");
    const { quizItemVerdict, activityVerdicts } = await import("@/lib/learning/answer-tally");
    const { extractAnswerEvidence } = await import("@/lib/learning/learning-tracking");
    const raw = { ...question, explanation: "Sodyum soy gazdır.", optionWhy: ["a".repeat(9), "b".repeat(9), "c".repeat(9), "d".repeat(9)], steps: ["1. adım bir", "2. adım iki"] };
    const fixed = voidedRow(raw, { valid: true, kind: "key", action: "fix", correctedKey: ["Neon"], explanation: "Neon soy gazdır." });
    expect(fixed).toMatchObject({ correct: ["Neon"], explanation: "Neon soy gazdır.", voided: true, keyFixed: true });
    expect(fixed).not.toHaveProperty("optionWhy");
    expect(fixed).not.toHaveProperty("steps");
    const voided = voidedRow(raw, { valid: true, kind: "ambiguous", action: "void", correctedKey: null, explanation: "İki şık doğru." });
    expect(voided).toMatchObject({ voided: true, voidNote: "İki şık doğru.", correct: ["Sodyum"] });

    const second = { text: "Tanzimat Fermanı hangi yıl ilan edildi?", options: ["1839", "1856", "1876", "1908"], correct: ["1839"] };
    const list = [normalizeQuizQuestion(voided as never)!, normalizeQuizQuestion(second as never)!];
    expect(list[0].voided).toBe(true);
    expect(publicQuizQuestion(list[0])).toMatchObject({ voided: true, voidNote: "İki şık doğru." });
    // Öğrenci ilk soruda "Klor" dedi: geçersiz soru yine tam puan.
    expect(scoreQuizAnswers(list, { "0": "Klor", "1": "1839" })).toEqual({ score: 2, total: 2 });
    expect(quizItemVerdict(list[0], "Klor")).toBe("dogru");
    expect(activityVerdicts({ type: "quiz", questions: list }, { "0": "", "1": "1856" })).toEqual(["dogru", "yanlis"]);
    const evidence = extractAnswerEvidence({ kind: "quiz", payload: { type: "quiz", questions: list }, answers: { "0": "Klor", "1": "1839" }, isFirstAttempt: true });
    expect(evidence.map((row) => row.questionIndex)).toEqual([1]);
  });

  it("ödül metni ve sayıları ürün sahibinin istediği gibi", async () => {
    const copy = await import("@/lib/learning/question-report/copy");
    expect(copy.REPORT_BUTTON).toBe("🚩 Soruda hata bildir");
    expect(copy.REPORT_THANKS).toBe(
      "👏 Dikkatli gözün için teşekkürler! Hatayı yakaladığın için hesabına +15 Hediye Kredi ve +20 Yıldız tanımlandı",
    );
    expect(copy.REPORT_DAILY_REWARD_CAP).toBe(3);
  });

  it("uç soruyu sunucudaki kayıttan okur, hediye ve yıldızı tek anahtarla verir", () => {
    const route = read("src/app/api/learning/question-report/route.ts");
    expect(route).toMatch(/withUser\(request, \{ scope: "question-report"/);
    expect(route).toContain("loadReportTarget(");
    expect(route).not.toMatch(/parsed\.data\.(text|options|correct)/);
    expect(route).toContain('rpc("claim_question_report_reward"');
    expect(route).toContain("p_key: `question-report:${report.id}`");
    expect(route).toContain('source: "prep", ref: `report:${report.id}`');
    expect(read("src/lib/privacy/account-deletion.ts")).toContain('"question_reports"');
  });

  describe("günlük ödül tavanı (SQL)", () => {
    const db = new PGlite();
    const user = "33333333-3333-4333-8333-333333333333";
    const other = "44444444-4444-4444-8444-444444444444";

    beforeAll(async () => {
      await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
        INSERT INTO auth.users VALUES ('${user}'), ('${other}');`);
      await db.exec(read("supabase/migrations/20261031191000_question_reports.sql"));
    }, 30_000);
    afterAll(() => db.close());

    let ref = 0;
    async function validReport(owner: string, verdict = "valid") {
      ref += 1;
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO question_reports (user_id, source, target_id, question_ref, reason, question_snapshot, verdict)
         VALUES ($1, 'node', gen_random_uuid(), $2, 'key', '{}'::jsonb, $3) RETURNING id`,
        [owner, String(ref), verdict],
      );
      return rows[0].id;
    }
    const claim = async (id: string, day = "2026-10-31") =>
      (await db.query<{ ok: boolean }>("SELECT claim_question_report_reward($1, $2, 3) AS ok", [id, day])).rows[0].ok;

    beforeEach(async () => {
      await db.exec("DELETE FROM question_reports");
    });

    it("günde 3 ödül; dördüncüsü düzeltilir ama ödül almaz; ertesi gün yeniden", async () => {
      const ids = [await validReport(user), await validReport(user), await validReport(user), await validReport(user)];
      expect(await claim(ids[0])).toBe(true);
      expect(await claim(ids[1])).toBe(true);
      expect(await claim(ids[2])).toBe(true);
      expect(await claim(ids[3])).toBe(false);
      expect(await claim(ids[3], "2026-11-01")).toBe(true);
      // Başka öğrencinin tavanı ayrı.
      expect(await claim(await validReport(other))).toBe(true);
    });

    it("aynı bildirim iki kez ödül almaz; geçersiz bildirim hiç almaz; aynı soru iki kez bildirilemez", async () => {
      const id = await validReport(user);
      expect(await claim(id)).toBe(true);
      expect(await claim(id)).toBe(false);
      expect(await claim(await validReport(user, "invalid"))).toBe(false);
      await db.query(
        `INSERT INTO question_reports (user_id, source, target_id, question_ref, reason, question_snapshot)
         VALUES ($1, 'mock', '55555555-5555-4555-8555-555555555555', 'q1', 'typo', '{}'::jsonb)`,
        [user],
      );
      await expect(
        db.query(
          `INSERT INTO question_reports (user_id, source, target_id, question_ref, reason, question_snapshot)
           VALUES ($1, 'mock', '55555555-5555-4555-8555-555555555555', 'q1', 'other', '{}'::jsonb)`,
          [user],
        ),
      ).rejects.toThrow(/duplicate key|unique/i);
    });
  });
});
