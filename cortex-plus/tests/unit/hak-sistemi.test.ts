import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getGate, gateFromRefusal, resolvePlan, snapshotFromAccount } from "@/lib/entitlements/gate";
import {
  ACTION_CODE,
  DUEL_ACCESS,
  EXAM_WEEK_OFFER_THRESHOLD_DAYS,
  FREE_DAILY_LIMITS,
  PAID_PLANS,
  actionCost,
  plusOnly,
} from "@/lib/entitlements/config";
import type { Action, EntitlementSnapshot } from "@/lib/entitlements/types";
import { CREDIT_PRICE_TABLE, PLAN_ALLOWANCES } from "@/lib/credits/price-table";
import { FREE_LIMITS } from "@/lib/billing/free-meters";
import type { StudentAccountContext } from "@/lib/student/account-context";

/*
  Faz 3A: `getGate` bütün hücreleri (plan × eylem × durum), 402 gövdesindeki `gate`, yapılandırmanın kaynağı ve
  "plan okuyan bileşen yok" bekçisi. SQL ile birebir karşılaştırma `hak-sistemi-karakterizasyon.test.ts`'te.
*/

const NOW = new Date("2026-11-14T12:00:00+03:00");
const MIDNIGHT = "2026-11-14T21:00:00.000Z";
const ALL: Action[] = Object.keys(ACTION_CODE) as Action[];
const PLUS_FEATURES: Action[] = ["podcast.create", "video.create", "oral.start", "written.start", "cram.export"];

const free = (over: Partial<EntitlementSnapshot> = {}): EntitlementSnapshot => ({
  plan: "free",
  balance: 0,
  firstLesson: "open",
  meters: {
    chat: { used: 0, limit: 3, resetsAt: MIDNIGHT },
    photo: { used: 0, limit: 1, resetsAt: MIDNIGHT },
    included: { used: 0, limit: 40, resetsAt: MIDNIGHT },
  },
  ...over,
});
const paid = (plan: "plus" | "week" | "sigma", usedPercent: number, balance = 0): EntitlementSnapshot => {
  const allowance = PAID_PLANS[plan].allowance;
  return {
    plan,
    balance,
    quota: { remaining: Math.round(allowance * (1 - usedPercent / 100)), allowance, usedPercent, resetsAt: "2026-12-12T00:00:00.000Z" },
  };
};
const gate = (snapshot: EntitlementSnapshot, action: Action) => getGate(snapshot, action, {}, NOW);

