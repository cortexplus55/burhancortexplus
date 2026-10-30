import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { ACTION_CODES, CODE_SEEDED_RULE_NOTE, CREDIT_PRICE_TABLE, creditRuleSeed } from "@/lib/credits/price-table";
import { PLUS_ONLY_ACTIONS } from "@/lib/billing/free-meters";
import type { ActionCode } from "@/lib/env";

vi.mock("server-only", () => ({}));

const { getActionCost, reserveCredits, resetCreditRuleSeedForTests } = await import("@/lib/credits/service");
const { probeCreditRules, probeSchema } = await import("@/lib/admin/schema-probe");

/*
  Paket H — kredi kuralı yedeği (29 Ekim 2026).

  Fiyatın iki kopyası var: kodda `CREDIT_PRICE_TABLE`, canlıda `credit_rules`; ikisini bağlayan tek şey
  elle uygulanan göç. Yeni bir eylem kodunun göçü atlanınca SQL `invalid_action` fırlatıyor, iş 409
  "Geçersiz işlem tanımı" ile düşüyor ve /admin/sistem yeşil kalıyordu (yalnız beş kod soruluyordu).

  Kural: göç DEĞİŞİKLİĞİN kaynağı; kod yalnız EKSİK satırı ekler (yalnız ekleme), var olanı asla ezmez ve
  RPC'yi tam bir kez yeniden dener. Ders-bağımsız: senaryolar matematik, tıp, hukuk, tarih, fizik ve
  iktisattan; kod hiçbir derse özel bir şey bilmez.
*/

type RpcReply = { data?: unknown; error?: { code?: string; message: string } | null };

const INVALID: RpcReply = { data: null, error: { message: "invalid_action" } };
const NO_METERED: RpcReply = {
  data: null,
  error: { code: "PGRST202", message: "Could not find the function public.credit_reserve_metered" },
};
const claimed = (amount: number): RpcReply => ({ data: { state: "claimed", amount }, error: null });

/** Cevapları sırayla veren sahte sunucu rolü; `credit_rules` yazımları kaydedilir. */
function reserveService(script: { metered?: RpcReply[]; legacy?: RpcReply[]; claim?: RpcReply; upsert?: RpcReply }) {
  const calls: string[] = [];
  const upserts: { table: string; payload: unknown; options: unknown }[] = [];
  const metered = [...(script.metered ?? [])];
  const legacy = [...(script.legacy ?? [])];
  const unexpected: RpcReply = { data: null, error: { message: "unexpected_call" } };
  const service = {
    rpc: vi.fn(async (name: string) => {
      calls.push(name);
      if (name === "credit_reserve_metered") return metered.shift() ?? unexpected;
      if (name === "credit_reserve") return legacy.shift() ?? unexpected;
      if (name === "credit_claim_operation") return script.claim ?? claimed(1);
      return { data: null, error: null };
    }),
    from: vi.fn((table: string) => ({
      upsert: vi.fn(async (payload: unknown, options: unknown) => {
        upserts.push({ table, payload, options });
        return script.upsert ?? { data: null, error: null };
      }),
    })),
  };
  return { service: service as never, calls, upserts };
}

const seedOf = (code: ActionCode) => ({
  action_code: code,
  credit_cost: CREDIT_PRICE_TABLE[code].credits,
  model_tier: "standard",
  description: CODE_SEEDED_RULE_NOTE,
  active: true,
});
const ONLY_INSERT = { onConflict: "action_code", ignoreDuplicates: true };

