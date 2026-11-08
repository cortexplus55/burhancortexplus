import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  Yaşam döngüsü e-postaları (8 Kasım 2026, ürün sahibi: "yeni kaydolana bizim ismimizle bir mail, premium alana okkalı ve
  samimi bir mail; hangi paketi aldığına göre değişsin; Google ile kaydolsa da"). Sayılar fiyat tablosundan; her e-posta
  bir kez; hepsi hizmet e-postası (çıkış bağlantısı yok).
*/
vi.mock("server-only", () => ({}));

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const base = {
  ctaUrl: "https://cortexplus.app/ogretmen",
  createUrl: "https://cortexplus.app/deneme-sinavlari/olustur",
  solveUrl: "https://cortexplus.app/soru-coz",
  paymentsUrl: "https://cortexplus.app/odemeler",
  renewUrl: "https://cortexplus.app/pay",
};

describe("hoş geldin e-postası", () => {
  it("adı baş harfi büyük, ücretsiz katman sayıları sabitlerden, ilk 10 dakika adımları", async () => {
    const { renderWelcomeMail } = await import("@/lib/email/lifecycle-templates");
    const { FREE_LESSONS_PER_WEEK, FREE_CHAT_PER_DAY, FREE_PHOTO_PER_DAY } = await import("@/lib/billing/free-meters");
    const mail = renderWelcomeMail({ firstName: "burhan önder", via: "google", ...base });
    expect(mail.subject).toBe("Burhan, hoş geldin! Cortex Plus'ta ilk 10 dakikan");
    expect(mail.text).toContain("Merhaba Burhan,");
    expect(mail.text).toContain(`Haftada ${FREE_LESSONS_PER_WEEK} ders`);
    expect(mail.text).toContain(`Günde ${FREE_CHAT_PER_DAY} öğretmen mesajı ve günde ${FREE_PHOTO_PER_DAY} fotoğraftan çözüm`);
    expect(mail.text).toContain("1. Notunu yükle ya da hazır müfredattan seç");
    expect(mail.html).toContain(base.createUrl);
    expect(mail.text).toContain("Cortex Plus ekibi");
    expect(mail.text).not.toMatch(/undefined|null|NaN/);
    // Google ile açılan hesapta doğrulama notu yok.
    expect(mail.text).not.toContain("E-postanı doğrula");
  });

  it("şifreyle açılıp doğrulanmamış hesapta doğrulama notu; sınava kalan gün ve kaldığı yer kişisel", async () => {
    const { renderWelcomeMail } = await import("@/lib/email/lifecycle-templates");
    const mail = renderWelcomeMail({
      firstName: "Ada",
      via: "email",
      needsVerification: true,
      exam: { daysLeft: 23, title: "TYT Biyoloji" },
      next: { heading: "Hücre zarı", url: "https://cortexplus.app/x" },
      ...base,
    });
    expect(mail.text).toContain("E-postanı doğrula");
    expect(mail.text).toContain("Sınavına 23 gün kaldı (TYT Biyoloji).");
    expect(mail.text).toContain("Kaldığın yerden devam et: https://cortexplus.app/x");
  });

  it("ad yoksa selam bozulmaz", async () => {
    const { renderWelcomeMail } = await import("@/lib/email/lifecycle-templates");
    const mail = renderWelcomeMail({ firstName: null, via: "google", ...base });
    expect(mail.subject).toBe("Hoş geldin! Cortex Plus'ta ilk 10 dakikan");
    expect(mail.text.startsWith("Merhaba,")).toBe(true);
  });
});

describe("satın alma e-postası pakete göre değişir", () => {
  it("paket satırından tür: Plus aylık, Sınav Haftası, yıllık, Sigma, ek paket; ücretsiz plan yok", async () => {
    const { purchaseKindFor } = await import("@/lib/email/lifecycle-templates");
    expect(purchaseKindFor({ slug: "plus-aylik", tier: "plus", billing_period: "monthly", is_premium: true })).toBe("plus_monthly");
    expect(purchaseKindFor({ slug: "plus-haftalik", tier: "plus", billing_period: "weekly", is_premium: true })).toBe("plus_weekly");
    expect(purchaseKindFor({ slug: "plus-yillik", tier: "plus", billing_period: "yearly", is_premium: true })).toBe("plus_yearly");
    expect(purchaseKindFor({ slug: "sigma-aylik", tier: "sigma", billing_period: "monthly", is_premium: true })).toBe("sigma");
    expect(purchaseKindFor({ slug: "ek-kredi-150", billing_period: "one_time", is_premium: false })).toBe("addon");
    expect(purchaseKindFor({ slug: "ucretsiz", is_premium: false, billing_period: "monthly" })).toBeNull();
  });

  it("her paketin konusu ve dönem hakkı kendi; sayılar kredi tablosundan", async () => {
    const { renderPurchaseMail, allowanceForPurchase } = await import("@/lib/email/lifecycle-templates");
    const { PLAN_WORK_BY_ID, workCount } = await import("@/lib/billing/plan-value");
    const { PLAN_ALLOWANCES } = await import("@/lib/credits/price-table");
    const ends = "2026-12-08T09:00:00.000Z";

    const monthly = renderPurchaseMail({ kind: "plus_monthly", firstName: "ada", planName: "Plus", endsAt: ends, ...base });
    expect(monthly.subject).toBe("Ada, Plus'a hoş geldin! Bir ay boyunca her şey açık");
    expect(allowanceForPurchase({ kind: "plus_monthly" })).toBe(PLAN_ALLOWANCES.plusMonthly);
    const lessons = workCount(PLAN_ALLOWANCES.plusMonthly, PLAN_WORK_BY_ID.lesson).toLocaleString("tr-TR");
    expect(monthly.text).toContain(`- ${lessons} ders`);
    expect(monthly.text).toContain("Otomatik yenileme yok");
    expect(monthly.text).toContain("sözleşme örneğin ayrı bir e-postayla geldi");

    const weekly = renderPurchaseMail({ kind: "plus_weekly", firstName: "ada", planName: "Plus", endsAt: ends, ...base });
    expect(weekly.subject).toBe("Ada, Sınav Haftan başladı: 7 gün boyunca Plus açık");
    const weekLessons = workCount(PLAN_ALLOWANCES.plusWeekly, PLAN_WORK_BY_ID.lesson).toLocaleString("tr-TR");
    expect(weekly.text).toContain(`- ${weekLessons} ders`);
    expect(weekly.text).toContain("Sınav Sabahı kâğıdını");
    expect(weekly.text).toMatch(/^Haftada yaklaşık/m);

    const sigma = renderPurchaseMail({ kind: "sigma", firstName: "ada", planName: "Sigma", endsAt: ends, ...base });
    expect(sigma.subject).toContain("Sigma'ya hoş geldin");
    expect(sigma.text).toContain("Plus’taki her şey");

    const addon = renderPurchaseMail({ kind: "addon", firstName: "ada", planName: "Ek Kredi 150", addonCredits: 2500, ...base });
    expect(addon.subject).toBe("Ek paketin hesabına eklendi");
    expect(addon.text).toMatch(/Yaklaşık [\d.]+ mesaj ya da [\d.]+ ders kadar ek kullanım\./);
    expect(addon.text).not.toContain("Otomatik yenileme yok");

    for (const mail of [monthly, weekly, sigma, addon]) {
      expect(mail.text).not.toMatch(/undefined|NaN|\bnull\b/);
      // Hizmet e-postası: çıkış bağlantısı yok, satış dili yok.
      expect(mail.text).not.toMatch(/abonelikten çık|indirim|son fırsat|kaçırma/i);
    }
  });

  it("deneme: kart istenmez, ücret alınmaz; sözleşme cümlesi yok; veli ödemesinde hediye notu", async () => {
    const { renderPurchaseMail, allowanceForPurchase } = await import("@/lib/email/lifecycle-templates");
    const trial = renderPurchaseMail({ kind: "trial", firstName: "ada", planName: "Plus", trialDays: 14, endsAt: "2026-11-22T09:00:00Z", ...base });
    expect(trial.subject).toBe("Ada, 14 günlük Plus denemen başladı");
    expect(trial.text).toContain("ücret alınmaz");
    expect(trial.text).not.toContain("sözleşme örneğin");
    expect(allowanceForPurchase({ kind: "trial", trialDays: 14 })).toBe(3360);
    const gift = renderPurchaseMail({ kind: "plus_monthly", firstName: "ada", planName: "Plus", giftedByParent: true, ...base });
    expect(gift.text).toContain("velinin yaptığı ödemeyle");
    expect(gift.text).not.toContain("sözleşme örneğin");
  });
});

describe("bir kez gönderim", () => {
  const state = { claimFails: false, sendOk: true, sends: 0, deletes: 0, events: [] as string[] };
  beforeEach(() => {
    vi.resetModules();
    Object.assign(state, { claimFails: false, sendOk: true, sends: 0, deletes: 0, events: [] });
  });

  function service() {
    return {
      auth: {
        admin: {
          getUserById: async () => ({
            data: { user: { email: "ada@ornek.com", app_metadata: { providers: ["google"] }, user_metadata: {} } },
          }),
        },
      },
      from: (table: string) => {
        if (table === "email_events") {
          return {
            insert: async (row: { template_key: string }) => {
              state.events.push(row.template_key);
              return { error: state.claimFails ? { code: "23505" } : null };
            },
            update: () => ({ eq: () => ({ eq: async () => ({}) }) }),
            delete: () => ({ eq: () => ({ eq: () => ({ eq: async () => ((state.deletes += 1), {}) }) }) }),
          };
        }
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { full_name: "Ada Yılmaz" } }) }) }) };
      },
    } as never;
  }

  async function load() {
    vi.doMock("@/lib/email/mailer", () => ({
      sendEmail: async () => {
        state.sends += 1;
        return state.sendOk ? { ok: true, via: "resend" } : { ok: false, reason: "domain not verified" };
      },
    }));
    vi.doMock("@/lib/learning/exam-countdown-load", () => ({ loadNearestExamCountdown: async () => ({ state: "missing" }) }));
    vi.doMock("@/lib/learning/prep-cards", () => ({ loadContinueStep: async () => null }));
    vi.doMock("@/lib/billing/node-free-meter", () => ({ pathSkipKinds: async () => new Set() }));
    return import("@/lib/email/lifecycle");
  }

  it("ilk çağrı gönderir; kayıt zaten varsa (ikinci çağrı) göndermez", async () => {
    const { sendWelcomeOnce } = await load();
    expect(await sendWelcomeOnce(service(), "u1", "https://cortexplus.app")).toBe("sent");
    expect(state.events).toEqual(["once:welcome"]);
    state.claimFails = true;
    expect(await sendWelcomeOnce(service(), "u1", "https://cortexplus.app")).toBe("skipped");
    expect(state.sends).toBe(1);
  });

  it("gönderim düşerse kayıt silinir (günlük tur yeniden dener)", async () => {
    state.sendOk = false;
    const { sendWelcomeOnce } = await load();
    expect(await sendWelcomeOnce(service(), "u1", "https://cortexplus.app")).toBe("failed");
    expect(state.deletes).toBe(1);
  });

  it("deneme e-postası yalnız Plus günü varsa", async () => {
    const { sendTrialMail } = await load();
    expect(await sendTrialMail(service(), "u1", { plusDays: null, plusUntil: null })).toBe("skipped");
    expect(state.sends).toBe(0);
  });
});

describe("tetikleyiciler", () => {
  it("kayıt tamamlama (e-posta ve Google), /onboarding, ödeme ve beta kodu e-postayı tetikler; günlük tur telafi eder", () => {
    expect(read("src/app/kayit/actions.ts")).toContain("after(() => sendWelcomeOnce(createServiceClient(), welcomeFor)");
    expect(read("src/app/onboarding/page.tsx")).toContain("void triggerWelcomeEmail().catch(() => undefined);");
    expect(read("src/app/api/payments/paytr/callback/route.ts")).toContain("sendPurchaseMail(service, merchantOid, appOrigin())");
    expect(read("src/app/api/promo/redeem/route.ts")).toContain("sendTrialMail(service, userId,");
    expect(read("src/app/api/cron/study-reminders/route.ts")).toContain("sendWelcomeCatchUp(service,");
  });
});