describe("Ücretsiz", () => {
  it("ilk ders kullanılmamış: lesson.create açık + free_first_lesson_available", () => {
    expect(gate(free(), "lesson.create")).toEqual({ state: "open", reason: "free_first_lesson_available" });
    expect(gate(free({ firstLesson: "none" }), "lesson.create")).toEqual({ state: "open", reason: "free_first_lesson_available" });
  });
  it("ilk ders kullanılmış: kilitli + free_first_lesson_used + Plus", () => {
    expect(gate(free({ firstLesson: "done" }), "lesson.create")).toEqual({ state: "locked", reason: "free_first_lesson_used", requiredPlan: "plus" });
  });
  it("ilk ders durumu okunamadıysa açık (kesin değilse açık; kilit sunucu 402'sinde)", () => {
    expect(gate(free({ firstLesson: null }), "lesson.create")).toEqual({ state: "open", reason: "open" });
  });
  it("mesaj 0, 2, 3 kullanılmış: sınırlı 3/1, sonra kilit + yenilenme + Plus", () => {
    const at = (used: number) => gate(free({ meters: { chat: { used, limit: 3, resetsAt: MIDNIGHT } } }), "teacher.message");
    expect(at(0)).toEqual({ state: "limited", reason: "daily_messages_available", period: "day", limit: 3, remaining: 3, resetAt: MIDNIGHT });
    expect(at(2)).toMatchObject({ state: "limited", remaining: 1 });
    expect(at(3)).toEqual({ state: "locked", reason: "daily_messages_used", period: "day", limit: 3, remaining: 0, resetAt: MIDNIGHT, requiredPlan: "plus" });
  });
  it("fotoğraf 0 ve 1: sınırlı, sonra daily_photo_used", () => {
    const at = (used: number) => gate(free({ meters: { photo: { used, limit: 1, resetsAt: MIDNIGHT } } }), "photo.solve");
    expect(at(0)).toMatchObject({ state: "limited", reason: "daily_photo_available", remaining: 1 });
    expect(at(1)).toMatchObject({ state: "locked", reason: "daily_photo_used", requiredPlan: "plus", resetAt: MIDNIGHT });
  });
  it("Plus özellikleri kilitli + feature_requires_plus", () => {
    for (const action of PLUS_FEATURES) {
      expect(gate(free(), action), action).toEqual({ state: "locked", reason: "feature_requires_plus", requiredPlan: "plus" });
    }
  });
  it("düello kurmak: bakiye yoksa Plus, test bedeli kadar bakiye (hediye) varsa açık (DUEL_ACCESS)", () => {
    expect(gate(free(), "duel.start")).toMatchObject({ state: "locked", reason: "feature_requires_plus", requiredPlan: "plus" });
    expect(gate(free({ balance: 10 }), "duel.start")).toMatchObject({ state: "limited", reason: "quota_ok", period: "lifetime", remaining: 1 });
    expect(DUEL_ACCESS).toMatchObject({ play: "everyone", bot: "everyone", dailyLimit: null });
  });
  it("hediye bakiyesi sayaç dolunca işi karşılar; Plus'a özel işi açmaz", () => {
    const gift = free({ balance: 90, firstLesson: "done", meters: { chat: { used: 3, limit: 3, resetsAt: MIDNIGHT } } });
    expect(gate(gift, "lesson.create")).toMatchObject({ state: "limited", reason: "quota_ok", remaining: 3 });
    expect(gate(gift, "teacher.message")).toMatchObject({ state: "limited", reason: "quota_ok", remaining: 30 });
    expect(gate(gift, "podcast.create").state).toBe("locked");
  });
  it("ilk dersin döngüsü 'derse dahil' sayacıyla; 40 dolunca kilit (teklifsiz); başka konu free_topic_limit", () => {
    expect(getGate(free(), "lesson.create", { firstLessonCycle: true }, NOW)).toEqual({ state: "open", reason: "free_first_lesson_available" });
    // Ders bitti: döngünün öbür adımları yine açık, ama "ilk ders duruyor" denmez.
    expect(getGate(free({ firstLesson: "done" }), "lesson.create", { firstLessonCycle: true }, NOW)).toEqual({ state: "open", reason: "open" });
    const full = free({ meters: { included: { used: 40, limit: 40, resetsAt: MIDNIGHT } } });
    expect(getGate(full, "lesson.create", { firstLessonCycle: true }, NOW)).toMatchObject({ state: "locked", reason: "free_included_limit" });
    expect(getGate(full, "lesson.create", { firstLessonCycle: true }, NOW).requiredPlan).toBeUndefined();
    expect(getGate(free(), "lesson.create", { otherTopic: true }, NOW)).toEqual({ state: "locked", reason: "free_topic_limit", requiredPlan: "plus" });
  });
  it("harcama sigortası: maliyetli iş kilitli, teklif yok; derse dahil adım ve kredisiz sayfa etkilenmez", () => {
    const capped = free({ spendCap: true });
    expect(gate(capped, "teacher.message")).toEqual({ state: "locked", reason: "spend_cap" });
    expect(gate(capped, "photo.solve")).toEqual({ state: "locked", reason: "spend_cap" });
    expect(getGate(capped, "lesson.create", { firstLessonCycle: true }, NOW).state).toBe("open");
    expect(gate(capped, "cram.export").reason).toBe("feature_requires_plus");
    // Ders kapısı sigortadan önce: bakiyesi olmayan ücretsiz hesap ders reddini görür (reserveCredits sırası).
    expect(gate(free({ spendCap: true, firstLesson: "done" }), "lesson.create").reason).toBe("free_first_lesson_used");
    // Video ucu ayırmadan önce reddeder: sigortaya gelmez.
    expect(gate(capped, "video.create").reason).toBe("feature_requires_plus");
  });
  it("okunamayan fotoğraf döngüsü: free_photo_abuse_limit", () => {
    expect(gate(free({ photoAbuse: true }), "photo.solve")).toMatchObject({ state: "locked", reason: "free_photo_abuse_limit", period: "day" });
  });
  it("sayaç okunamadıysa sınırlı ama sayısız (karar sunucuda)", () => {
    expect(gate(free({ meters: undefined }), "teacher.message")).toEqual({ state: "limited", reason: "daily_messages_available", period: "day" });
  });
});