describe("fiyat tablosu: çalışma zamanı listesi ve tohum", () => {
  it("ACTION_CODES tablonun bütün anahtarları; Plus işleri de içinde", () => {
    expect([...ACTION_CODES].sort()).toEqual(Object.keys(CREDIT_PRICE_TABLE).sort());
    for (const code of PLUS_ONLY_ACTIONS) expect(ACTION_CODES).toContain(code);
  });

  it("tohum yalnız fiyat tablosundan: bedel, standart kademe, işaretli açıklama, açık", () => {
    for (const code of ACTION_CODES) {
      expect(creditRuleSeed(code)).toEqual(seedOf(code));
    }
    expect(CODE_SEEDED_RULE_NOTE).toMatch(/göç/);
  });

  /* Kod var olan satırı asla güncellemez: yöneticinin değiştirdiği bedel ya da bilerek kapatılmış kural kalır. */
  it("servis credit_rules'ı yalnız ekler, güncellemez", () => {
    const src = readFileSync("src/lib/credits/service.ts", "utf8");
    expect(src).toContain('.upsert(seed, { onConflict: "action_code", ignoreDuplicates: true })');
    expect(src).not.toMatch(/from\("credit_rules"\)[\s\S]{0,80}\.update\(/);
    expect(src).not.toMatch(/from\("credit_rules"\)[\s\S]{0,80}\.insert\(/);
  });
});

describe("reserveCredits: eksik kural satırı ilk istekte eklenir, RPC bir kez yeniden denenir", () => {
  let warn: MockInstance<typeof console.warn>;
  beforeEach(() => {
    resetCreditRuleSeedForTests();
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  /* Matematik: Plus öğrencisi "Trigonometri — birim çember" için çizimli video ister; SKETCH_VIDEO_GENERATE
     göçü canlıda yok. */
  it("matematik, çizimli video: invalid_action → tek upsert → ikinci RPC ok, kod başına bir uyarı", async () => {
    const { service, calls, upserts } = reserveService({
      metered: [INVALID, { data: "res-1", error: null }],
      claim: claimed(25),
    });
    const result = await reserveCredits(service, "ogrenci-mat", "SKETCH_VIDEO_GENERATE", "sketch:trig-birim-cember");
    expect(result).toEqual({ ok: true, reservationId: "res-1", cost: 25 });
    expect(calls).toEqual(["credit_reserve_metered", "credit_reserve_metered", "credit_claim_operation"]);
    expect(upserts).toEqual([{ table: "credit_rules", payload: seedOf("SKETCH_VIDEO_GENERATE"), options: ONLY_INSERT }]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("credit_rule_seeded_from_code", { actionCode: "SKETCH_VIDEO_GENERATE", credits: 25 });

    // Aynı örnekte ikinci öğrenci aynı duruma düşerse: ekleme yine denenir (ON CONFLICT DO NOTHING, zararsız),
    // uyarı yeniden yazılmaz.
    const second = reserveService({ metered: [INVALID, { data: "res-1b", error: null }], claim: claimed(25) });
    await reserveCredits(second.service, "ogrenci-mat-2", "SKETCH_VIDEO_GENERATE", "sketch:limit");
    expect(second.upserts).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  /* Tıp: ücretsiz hesabın sayaç fonksiyonu olmayan eski yayında podcast (PODCAST_GENERATE) — yeniden denemede
     de sıra korunur: metered → PGRST202 → credit_reserve. */
  it("tıp, podcast: yeniden denemede metered → PGRST202 → credit_reserve sırası korunur", async () => {
    const { service, calls, upserts } = reserveService({
      metered: [NO_METERED, NO_METERED],
      legacy: [INVALID, { data: "res-2", error: null }],
      claim: claimed(12),
    });
    const result = await reserveCredits(service, "ogrenci-tip", "PODCAST_GENERATE", "podcast:solunum-sistemi");
    expect(result).toEqual({ ok: true, reservationId: "res-2", cost: 12 });
    expect(calls).toEqual([
      "credit_reserve_metered",
      "credit_reserve",
      "credit_reserve_metered",
      "credit_reserve",
      "credit_claim_operation",
    ]);
    expect(upserts).toEqual([{ table: "credit_rules", payload: seedOf("PODCAST_GENERATE"), options: ONLY_INSERT }]);
    expect(warn.mock.calls.filter(([event]) => event === "credit_rule_seeded_from_code")).toHaveLength(1);
    expect(warn.mock.calls.filter(([event]) => event === "credit_reserve_metered_missing")).toHaveLength(2);
  });

  /* Hukuk: sözlü deneme (ORAL_EXAM_GENERATE); satır eklendi ama kural kapalı (active=false) — ekleme ona dokunmaz,
     ikinci cevap da invalid_action → bugünkü eşleme (409). Üçüncü deneme yok. */
  it("hukuk, sözlü: ikinci RPC de düşerse invalid_action kalır, üçüncü deneme yok", async () => {
    const { service, calls, upserts } = reserveService({ metered: [INVALID, INVALID] });
    const result = await reserveCredits(service, "ogrenci-hukuk", "ORAL_EXAM_GENERATE", "oral:borclar-hukuku");
    expect(result).toEqual({ ok: false, reason: "invalid_action" });
    expect(calls).toEqual(["credit_reserve_metered", "credit_reserve_metered"]);
    expect(upserts).toHaveLength(1);
  });

  /* Fiyat tablosunda olmayan kod: yedek yok, tablo yazılmaz, 409 kalır (şema yoklamasının kendi kodu da böyle). */
  it("fiyat tablosu dışı kod: upsert yok, tek RPC, invalid_action", async () => {
    const { service, calls, upserts } = reserveService({ metered: [INVALID] });
    const result = await reserveCredits(service, "ogrenci", "__schema_probe__" as ActionCode, "probe");
    expect(result).toEqual({ ok: false, reason: "invalid_action" });
    expect(calls).toEqual(["credit_reserve_metered"]);
    expect(upserts).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();
  });

  /* Tarih: yazılı deneme (PRACTICE_EXAM_GENERATE); ekleme düşerse (yetki, bağlantı) yeniden deneme yok, 409. */
  it("tarih, yazılı deneme: upsert hatası → yeniden deneme yok, invalid_action", async () => {
    const { service, calls, upserts } = reserveService({
      metered: [INVALID],
      upsert: { data: null, error: { code: "42501", message: "permission denied for table credit_rules" } },
    });
    const result = await reserveCredits(service, "ogrenci-tarih", "PRACTICE_EXAM_GENERATE", "deneme:inkilap-tarihi");
    expect(result).toEqual({ ok: false, reason: "invalid_action" });
    expect(calls).toEqual(["credit_reserve_metered"]);
    expect(upserts).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith("credit_rule_seed_failed", expect.objectContaining({ actionCode: "PRACTICE_EXAM_GENERATE" }));
    expect(warn.mock.calls.filter(([event]) => event === "credit_rule_seeded_from_code")).toHaveLength(0);
  });

  /* Yedek yalnız invalid_action'da: öteki hatalar eskisi gibi, tablo yazılmaz. */
  it("insufficient ve plus_required için ekleme yok", async () => {
    for (const message of ["insufficient_credits", "plus_required", "free_limit:lesson"]) {
      const { service, upserts } = reserveService({ metered: [{ data: null, error: { message } }] });
      const result = await reserveCredits(service, "ogrenci", "STUDY_PLAN_GENERATE", `ders:${message}`);
      expect(result.ok, message).toBe(false);
      expect(upserts, message).toHaveLength(0);
    }
  });
});

describe("getActionCost: aynı yedek", () => {
  afterEach(() => vi.restoreAllMocks());

  /** `from("credit_rules").select().eq().eq().maybeSingle()` cevapları sırayla; upsert kaydedilir. */
  function costService(reads: RpcReply[], upsert: RpcReply = { data: null, error: null }) {
    const queue = [...reads];
    const upserts: unknown[] = [];
    let selects = 0;
    const service = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => {
                selects += 1;
                return queue.shift() ?? { data: null, error: null };
              },
            }),
          }),
        }),
        upsert: vi.fn(async (payload: unknown, options: unknown) => {
          upserts.push({ payload, options });
          return upsert;
        }),
      })),
    };
    return { service: service as never, upserts, selects: () => selects };
  }

  beforeEach(() => {
    resetCreditRuleSeedForTests();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  /* Fizik: taranmış ders notu (DOCUMENT_SCAN_PAGE) yükleniyor; satır yok → tohum → ikinci okuma bedeli verir. */
  it("fizik, taranmış not: satır yoksa ekler ve bir kez daha okur", async () => {
    const { service, upserts, selects } = costService([
      { data: null, error: null },
      { data: { credit_cost: CREDIT_PRICE_TABLE.DOCUMENT_SCAN_PAGE.credits }, error: null },
    ]);
    expect(await getActionCost(service, "DOCUMENT_SCAN_PAGE")).toBe(CREDIT_PRICE_TABLE.DOCUMENT_SCAN_PAGE.credits);
    expect(selects()).toBe(2);
    expect(upserts).toEqual([{ payload: seedOf("DOCUMENT_SCAN_PAGE"), options: ONLY_INSERT }]);
  });

  it("okuma hatasında yazmaz, null döner", async () => {
    const { service, upserts, selects } = costService([{ data: null, error: { message: "connection reset" } }]);
    expect(await getActionCost(service, "DOCUMENT_PAGE_PROCESS")).toBeNull();
    expect(selects()).toBe(1);
    expect(upserts).toHaveLength(0);
  });

  it("kapalı satır eklenmez: ikinci okuma da boşsa null (çağıran kendi varsayılanına düşer)", async () => {
    const { service, upserts, selects } = costService([{ data: null, error: null }, { data: null, error: null }]);
    expect(await getActionCost(service, "DOCUMENT_PAGE_PROCESS")).toBeNull();
    expect(selects()).toBe(2);
    expect(upserts).toHaveLength(1);
  });

  it("satır varsa tek okuma, yazım yok", async () => {
    const { service, upserts, selects } = costService([{ data: { credit_cost: 5 }, error: null }]);
    expect(await getActionCost(service, "DOCUMENT_PAGE_PROCESS")).toBe(5);
    expect(selects()).toBe(1);
    expect(upserts).toHaveLength(0);
  });
});

