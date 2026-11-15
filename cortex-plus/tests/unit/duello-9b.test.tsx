// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/*
  Düello 9B (15 Kasım 2026, Burhan onayı: "20 kredi ücreti ve günlük sınırı ONAYLIYORUM"): düello kurmak kendi eylem
  koduyla (DUEL_GENERATE, 20 kredi), günlük kurma sınırı plan başına (ücretsiz 1, Plus / Sınav Haftası 10, Sigma 30,
  kurucu sınırsız), düello seti istem eki (kolaydan zora, sınav tuzağı, kısa hesap) ve kendi notundan yazılan düelloda
  kurucuya paylaşım uyarısı. Göç yazıldı, uygulanmadı; duel.enabled kapalı kalır.
*/

const entitlementsMock = vi.hoisted(() => ({ plan: "free" as "free" | "plus" | "sigma", founder: false }));
vi.mock("@/lib/billing/entitlements", () => ({
  getUserEntitlements: async () => ({ plan: entitlementsMock.plan, isPremium: entitlementsMock.plan !== "free" }),
}));
vi.mock("@/lib/billing/free-preview", () => ({
  billingExempt: async () => entitlementsMock.founder,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/duello/abc12345",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

const read = (path: string) => readFileSync(path, "utf8");

type CountQuery = { count: number | null; error: unknown };
function fakeService(result: CountQuery, seen: { filters: Array<[string, string, unknown]> } = { filters: [] }) {
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      seen.filters.push(["eq", column, value]);
      return builder;
    },
    gte: (column: string, value: unknown) => {
      seen.filters.push(["gte", column, value]);
      return Promise.resolve(result);
    },
  };
  return { from: (table: string) => (table === "prep_duels" ? builder : null) } as never;
}

beforeEach(() => {
  entitlementsMock.plan = "free";
  entitlementsMock.founder = false;
});
afterEach(() => cleanup());

describe("bedel: DUEL_GENERATE 20 kredi, kod ve göç aynı sayı", () => {
  it("fiyat tablosu, kapı eşlemesi ve göç", async () => {
    const { CREDIT_PRICE_TABLE } = await import("@/lib/credits/price-table");
    const { ACTION_CODE, actionCost } = await import("@/lib/entitlements/config");
    expect(CREDIT_PRICE_TABLE.DUEL_GENERATE.credits).toBe(20);
    expect(ACTION_CODE["duel.start"]).toBe("DUEL_GENERATE");
    expect(actionCost("duel.start")).toBe(20);
    const sql = read("supabase/migrations/20261115140000_duel_generate_credits.sql");
    expect(sql).toMatch(/VALUES \('DUEL_GENERATE', 20,/);
    expect(sql).toContain("YAZILDI, UYGULANMADI");
    // Yalnız ekleme: tablo, sütun ya da başka satır değişmez.
    expect(sql).not.toMatch(/\b(DROP|DELETE|TRUNCATE|ALTER)\b/i);
  });

  it("ücretsiz hesapta ders sayacına düşer (bakiye yoksa Plus); iade ve model listelerinde", async () => {
    const { defaultFreeMeter, needsPlusOutsideFirstLesson, isPlusOnlyAction } = await import("@/lib/billing/free-meters");
    expect(defaultFreeMeter("DUEL_GENERATE")).toBe("lesson");
    expect(needsPlusOutsideFirstLesson("DUEL_GENERATE")).toBe(true);
    // Plus'a özel değil: davet hediyesi bakiyesi yetiyorsa ücretsiz hesap da kurar.
    expect(isPlusOnlyAction("DUEL_GENERATE")).toBe(false);
    const { STALE_REFUND_ACTION_CODES } = await import("@/lib/credits/service");
    expect(STALE_REFUND_ACTION_CODES).toContain("DUEL_GENERATE");
    expect(read("src/lib/ai/model-router.ts")).toContain('"DUEL_GENERATE"');
    expect(read("src/lib/admin/labels.ts")).toContain('DUEL_GENERATE: "Düello kurma"');
  });
});

describe("günlük kurma sınırı", () => {
  it("plan başına sınır; kurucuda yok", async () => {
    const { duelDailyLimit, DUEL_ACCESS } = await import("@/lib/entitlements/config");
    expect(DUEL_ACCESS.dailyLimit).toEqual({ free: 1, plus: 10, sigma: 30 });
    expect(duelDailyLimit("free", false)).toBe(1);
    expect(duelDailyLimit("plus", false)).toBe(10);
    expect(duelDailyLimit("sigma", false)).toBe(30);
    expect(duelDailyLimit("sigma", true)).toBeNull();
  });

  it("gün İstanbul gününün başından sayılır", async () => {
    const { istanbulDayStartIso } = await import("@/lib/learning/duel-daily");
    // 14 Kasım 22:30 UTC = 15 Kasım 01:30 İstanbul.
    expect(istanbulDayStartIso(new Date("2026-11-14T22:30:00Z"))).toBe("2026-11-15T00:00:00+03:00");
    expect(istanbulDayStartIso(new Date("2026-11-15T20:00:00Z"))).toBe("2026-11-15T00:00:00+03:00");
  });

  it("bugün kurduğu düellolar sınıra ulaşınca durur; altındaysa açık", async () => {
    const { checkDuelDailyLimit } = await import("@/lib/learning/duel-daily");
    const now = new Date("2026-11-15T09:00:00Z");
    const seen = { filters: [] as Array<[string, string, unknown]> };
    expect(await checkDuelDailyLimit(fakeService({ count: 0, error: null }, seen), "u1", now)).toEqual({ allowed: true, limit: 1, used: 0 });
    expect(seen.filters).toEqual([
      ["eq", "creator_id", "u1"],
      ["gte", "created_at", "2026-11-15T00:00:00+03:00"],
    ]);
    expect(await checkDuelDailyLimit(fakeService({ count: 1, error: null }), "u1", now)).toEqual({ allowed: false, limit: 1, used: 1 });
    entitlementsMock.plan = "plus";
    expect(await checkDuelDailyLimit(fakeService({ count: 9, error: null }), "u1", now)).toMatchObject({ allowed: true, limit: 10 });
    expect(await checkDuelDailyLimit(fakeService({ count: 10, error: null }), "u1", now)).toMatchObject({ allowed: false, limit: 10 });
  });

  it("kurucu sayılmaz; okuma düşerse engellemez (kredi ve hız sınırı yine çalışır)", async () => {
    const { checkDuelDailyLimit } = await import("@/lib/learning/duel-daily");
    entitlementsMock.founder = true;
    expect(await checkDuelDailyLimit(fakeService({ count: 500, error: null }), "u1")).toEqual({ allowed: true, limit: null, used: 0 });
    entitlementsMock.founder = false;
    expect(await checkDuelDailyLimit(fakeService({ count: null, error: { message: "down" } }), "u1")).toMatchObject({ allowed: true });
  });

  it("uç: kapı → günlük sınır → kaynak → üretim; sınırda 429 ve açık ileti", () => {
    const route = read("src/app/api/learning/exam-prep/duel/route.ts");
    const gate = route.indexOf("freeLessonRefused(service, userId, DUEL_ACTION)");
    const daily = route.indexOf("checkDuelDailyLimit(service, userId)");
    expect(gate).toBeGreaterThan(0);
    expect(daily).toBeGreaterThan(gate);
    expect(route.indexOf("loadSourceContext(service")).toBeGreaterThan(daily);
    expect(route.indexOf("const outcome = await generateExamQuiz({")).toBeGreaterThan(daily);
    expect(route).toContain('code: "duel_daily_limit"');
    expect(route).toContain("{ status: 429 }");
    expect(route).toContain("Kurduğun düelloları oynamak ve paylaşmak açık");
    expect(route).toContain("actionCode: DUEL_ACTION");
    expect(route).not.toContain('"QUIZ_GENERATE"');
  });
});

describe("düello seti istem eki", () => {
  it("kolaydan zora, sınav tuzağı, kısa hesap, tekrar yok; kaynak sayı önceliği aynen", async () => {
    const { DUEL_SET_RULE } = await import("@/lib/learning/duel-prompt");
    const { SOURCE_NUMBER_PRIORITY } = await import("@/lib/learning/teaching-rubric");
    expect(DUEL_SET_RULE).toContain("kolaydan zora sıralı");
    expect(DUEL_SET_RULE).toContain("En az iki soru bir sınav tuzağını yoklar");
    expect(DUEL_SET_RULE).toContain("uydurma yanılgı yazma");
    expect(DUEL_SET_RULE).toContain("en az bir soru kısa bir hesap ister");
    expect(DUEL_SET_RULE).toContain("aynı doğru cevap en çok iki soruda");
    expect(DUEL_SET_RULE).toContain(SOURCE_NUMBER_PRIORITY);
    expect(read("src/app/api/learning/exam-prep/duel/route.ts")).toContain("${DUEL_SET_RULE}");
  });

  it("istem ekinde ders, konu ya da senaryo sözcüğü yok (ders-bağımsız)", async () => {
    const { DUEL_SET_RULE } = await import("@/lib/learning/duel-prompt");
    const { SOURCE_NUMBER_PRIORITY } = await import("@/lib/learning/teaching-rubric");
    // Tek sayı düellonun kendi süresi (DUEL_SECONDS ile aynı 20 sn); içerik sayısı yok.
    const own = DUEL_SET_RULE.replace(SOURCE_NUMBER_PRIORITY, "").replace("20 saniyede", "");
    expect(own).not.toMatch(/\d{2,}/);
    expect(own).not.toMatch(/matematik|fizik|kimya|biyoloji|tarih|hücre|fonksiyon/i);
  });
});

describe("paylaşım uyarısı", () => {
  const QUESTIONS = [{ text: "Soru 1?", options: ["A", "B", "C", "D", "E"] }];

  it("metin tek kaynakta", async () => {
    const { DUEL_NOTE_SHARE_WARNING } = await import("@/lib/learning/duel-share");
    expect(DUEL_NOTE_SHARE_WARNING).toBe("Sorular senin notundan hazırlandı; bağlantıyı alan herkes soruları görür.");
  });

  it("verilince paylaşım düğmelerinin altında görünür, verilmezse yok", async () => {
    const { DuelPlay } = await import("@/components/duel/duel-play");
    const { DUEL_NOTE_SHARE_WARNING } = await import("@/lib/learning/duel-share");
    const { unmount } = render(
      <DuelPlay code="abc12345" title="Deneme" topic={null} creatorName="Ayşe" questions={QUESTIONS} initialBoard={[]} signedIn shareWarning={DUEL_NOTE_SHARE_WARNING} />,
    );
    const note = screen.getByText(DUEL_NOTE_SHARE_WARNING);
    const actions = document.querySelector(".cp-duel-actions");
    expect(actions).toBeTruthy();
    expect(actions!.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    unmount();
    render(<DuelPlay code="abc12345" title="Deneme" topic={null} creatorName="Ayşe" questions={QUESTIONS} initialBoard={[]} signedIn />);
    expect(screen.queryByText(DUEL_NOTE_SHARE_WARNING)).toBeNull();
  });

  it("sayfa uyarıyı yalnız kurucuya ve belgeli hazırlıktan kurulan düelloda verir", () => {
    const page = read("src/app/duello/[code]/page.tsx");
    expect(page).toContain("exam_prep_id");
    expect(page).toMatch(/userId && userId === duel\.creator_id && duel\.exam_prep_id/);
    expect(page).toContain('.select("document_id")');
    expect(page).toContain("if (prep?.document_id) shareWarning = DUEL_NOTE_SHARE_WARNING;");
    expect(page).toContain("shareWarning={shareWarning}");
  });
});