describe("Plus / Sınav Haftası / Sigma", () => {
  it("Plus %0 ve %89 olağan; %90 uyarı; %100 kilit + Sigma", () => {
    expect(gate(paid("plus", 0), "lesson.create")).toMatchObject({ state: "limited", reason: "quota_ok", period: "month", limit: 7200, remaining: 7200 });
    expect(gate(paid("plus", 89), "lesson.create").reason).toBe("quota_ok");
    expect(gate(paid("plus", 90), "lesson.create").reason).toBe("plus_quota_90");
    expect(gate(paid("plus", 100), "lesson.create")).toMatchObject({ state: "locked", reason: "plus_quota_100", requiredPlan: "sigma", resetAt: "2026-12-12T00:00:00.000Z" });
  });
  it("teacher.message aynı eşikler (tek havuz)", () => {
    expect(gate(paid("plus", 90), "teacher.message").reason).toBe("plus_quota_90");
    expect(gate(paid("plus", 100), "teacher.message").reason).toBe("plus_quota_100");
  });
  it("Plus %100 + ek paket: açık kalır (karar 1); Sigma teklifi yalnız sunucu reddedince", () => {
    expect(gate(paid("plus", 100, 1000), "lesson.create")).toMatchObject({ state: "limited", reason: "plus_quota_90" });
  });
  it("Plus'ta Plus özellikleri açık (kota tüketen eylem kotadan); sınav sabahı kâğıdı kredisiz", () => {
    for (const action of PLUS_FEATURES) expect(gate(paid("plus", 0), action).state, action).not.toBe("locked");
    expect(gate(paid("plus", 100), "cram.export")).toEqual({ state: "open", reason: "open" });
    expect(gate(paid("plus", 100), "podcast.create").reason).toBe("plus_quota_100");
  });
  it("Sınav Haftası: haftalık dönem; %90'da uyarı yok, %100'de teklifsiz bekleme (karar 2, sheet açılmaz)", () => {
    expect(gate(paid("week", 0), "lesson.create")).toMatchObject({ state: "limited", reason: "quota_ok", period: "week", limit: PLAN_ALLOWANCES.plusWeekly });
    expect(gate(paid("week", 95), "lesson.create").reason).toBe("quota_ok");
    const full = gate(paid("week", 100), "lesson.create");
    expect(full).toMatchObject({ state: "locked", reason: "quota_reset_wait" });
    expect(full.requiredPlan).toBeUndefined();
  });
  it("Sigma: sınırlı; %100'de quota_reset_wait, requiredPlan YOK", () => {
    expect(gate(paid("sigma", 50), "teacher.message")).toMatchObject({ state: "limited", reason: "quota_ok" });
    const full = gate(paid("sigma", 100), "lesson.create");
    expect(full).toMatchObject({ state: "locked", reason: "quota_reset_wait" });
    expect(full.requiredPlan).toBeUndefined();
  });
});

describe("Kurucu", () => {
  it("her eylem açık, sayaç ve teklif yok", () => {
    for (const action of ALL) expect(gate({ plan: "founder", balance: 0 }, action), action).toEqual({ state: "open", reason: "open" });
  });
  it("önizlemedeki kurucu ücretsiz hesap gibi; cüzdanı hediye sayılmaz", () => {
    const preview = free({ freePreview: true, balance: 100000, firstLesson: "done" });
    expect(gate(preview, "lesson.create").reason).toBe("free_first_lesson_used");
    expect(gate(preview, "duel.start").state).toBe("locked");
  });
});