describe("probeCreditRules: bütün eylem kodları tek sorguyla", () => {
  type Rule = { credit_cost?: number; active?: boolean; description?: string | null };

  /** Canlı tablo: eylem kodu → satır; `plus` SQL `plus_only_action` cevabı (varsayılan kod listesiyle aynı). */
  function probeService(
    rules: Partial<Record<ActionCode, Rule>>,
    options: { plus?: Partial<Record<ActionCode, boolean>>; plusError?: { message: string }; readError?: { message: string } } = {},
  ) {
    return {
      from: (table: string) => ({
        select: () => ({
          limit: async () => {
            if (table !== "credit_rules") return { data: [], error: null };
            if (options.readError) return { data: null, error: options.readError };
            return {
              data: Object.entries(rules).map(([action_code, rule]) => ({ action_code, active: true, description: null, ...rule })),
              error: null,
            };
          },
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      }),
      rpc: vi.fn(async (name: string, args?: { p_code?: ActionCode }) => {
        if (name === "plus_only_action") {
          if (options.plusError) return { data: null, error: options.plusError };
          const code = args?.p_code as ActionCode;
          return { data: options.plus?.[code] ?? PLUS_ONLY_ACTIONS.includes(code), error: null };
        }
        return { data: null, error: null };
      }),
    } as never;
  }

  const fullTable = (): Partial<Record<ActionCode, Rule>> =>
    Object.fromEntries(ACTION_CODES.map((code) => [code, { credit_cost: CREDIT_PRICE_TABLE[code].credits }]));

  const row = (checks: Awaited<ReturnType<typeof probeCreditRules>>, part: string) =>
    checks.find((check) => check.name.includes(part))!;

  it("sağlıklı canlıda dört satır, hepsi yeşil; yalnız eksik satır kritik", async () => {
    const sb = probeService(fullTable());
    const checks = await probeCreditRules(sb);
    expect(checks.map((check) => check.name)).toEqual([
      "Kredi kuralı satırları",
      "Kredi bedeli kod ile canlı ayrışıyor",
      "Koddan eklenmiş kural: göç ve kayıt satırı yazılmalı",
      "Plus'a özel işler (plus_only_action)",
    ]);
    expect(checks.map((check) => check.ok)).toEqual([true, true, true, true]);
    expect(checks.map((check) => check.critical)).toEqual([true, false, false, false]);
    // plus_only_action yalnız Plus listesi için, tek tek.
    const asked = (sb as { rpc: ReturnType<typeof vi.fn> }).rpc.mock.calls
      .filter(([name]) => name === "plus_only_action")
      .map(([, args]) => (args as { p_code: string }).p_code);
    expect(asked.sort()).toEqual([...PLUS_ONLY_ACTIONS].sort());
  });

  /* İktisat: podcast göçü atlanmış, sözlü kuralı kapalı — ikisi de "eksik ya da kapalı", kritik. */
  it("iktisat: eksik ve kapalı kod kritik satırda adıyla", async () => {
    const rules = fullTable();
    delete rules.PODCAST_GENERATE;
    rules.ORAL_EXAM_GENERATE = { credit_cost: 6, active: false };
    const checks = await probeCreditRules(probeService(rules));
    const rows = row(checks, "Kredi kuralı satırları");
    expect(rows).toMatchObject({ ok: false, critical: true });
    expect(rows.detail).toContain("Eksik ya da kapalı: PODCAST_GENERATE, ORAL_EXAM_GENERATE");
    expect(rows.detail).toContain("invalid_action (409)");
    expect(rows.detail).toContain("schema_migrations");
    // Kapalı satırın bedeli ayrışma sayılmaz; öteki satırlar yeşil.
    expect(row(checks, "ayrışıyor").ok).toBe(true);
    expect(row(checks, "Koddan eklenmiş").ok).toBe(true);
  });

  /* Tıp: podcast bedeli göçle 12 oldu, canlıda eski 8 kaldı — uyarı, kritik değil; kod var olanı ezmez. */
  it("tıp: bedel farkı ayrı uyarı satırı, kritik değil", async () => {
    const rules = fullTable();
    rules.PODCAST_GENERATE = { credit_cost: 8 };
    const checks = await probeCreditRules(probeService(rules));
    expect(row(checks, "Kredi kuralı satırları").ok).toBe(true);
    const drift = row(checks, "Kredi bedeli kod ile canlı ayrışıyor");
    expect(drift).toMatchObject({ ok: false, critical: false });
    expect(drift.detail).toContain(`PODCAST_GENERATE: canlı 8, kod ${CREDIT_PRICE_TABLE.PODCAST_GENERATE.credits}`);
    expect(drift.detail).toContain("yalnız göçle");
  });

  /* Matematik: çizimli video satırı ilk istekte koddan eklendi; göç ve kayıt satırı hâlâ yazılmadı. */
  it("matematik: koddan eklenmiş satır uyarı; göç gelince açıklama ezilir, uyarı kalkar", async () => {
    const rules = fullTable();
    rules.SKETCH_VIDEO_GENERATE = { ...creditRuleSeed("SKETCH_VIDEO_GENERATE") };
    const seeded = row(await probeCreditRules(probeService(rules)), "Koddan eklenmiş");
    expect(seeded).toMatchObject({ ok: false, critical: false });
    expect(seeded.detail).toContain("SKETCH_VIDEO_GENERATE");
    expect(seeded.detail).toContain("schema_migrations");

    rules.SKETCH_VIDEO_GENERATE = { credit_cost: 25, description: "1 dakikalık çizimli video (şema ve ses)" };
    expect(row(await probeCreditRules(probeService(rules)), "Koddan eklenmiş").ok).toBe(true);
  });

  /* Hukuk: sözlü deneme kodda Plus'ta, SQL listesi yeniden tanımlanmamış — koddan düzeltilemez, göç gerekir. */
  it("hukuk: plus_only_action ayrışması uyarı; göç ister", async () => {
    const checks = await probeCreditRules(probeService(fullTable(), { plus: { ORAL_EXAM_GENERATE: false } }));
    const plus = row(checks, "plus_only_action");
    expect(plus).toMatchObject({ ok: false, critical: false });
    expect(plus.detail).toContain("ORAL_EXAM_GENERATE");
    expect(plus.detail).toContain("göçle yeniden tanımlayın");
    expect(row(checks, "Kredi kuralı satırları").ok).toBe(true);
  });

  it("plus_only_action okunamazsa uyarı, kritik değil", async () => {
    const plus = row(
      await probeCreditRules(probeService(fullTable(), { plusError: { message: "Could not find the function public.plus_only_action" } })),
      "plus_only_action",
    );
    expect(plus).toMatchObject({ ok: false, critical: false });
    expect(plus.detail).toContain("okunamadı");
  });

  /* Bilinmeyen durum yeşil sayılmaz: tablo okunamazsa tek kritik satır. */
  it("okuma hatası tek kritik 'okunamadı' satırı", async () => {
    const checks = await probeCreditRules(probeService(fullTable(), { readError: { message: "permission denied" } }));
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ name: "Kredi kuralı satırları", ok: false, critical: true });
    expect(checks[0].detail).toContain("okunamadı");
    expect(checks[0].detail).toContain("permission denied");
  });

  /* Sayfa ve /api/health aynı listeyi okur: eksik kod kritik sayılır (sağlık ucu "ok" demez). */
  it("probeSchema bu satırları taşır ve eksik kod kritikler arasında", async () => {
    const rules = fullTable();
    delete rules.VIDEO_GENERATE;
    const checks = await probeSchema(probeService(rules));
    const critical = checks.filter((check) => check.critical && !check.ok).map((check) => check.name);
    expect(critical).toContain("Kredi kuralı satırları");
    expect(checks.filter((check) => check.name === "Kredi kuralı satırları")).toHaveLength(1);
  });
});

describe("belgeler kuralı söylüyor", () => {
  it("KREDI-SISTEMI.md 'Değişirse' ve yanlis-kredi.md yeni eylem kodu kuralını yazıyor", () => {
    const kredi = readFileSync("../docs/delivery/KREDI-SISTEMI.md", "utf8");
    const section = kredi.slice(kredi.indexOf("## Değişirse"));
    expect(section).toContain("ON CONFLICT (action_code) DO UPDATE");
    expect(section).toContain("plus_only_action");
    expect(section).toMatch(/var olan satırı ezmez/);
    const ops = readFileSync("../docs/ops/yanlis-kredi.md", "utf8");
    expect(ops).toContain("Kredi kuralı satırları");
    expect(ops).toContain("invalid_action");
  });
});
