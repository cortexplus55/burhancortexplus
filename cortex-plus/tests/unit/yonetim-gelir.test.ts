import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { englishTermIn } from "./helpers/admin-english-terms";

/*
  Yönetim paneli: gelir, maliyet ve promosyon (6 Kasım 2026). Kâr/marj hesabı saf işlevlerde, kur yokken
  varsayılan, promosyon formunun doğrulaması, Aktif/Pasif ve kod oluşturmanın yetki + denetim kaydı, dört
  sayfanın Türkçe olması.
*/

const state = vi.hoisted(() => ({
  actor: null as string | null,
  calls: [] as { table: string; op: string; payload?: unknown; filter?: unknown }[],
  audits: [] as { action: string; entityId?: string; metadata?: Record<string, unknown> }[],
  insertError: null as { code: string } | null,
  updateRow: { code: "PLUS-ABCD-EFGH" } as { code: string } | null,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth/admin-actor", () => ({ requireAdminActor: async () => state.actor }));
vi.mock("@/lib/audit", () => ({
  auditLog: async (_service: unknown, params: { action: string; entityId?: string; metadata?: Record<string, unknown> }) => {
    state.audits.push(params);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      insert: async (payload: unknown) => {
        state.calls.push({ table, op: "insert", payload });
        return { error: state.insertError };
      },
      update: (payload: unknown) => ({
        eq: (_column: string, value: unknown) => ({
          select: () => ({
            maybeSingle: async () => {
              state.calls.push({ table, op: "update", payload, filter: value });
              return { data: state.updateRow, error: null };
            },
          }),
        }),
      }),
    }),
  }),
}));

import { cockpitWindows, DEFAULT_USD_TRY, effectiveUsdTry } from "@/lib/admin/cockpit-math";
import { collectionByWindow, formatMargin, modelLabel, modelSpendRows, profitLoss } from "@/lib/admin/finance-math";
import { aiSpendFrom } from "@/lib/admin/ops-gauges";
import { PAYMENT_STATUS, usageActionLabel, webhookStatusLabel, ACTION_LABELS } from "@/lib/admin/labels";
import { promoExpiryIso, promoGrantLabel, promoStatus, promoUsage, validatePromoForm } from "@/lib/billing/promo-form";
import { createPromoCode, togglePromoCode } from "@/app/admin/promo-actions";

const read = (path: string) => readFileSync(path, "utf8");
// 6 Kasım 2026 15:00 Türkiye (12:00 UTC).
const NOW = new Date("2026-11-06T12:00:00.000Z");
const windows = cockpitWindows(NOW);

// ---- 1. Kâr / zarar ------------------------------------------------------------------------------