describe("resolvePlan ve snapshotFromAccount", () => {
  const account = (over: Partial<StudentAccountContext>): StudentAccountContext => ({
    audience: "free",
    balance: 0,
    freeAllowanceRemaining: 0,
    isPremium: false,
    showsUpgradeChrome: true,
    subscriptionBadge: null,
    subscriptionAllowance: null,
    subscriptionPeriodEnd: null,
    canSpend: true,
    isAdmin: false,
    resetsAtLabel: "",
    periodKind: "daily",
    usedPercent: 0,
    extraPercent: null,
    ...over,
  });
  it("Kurucu = is_admin; Sınav Haftası kalan günle; Sigma; Plus; Ücretsiz", () => {
    expect(resolvePlan(account({ isAdmin: true }), NOW)).toEqual({ plan: "founder" });
    expect(resolvePlan(account({ isPremium: true, subscriptionBadge: "Plus", planSlug: "plus-haftalik", subscriptionPeriodEnd: "2026-11-17T09:00:00.000Z" }), NOW)).toEqual({ plan: "week", weekDaysLeft: 3 });
    expect(resolvePlan(account({ isPremium: true, subscriptionBadge: "Sigma" }), NOW)).toEqual({ plan: "sigma" });
    expect(resolvePlan(account({ isPremium: true, subscriptionBadge: "Plus", planSlug: "plus-aylik" }), NOW)).toEqual({ plan: "plus" });
    expect(resolvePlan(account({}), NOW)).toEqual({ plan: "free" });
    expect(resolvePlan(account({ freePreview: true }), NOW)).toEqual({ plan: "free" });
  });
  it("ücretli kota tembel yenilemeli kalandan (quotaRemaining), ham cüzdan değerinden değil", () => {
    const snap = snapshotFromAccount(account({ isPremium: true, subscriptionBadge: "Plus", planSlug: "plus-aylik", freeAllowanceRemaining: 0, quotaRemaining: 7200, quotaAllowance: 7200, usedPercent: 0, resetsAtIso: "2026-12-12T00:00:00.000Z" }), {}, NOW);
    expect(snap.quota).toEqual({ remaining: 7200, allowance: 7200, usedPercent: 0, resetsAt: "2026-12-12T00:00:00.000Z" });
  });
  it("ücretsiz sayaçlar kabuk hesabından; önizlemede bakiye 0", () => {
    const snap = snapshotFromAccount(account({ balance: 50, freePreview: true, freeMeters: [{ meter: "chat", used: 2, limit: 3, resetsAtIso: MIDNIGHT } as never] }), {}, NOW);
    expect(snap).toMatchObject({ plan: "free", freePreview: true, balance: 0, meters: { chat: { used: 2, limit: 3, resetsAt: MIDNIGHT } } });
  });
});

describe("402 gövdesinde gate (sunucu retinin kapı dili)", () => {
  it("bilinen her ret kodu bir kapıya eşlenir; bilinmeyen null", () => {
    expect(gateFromRefusal("free_lesson_limit", NOW)).toEqual({ state: "locked", reason: "free_first_lesson_used", requiredPlan: "plus" });
    expect(gateFromRefusal("free_chat_limit", NOW)).toMatchObject({ reason: "daily_messages_used", resetAt: MIDNIGHT, requiredPlan: "plus" });
    expect(gateFromRefusal("free_photo_limit", NOW)?.reason).toBe("daily_photo_used");
    expect(gateFromRefusal("premium_required", NOW)?.reason).toBe("feature_requires_plus");
    expect(gateFromRefusal("free_topic_limit", NOW)?.reason).toBe("free_topic_limit");
    expect(gateFromRefusal("free_prep_limit", NOW)?.reason).toBe("free_prep_limit");
    expect(gateFromRefusal("free_included_limit", NOW)?.requiredPlan).toBeUndefined();
    expect(gateFromRefusal("spend_cap_free", NOW)).toEqual({ state: "locked", reason: "spend_cap" });
    expect(gateFromRefusal("insufficient_credits", NOW)).toBeNull();
    expect(gateFromRefusal("generation_failed", NOW)).toBeNull();
  });
  it("errorResponse 402'ye gate ekler, öbür durumlara eklemez; error ve code aynen", async () => {
    const { errorResponse } = await import("@/lib/api/guards");
    const refused = await errorResponse(402, "free_chat_limit").json();
    expect(refused).toMatchObject({ code: "free_chat_limit", gate: { state: "locked", reason: "daily_messages_used" } });
    expect(typeof refused.error).toBe("string");
    expect(await errorResponse(402, "insufficient_credits").json()).not.toHaveProperty("gate");
    expect(await errorResponse(409, "free_chat_limit").json()).not.toHaveProperty("gate");
  });
  it("assertGate: kilitliyse 402 + { gate }, açıksa geçer", async () => {
    const { assertGate } = await import("@/lib/entitlements/server");
    const service = {} as never;
    const refused = await assertGate(service, "u1", "teacher.message", {}, async () => free({ meters: { chat: { used: 3, limit: 3, resetsAt: MIDNIGHT } } }));
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.response.status).toBe(402);
    const body = await refused.response.json();
    expect(body).toMatchObject({ code: "free_chat_limit", gate: { state: "locked", reason: "daily_messages_used", resetAt: MIDNIGHT } });
    const open = await assertGate(service, "u1", "teacher.message", {}, async () => paid("plus", 10));
    expect(open).toMatchObject({ ok: true, gate: { state: "limited", reason: "quota_ok" } });
    const founder = await assertGate(service, "u1", "video.create", {}, async () => ({ plan: "founder", balance: 0 }));
    expect(founder).toEqual({ ok: true, gate: { state: "open", reason: "open" } });
  });

  it("assertGate kilitli kapıyı bugünkü ret koduyla ve aynı metinle döner", async () => {
    const { refusalCodeForGate } = await import("@/lib/entitlements/server");
    expect(refusalCodeForGate("daily_messages_used")).toBe("free_chat_limit");
    expect(refusalCodeForGate("free_first_lesson_used")).toBe("free_lesson_limit");
    expect(refusalCodeForGate("feature_requires_plus")).toBe("premium_required");
    expect(refusalCodeForGate("spend_cap")).toBe("spend_cap_free");
    expect(refusalCodeForGate("plus_quota_100")).toBe("insufficient_credits");
    // gidiş-dönüş: ret kodu → kapı → ret kodu
    for (const code of ["free_lesson_limit", "free_chat_limit", "free_photo_limit", "premium_required", "free_topic_limit", "free_prep_limit", "free_included_limit", "free_photo_abuse_limit", "spend_cap_free"]) {
      expect(refusalCodeForGate(gateFromRefusal(code, NOW)!.reason), code).toBe(code === "free_image_limit" ? "free_photo_limit" : code);
    }
  });
});

describe("yapılandırma: sayılar bugünkü yerlerinden (uydurma yok)", () => {
  it("ücretsiz sınırlar, plan hakları, eylem bedelleri, eşikler", () => {
    expect(FREE_DAILY_LIMITS).toEqual({ messages: FREE_LIMITS.chat, photos: FREE_LIMITS.photo, included: FREE_LIMITS.included, lessons: FREE_LIMITS.lesson });
    expect(PAID_PLANS.plus.allowance).toBe(PLAN_ALLOWANCES.plusMonthly);
    expect(PAID_PLANS.week).toMatchObject({ allowance: PLAN_ALLOWANCES.plusWeekly, periodDays: 7 });
    expect(PAID_PLANS.sigma.allowance).toBe(PLAN_ALLOWANCES.sigmaMonthly);
    for (const action of ALL) {
      const code = ACTION_CODE[action];
      expect(actionCost(action), action).toBe(code ? CREDIT_PRICE_TABLE[code].credits : 0);
    }
    expect(EXAM_WEEK_OFFER_THRESHOLD_DAYS).toBe(14);
    expect(PLUS_FEATURES.every(plusOnly)).toBe(true);
    expect(["lesson.create", "teacher.message", "photo.solve", "duel.start"].some((a) => plusOnly(a as Action))).toBe(false);
  });
});

describe("bekçi: yeni plan okuyan bileşen yok", () => {
  it("lib/entitlements dışında yeni `planIdentity` / `subscriptionBadge` okuyucusu eklenmedi (Faz 3 öncesi liste)", () => {
    const roots = ["src/components", "src/app"];
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(tsx?|jsx?)$/.test(name)) files.push(full.replace(/\\/g, "/"));
      }
    };
    roots.forEach(walk);
    const readers = files.filter((f) => /\bplanIdentity\(/.test(readFileSync(f, "utf8"))).sort();
    // Faz 3 öncesi: kabuk ve profil kimliği (02/03 envanterinde). Yeni bir okuyucu hak kapısından geçmeli.
    expect(readers).toEqual(["src/app/e2e/profil/fixture.tsx", "src/app/profil/page.tsx", "src/components/parity/sor-shell.tsx"].sort());
  });
});