describe("canlı kâr / zarar", () => {
  const payments = [
    { id: "p1", amount_try: 34_900, status: "paid", created_at: "2026-11-06T08:00:00.000Z" }, // bugün
    { id: "p2", amount_try: 12_900, status: "paid", created_at: "2026-11-02T10:00:00.000Z" }, // 7 gün
    { id: "p3", amount_try: 34_900, status: "refunded", created_at: "2026-10-20T10:00:00.000Z" }, // 30 gün, iade kaydı yok
    { id: "p4", amount_try: 34_900, status: "failed", created_at: "2026-11-06T09:00:00.000Z" }, // sayılmaz
    { id: "p5", amount_try: 34_900, status: "pending", created_at: "2026-11-06T09:30:00.000Z" }, // sayılmaz
  ];
  const refunds = [
    { payment_id: "p2", amount_try: 5_000, created_at: "2026-11-06T09:00:00.000Z", settled: true }, // bugün kısmi iade
    { payment_id: "p1", amount_try: 34_900, created_at: "2026-11-06T10:00:00.000Z", settled: false }, // düşen iade
  ];

  it("tahsilat ödendi + sonradan iade edilenden; iade ayrı, iadenin gününe; net = tahsilat − iade", () => {
    const c = collectionByWindow(payments, refunds, windows);
    expect(c.grossKurus).toEqual({ today: 34_900, week: 47_800, month: 82_700 });
    expect(c.paidCount).toEqual({ today: 1, week: 2, month: 3 });
    // Bugün 50 TL kısmi iade; 30 günde ek olarak iade kaydı olmayan eski tam iade (p3).
    expect(c.refundKurus).toEqual({ today: 5_000, week: 5_000, month: 39_900 });
    expect(c.refundCount).toEqual({ today: 1, week: 1, month: 2 });
    expect(c.netKurus).toEqual({ today: 29_900, week: 42_800, month: 42_800 });
  });

  it("net kâr ve marj kokpitin formülüyle: (net gelir − gider × kur) / net gelir", () => {
    // 299 TL net, 2,5 $ × 40 = 100 TL gider → 199 TL kâr, %67.
    expect(profitLoss({ netKurus: 29_900, spendUsd: 2.5, usdTry: 40 })).toEqual({ spendKurus: 10_000, profitKurus: 19_900, marginPct: 67 });
    // Zarar: marj eksi.
    expect(profitLoss({ netKurus: 10_000, spendUsd: 5, usdTry: 40 })).toEqual({ spendKurus: 20_000, profitKurus: -10_000, marginPct: -100 });
    // Gelir yok: marj hesaplanmaz, kâr yine yazılır.
    expect(profitLoss({ netKurus: 0, spendUsd: 1, usdTry: 40 })).toEqual({ spendKurus: 4_000, profitKurus: -4_000, marginPct: null });
    // Gider okunamadı: kâr ve marj yok.
    expect(profitLoss({ netKurus: 29_900, spendUsd: null, usdTry: 40 })).toEqual({ spendKurus: null, profitKurus: null, marginPct: null });
    expect(formatMargin(null)).toBe("—");
    expect(formatMargin(-12)).toBe("%-12");
  });

  it("kur girilmemişse varsayılan kur (1 USD = 36 TL) ve kaynağı 'varsayılan'", () => {
    expect(effectiveUsdTry(null)).toEqual({ rate: DEFAULT_USD_TRY, source: "default" });
    expect(effectiveUsdTry({ rate: "abc" })).toEqual({ rate: 36, source: "default" });
    expect(effectiveUsdTry({ rate: 41.5 })).toEqual({ rate: 41.5, source: "flag" });
    const usd = effectiveUsdTry(undefined).rate;
    expect(profitLoss({ netKurus: 36_000, spendUsd: 1, usdTry: usd })).toEqual({ spendKurus: 3_600, profitKurus: 32_400, marginPct: 90 });
  });

  it("model dökümü üç pencereyi birleştirir; fiyatı tanımsız model ayrı listelenir; hızlı işlem okunur yazılır", () => {
    const prices = new Map([["gpt-6-luna", { input: 0.001, output: 0.004 }]]);
    const month = aiSpendFrom(
      [
        { model: "gpt-6-luna", calls: 10, tokens_in: 100_000, tokens_out: 10_000 },
        { model: "gpt-6-luna-fast", calls: 2, tokens_in: 10_000, tokens_out: 1_000 },
        { model: "bilinmeyen-model", calls: 3, tokens_in: 1, tokens_out: 1 },
      ],
      prices,
    );
    const today = aiSpendFrom([{ model: "gpt-6-luna-fast", calls: 1, tokens_in: 5_000, tokens_out: 0 }], prices);
    expect(month.unpricedModels).toEqual(["bilinmeyen-model"]);
    expect(month.unpricedCalls).toBe(3);
    const rows = modelSpendRows({ today, week: today, month });
    expect(rows.map((row) => row.label)).toEqual(["gpt-6-luna", "gpt-6-luna (hızlı işlem)"]);
    expect(rows[1]!.calls).toEqual({ today: 1, week: 1, month: 2 });
    expect(rows[0]!.usd.month).toBeCloseTo(0.14, 6);
    expect(modelLabel("gpt-4.1")).toBe("gpt-4.1");
  });

  it("sayfa ortak hesapları kullanır, kopyalamaz; kur ve tavan formu yalnız kurucuya", () => {
    const page = read("src/app/admin/maliyetler/page.tsx");
    const loader = read("src/lib/admin/finance.ts");
    expect(loader).toContain("readAiSpend(service, windows.week)");
    expect(loader).toContain("effectiveUsdTry(");
    expect(loader).toContain("spendBreakerState(");
    expect(loader).toContain("cockpitWindows(");
    expect(page).toContain("requireAdminPage()");
    expect(page).toMatch(/isFounder \? <FxRateForm/);
    expect(page).toMatch(/isFounder \? \(\s*<SpendCapForm/);
    expect(page).not.toContain("priceForModel");
    // Kur ve tavan eylemleri hâlâ kurucu denetiminde ve bu sayfayı da tazeler.
    const actions = read("src/app/admin/cockpit-actions.ts");
    expect(actions.match(/checkFounderActor\(\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(actions.match(/revalidatePath\("\/admin\/maliyetler"\)/g)?.length).toBe(2);
  });
});

// ---- 2. Promosyon formu --------------------------------------------------------------------------

describe("promosyon formu doğrulaması", () => {
  const base = { code: "", grant: "plus" as const, amount: 14, maxUses: 1, expiresOn: "" };

  it("geçerli Plus ve kredi kodu; boş kod sunucuda üretilir, yazılan kod büyük harfe", () => {
    const plus = validatePromoForm(base, NOW);
    expect(plus).toEqual({ ok: true, spec: { code: null, grant: "plus", plusDays: 14, credits: 0, maxUses: 1, expiresAt: null } });
    const credit = validatePromoForm({ ...base, code: " yks-2026 ", grant: "credit", amount: 300, maxUses: 1000 }, NOW);
    expect(credit).toEqual({ ok: true, spec: { code: "YKS-2026", grant: "credit", plusDays: null, credits: 300, maxUses: 1000, expiresAt: null } });
  });

  it("geçersiz gün, kredi ve kullanım sayısı reddedilir", () => {
    for (const amount of [0, 91, 1.5, Number.NaN]) {
      expect(validatePromoForm({ ...base, amount }, NOW).ok, `gün ${amount}`).toBe(false);
    }
    for (const amount of [0, -5, 10_001, 2.5]) {
      expect(validatePromoForm({ ...base, grant: "credit", amount }, NOW).ok, `kredi ${amount}`).toBe(false);
    }
    for (const maxUses of [0, 1001, 3.2]) {
      expect(validatePromoForm({ ...base, maxUses }, NOW).ok, `kullanım ${maxUses}`).toBe(false);
    }
    const days = validatePromoForm({ ...base, amount: 91 }, NOW);
    expect(days.ok ? "" : days.error).toBe("Plus günü 1 ile 90 arasında tam sayı olmalı.");
  });

  it("kod biçimi: Türkçe harf, boşluklu parça, çok kısa kod reddedilir", () => {
    for (const code of ["ŞEKER", "AB", "KOD!", "x".repeat(41)]) {
      expect(validatePromoForm({ ...base, code }, NOW).ok, code).toBe(false);
    }
  });

  it("son gün Türkiye gününün sonu; geçmiş, bugünden önce, bozuk ve iki yıldan uzak tarih reddedilir", () => {
    expect(promoExpiryIso("2026-12-31")).toBe("2026-12-31T20:59:59.000Z");
    expect(promoExpiryIso("2026-02-30")).toBeNull();
    const today = validatePromoForm({ ...base, expiresOn: "2026-11-06" }, NOW);
    expect(today.ok && today.spec.expiresAt).toBe("2026-11-06T20:59:59.000Z");
    expect(validatePromoForm({ ...base, expiresOn: "2026-11-05" }, NOW).ok).toBe(false);
    expect(validatePromoForm({ ...base, expiresOn: "06.11.2026" }, NOW).ok).toBe(false);
    expect(validatePromoForm({ ...base, expiresOn: "2029-01-01" }, NOW).ok).toBe(false);
  });

  it("listedeki durum, kullanım ve hak metinleri", () => {
    const row = { active: true, expires_at: null, max_redemptions: 50, redemption_count: 3 };
    expect(promoStatus(row, NOW)).toEqual({ label: "Aktif", tone: "ok" });
    expect(promoStatus({ ...row, active: false }, NOW).label).toBe("Pasif");
    expect(promoStatus({ ...row, expires_at: "2026-11-01T00:00:00.000Z" }, NOW).label).toBe("Süresi doldu");
    expect(promoStatus({ ...row, redemption_count: 50 }, NOW).label).toBe("Kontenjan doldu");
    expect(promoUsage(row)).toBe("3 / 50 · kalan 47");
    expect(promoUsage({ max_redemptions: null, redemption_count: 7 })).toBe("7 / sınırsız");
    expect(promoGrantLabel({ plus_days: 14, credit_amount: 0 })).toBe("14 gün Plus");
    expect(promoGrantLabel({ plus_days: null, credit_amount: 1500 })).toBe("+1.500 kredi");
  });
});

// ---- 3. Eylemler: yetki ve denetim kaydı ---------------------------------------------------------

describe("promosyon eylemleri", () => {
  const PROMO_ID = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    state.actor = null;
    state.calls = [];
    state.audits = [];
    state.insertError = null;
    state.updateRow = { code: "PLUS-ABCD-EFGH" };
  });

  it("yönetici olmayan Aktif/Pasif yapamaz; veritabanına ve kayda dokunulmaz", async () => {
    const result = await togglePromoCode(PROMO_ID, false);
    expect(result).toEqual({ ok: false, error: "Yetkisiz işlem." });
    expect(state.calls).toEqual([]);
    expect(state.audits).toEqual([]);
  });

  it("yönetici (kurucu değil) Pasif yapar; denetim kaydına kim ve hangi kod yazılır", async () => {
    state.actor = "admin-1";
    const result = await togglePromoCode(PROMO_ID, false);
    expect(result).toEqual({ ok: true, message: "PLUS-ABCD-EFGH pasif; artık kullanılamaz." });
    expect(state.calls).toEqual([{ table: "promo_codes", op: "update", payload: { active: false }, filter: PROMO_ID }]);
    expect(state.audits).toEqual([
      { actorId: "admin-1", action: "promo.disabled", entityType: "promo_code", entityId: PROMO_ID, metadata: { active: false, code: "PLUS-ABCD-EFGH" } },
    ]);
    const enable = await togglePromoCode(PROMO_ID, true);
    expect(enable.ok).toBe(true);
    expect(state.audits.at(-1)?.action).toBe("promo.enabled");
  });

  it("geçersiz kimlik ve bulunamayan kod reddedilir; kayıt yazılmaz", async () => {
    state.actor = "admin-1";
    expect(await togglePromoCode("abc", true)).toEqual({ ok: false, error: "Geçersiz kayıt." });
    state.updateRow = null;
    expect(await togglePromoCode(PROMO_ID, true)).toEqual({ ok: false, error: "Kod bulunamadı." });
    expect(state.audits).toEqual([]);
  });

  it("kod oluşturma: yetki, doğrulama, üretilen kod, denetim kaydı", async () => {
    expect(await createPromoCode({ grant: "plus", amount: 14, maxUses: 1 })).toEqual({ ok: false, error: "Yetkisiz işlem." });
    expect(state.calls).toEqual([]);

    state.actor = "admin-1";
    const invalid = await createPromoCode({ grant: "credit", amount: 0, maxUses: 1 });
    expect(invalid.ok).toBe(false);
    expect(state.calls).toEqual([]);

    const made = await createPromoCode({ code: "", grant: "plus", amount: 7, maxUses: 25, expiresOn: "2026-12-31" });
    expect(made.ok).toBe(true);
    const code = made.ok ? made.code! : "";
    expect(code).toMatch(/^PLUS-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    expect(state.calls[0]).toEqual({
      table: "promo_codes",
      op: "insert",
      payload: { code, credit_amount: 0, plus_days: 7, max_redemptions: 25, expires_at: "2026-12-31T20:59:59.000Z" },
    });
    expect(state.audits[0]).toMatchObject({ actorId: "admin-1", action: "promo.created", entityId: code, metadata: { grant: "plus", plus_days: 7, max_redemptions: 25, generated: true } });

    state.calls = [];
    const credit = await createPromoCode({ code: "hediye-500", grant: "credit", amount: 500, maxUses: 100 });
    expect(credit).toEqual({ ok: true, code: "HEDIYE-500", message: "HEDIYE-500 oluşturuldu." });
    expect(state.calls[0]?.payload).toEqual({ code: "HEDIYE-500", credit_amount: 500, plus_days: null, max_redemptions: 100, expires_at: null });
  });

  it("aynı kod varsa 'Bu kod zaten var'; üretilen kod çakışırsa bir kez yeniden denenir", async () => {
    state.actor = "admin-1";
    state.insertError = { code: "23505" };
    expect(await createPromoCode({ code: "VAROLAN", grant: "credit", amount: 10, maxUses: 1 })).toEqual({ ok: false, error: "Bu kod zaten var." });
    expect(state.calls).toHaveLength(1);
    state.calls = [];
    expect((await createPromoCode({ grant: "plus", amount: 14, maxUses: 1 })).ok).toBe(false);
    expect(state.calls).toHaveLength(2);
    expect(state.audits).toEqual([]);
  });

  it("promosyon eylemleri kurucuya kilitli değil (yönetici yapar); eski kopyalar actions.ts'ten kalktı", () => {
    const source = read("src/app/admin/promo-actions.ts");
    expect(source).toContain("requireAdminActor()");
    expect(source).not.toContain("checkFounderActor");
    expect(read("src/app/admin/actions.ts")).not.toMatch(/export async function (createPromoCode|togglePromoCode)/);
    expect(read("src/components/admin/promo-tools.tsx")).toContain('from "@/app/admin/promo-actions"');
    // Beta kodu kartları duruyor.
    const page = read("src/app/admin/promosyonlar/page.tsx");
    for (const part of ["<BetaCodeForm", "<SharedBetaCodeForm", "<PromoCreateForm", "<PromoToggle", "<CampaignForm"]) expect(page).toContain(part);
  });
});

// ---- 4. Sayfalar tamamen Türkçe ------------------------------------------------------------------

const PAGES = [
  "src/app/admin/maliyetler/page.tsx",
  "src/app/admin/odemeler/page.tsx",
  "src/app/admin/promosyonlar/page.tsx",
  "src/app/admin/ai-kullanimi/page.tsx",
  "src/components/admin/promo-tools.tsx",
];

/** Sayfada görünen metin: JSX metni, başlık/açıklama öznitelikleri, tablo sütunları, ekrana giden dizgiler. */
function visibleTexts(source: string): string[] {
  const out: string[] = [];
  for (const match of source.matchAll(/>([^<>{}]*\p{L}[^<>{}]*)</gu)) {
    const text = match[1]!.trim();
    if (text && !/[=;]|=>|\)\s*:/.test(text)) out.push(text);
  }
  for (const match of source.matchAll(/(?:title|desc|label|aria-label|placeholder)=["{]`?"?([^"`}]+)["`}]/g)) out.push(match[1]!);
  for (const match of source.matchAll(/columns=\{\[([^\]]+)\]/g)) {
    for (const column of match[1]!.matchAll(/"([^"]+)"/g)) out.push(column[1]!);
  }
  for (const match of source.matchAll(/(?:error|message|label):\s*[`"]([^`"]+)[`"]/g)) out.push(match[1]!);
  return out;
}

describe("sayfalar tamamen Türkçe", () => {
  it("dört sayfa ve promosyon araçlarında İngilizce terim yok", () => {
    for (const path of PAGES) {
      const texts = visibleTexts(read(path));
      expect(texts.length, path).toBeGreaterThan(5);
      for (const text of texts) expect(englishTermIn(text), `${path}: "${text}"`).toBeNull();
    }
  });

  it("teknik alan adı ve ham durum kodu ekrana basılmaz", () => {
    for (const path of PAGES) {
      const source = read(path);
      expect(source, path).not.toMatch(/>\s*\{(?:event|payment|row)\.(?:status|action|action_code)\}\s*</);
      for (const text of visibleTexts(source)) {
        expect(text, `${path}: "${text}"`).not.toMatch(/\b(ai_model_prices|ai_usage_events|plan_id|merchant_oid|action_code|tokens_in)\b/);
      }
    }
  });

  it("durum rozetleri ve işlem adları Türkçe; bilinmeyen kod 'Diğer işlem'", () => {
    expect(Object.fromEntries(Object.entries(PAYMENT_STATUS).map(([key, value]) => [key, value.label]))).toEqual({
      paid: "Ödendi",
      pending: "Bekliyor",
      failed: "Başarısız",
      refunded: "İade edildi",
    });
    expect(webhookStatusLabel("success")).toBe("Başarılı");
    expect(webhookStatusLabel("failed")).toBe("Başarısız");
    expect(webhookStatusLabel("xyz")).toBe("Bilinmiyor");
    expect(usageActionLabel("LESSON_PREFETCH")).toBe("Dersi önceden yazma (kredisiz)");
    expect(usageActionLabel("SOMETHING_NEW")).toBe("Diğer işlem");
    expect(usageActionLabel(null)).toBe("Diğer işlem");
    for (const label of Object.values(ACTION_LABELS)) expect(englishTermIn(label), label).toBeNull();
    for (const key of ["Quiz", "Flashcard"]) expect(Object.values(ACTION_LABELS).join(" ")).not.toContain(key);
  });
});
