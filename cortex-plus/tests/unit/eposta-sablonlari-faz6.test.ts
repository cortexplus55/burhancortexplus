import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FREE_CHAT_PER_DAY, FREE_PHOTO_PER_MONTH } from "@/lib/billing/free-meters";
import { FREE_FIRST_LESSON_SENTENCE, FREE_PAGE_TOTAL } from "@/lib/billing/free-tier-copy";
import { escapeHtml } from "@/lib/email/escape";
import { PARENT_LINK_TTL_MS } from "@/lib/payments/parent-link";
import * as activation from "@/lib/email/templates/activation-24h";
import * as examEve from "@/lib/email/templates/exam-eve-cheat-sheet";
import * as firstUnit from "@/lib/email/templates/free-first-unit-completed";
import { durationLabel, FOOTER_COPY, ownHref, subjectPart, type RenderedMail } from "@/lib/email/templates/layout";
import * as payment from "@/lib/email/templates/payment-confirmed";
import {
  SAMPLE_ACTIVATION_24H,
  SAMPLE_EXAM_EVE_CHEAT_SHEET,
  SAMPLE_FREE_FIRST_UNIT_COMPLETED,
  SAMPLE_INPUTS,
  SAMPLE_ORIGIN,
  SAMPLE_PAYMENT_CONFIRMED,
  SAMPLE_PREFERENCES_URL,
  SAMPLE_PREP_ID,
  SAMPLE_SMART_TRAP_NUDGE,
  SAMPLE_SUBSCRIPTION_EXPIRY_REMINDER,
  SAMPLE_WEEKLY_STUDY_DIGEST,
  SAMPLE_WELCOME_ONBOARDING,
} from "@/lib/email/templates/sample-inputs";
import * as smartTrap from "@/lib/email/templates/smart-trap-nudge";
import * as expiry from "@/lib/email/templates/subscription-expiry-reminder";
import * as weekly from "@/lib/email/templates/weekly-study-digest";
import * as welcome from "@/lib/email/templates/welcome-onboarding";

/*
  Faz 6 e-posta şablonları (20 Kasım 2026): konu satırları, düğme bağlantıları, altbilgi türleri, kaçış, düz metin ve
  söz denetimi. Her şablon örnek girdisiyle çizilir.
*/

type Entry = {
  key: string;
  module: { TEMPLATE_KEY: string; TEMPLATE_CATEGORY: string; TEMPLATE_FOOTER: string };
  render: () => RenderedMail;
  cta: string;
};

const ENTRIES: Entry[] = [
  {
    key: "welcome_onboarding",
    module: welcome,
    render: () => welcome.renderWelcomeOnboarding(SAMPLE_WELCOME_ONBOARDING),
    cta: `${SAMPLE_ORIGIN}/deneme-sinavlari/olustur`,
  },
  {
    key: "payment_confirmed",
    module: payment,
    render: () => payment.renderPaymentConfirmed(SAMPLE_PAYMENT_CONFIRMED),
    cta: `${SAMPLE_ORIGIN}/deneme-sinavlari`,
  },
  {
    key: "activation_24h",
    module: activation,
    render: () => activation.renderActivation24h(SAMPLE_ACTIVATION_24H),
    cta: `${SAMPLE_ORIGIN}/deneme-sinavlari/olustur`,
  },
  {
    key: "free_first_unit_completed",
    module: firstUnit,
    render: () => firstUnit.renderFreeFirstUnitCompleted(SAMPLE_FREE_FIRST_UNIT_COMPLETED),
    cta: `${SAMPLE_ORIGIN}/pay`,
  },
  {
    key: "smart_trap_nudge",
    module: smartTrap,
    render: () => smartTrap.renderSmartTrapNudge(SAMPLE_SMART_TRAP_NUDGE),
    cta: `${SAMPLE_ORIGIN}/deneme-sinavlari/${SAMPLE_PREP_ID}/tekrar`,
  },
  {
    key: "exam_eve_cheat_sheet",
    module: examEve,
    render: () => examEve.renderExamEveCheatSheet(SAMPLE_EXAM_EVE_CHEAT_SHEET),
    cta: `${SAMPLE_ORIGIN}/deneme-sinavlari/${SAMPLE_PREP_ID}/sinav-sabahi`,
  },
  {
    key: "subscription_expiry_reminder",
    module: expiry,
    render: () => expiry.renderSubscriptionExpiryReminder(SAMPLE_SUBSCRIPTION_EXPIRY_REMINDER),
    cta: `${SAMPLE_ORIGIN}/pay`,
  },
  {
    key: "weekly_study_digest",
    module: weekly,
    render: () => weekly.renderWeeklyStudyDigest(SAMPLE_WEEKLY_STUDY_DIGEST),
    cta: `${SAMPLE_ORIGIN}/deneme-sinavlari/${SAMPLE_PREP_ID}`,
  },
];

const TRANSACTIONAL = new Set(["welcome_onboarding", "payment_confirmed"]);

/** Düğmenin iki biçimi (Outlook VML ve öbür istemciler) aynı bağlantıyı taşır. */
function ctaHrefs(html: string): string[] {
  return [...html.matchAll(/(?:v:roundrect[^>]*?|<a) href="([^"]+)"/g)].map((match) => match[1]);
}

describe("şablon kimlikleri ve örnek girdiler", () => {
  it("her şablonun anahtarı, türü ve altbilgisi; örnek girdi her anahtar için var", () => {
    for (const entry of ENTRIES) {
      expect(entry.module.TEMPLATE_KEY).toBe(entry.key);
      expect(entry.key in SAMPLE_INPUTS).toBe(true);
      expect(entry.module.TEMPLATE_CATEGORY).toBe(TRANSACTIONAL.has(entry.key) ? "transactional" : "lifecycle");
    }
    expect(firstUnit.TEMPLATE_FOOTER).toBe("marketing");
    expect(Object.keys(SAMPLE_INPUTS).sort()).toEqual(ENTRIES.map((entry) => entry.key).sort());
  });

  it("örnek girdilerde gerçek kimlik yok: hazırlık kimliği yer tutucu", () => {
    expect(SAMPLE_PREP_ID).toBe("00000000-0000-4000-8000-000000000001");
    const text = readFileSync(join(process.cwd(), "src/lib/email/templates/sample-inputs.ts"), "utf8");
    const uuids = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? [];
    expect(uuids.every((uuid) => uuid.startsWith("00000000-0000-"))).toBe(true);
    expect(text).not.toMatch(/@gmail\.com|@hotmail\.com/i);
  });
});

describe("konu satırları", () => {
  it("hoş geldin: adla ve adsız", () => {
    expect(welcome.renderWelcomeOnboarding(SAMPLE_WELCOME_ONBOARDING).subject).toBe(
      "Hoş geldin Elif! İlk sınav yolunu 2 dakikada kuralım",
    );
    expect(welcome.renderWelcomeOnboarding({ ...SAMPLE_WELCOME_ONBOARDING, firstName: null }).subject).toBe(
      "Hoş geldin! İlk sınav yolunu 2 dakikada kuralım",
    );
    expect(welcome.renderWelcomeOnboarding({ ...SAMPLE_WELCOME_ONBOARDING, firstName: "  " }).subject).toBe(
      "Hoş geldin! İlk sınav yolunu 2 dakikada kuralım",
    );
    // Küçük harfle yazılan ad baş harfi büyük gider.
    expect(welcome.renderWelcomeOnboarding({ ...SAMPLE_WELCOME_ONBOARDING, firstName: "ilkay" }).subject).toBe(
      "Hoş geldin İlkay! İlk sınav yolunu 2 dakikada kuralım",
    );
  });

  it("ödeme: paket türlerinde ve ek pakette", () => {
    for (const kind of ["plus_monthly", "plus_weekly", "plus_yearly", "sigma"] as const) {
      const planName = kind === "sigma" ? "Sigma" : kind === "plus_weekly" ? "Sınav Haftası" : "Plus";
      expect(payment.renderPaymentConfirmed({ ...SAMPLE_PAYMENT_CONFIRMED, kind, planName }).subject).toBe(
        `${planName} paketin aktif! Sınav yolunda tüm kilitler açıldı`,
      );
    }
    expect(payment.renderPaymentConfirmed({ ...SAMPLE_PAYMENT_CONFIRMED, kind: "addon", planName: "Ek Paket", periodEnd: null }).subject).toBe(
      "Ek kullanım hakkın hesabına eklendi",
    );
  });

  it("aktivasyon", () => {
    expect(activation.renderActivation24h(SAMPLE_ACTIVATION_24H).subject).toBe(
      'Ders notun yoksa bile "Belgem yok" ile 30 saniyede başlayabilirsin',
    );
  });

  it("ilk konu bitti", () => {
    expect(firstUnit.renderFreeFirstUnitCompleted(SAMPLE_FREE_FIRST_UNIT_COMPLETED).subject).toBe(
      "1. konuyu %82 ile bitirdin! Kalan 11 konun hazır",
    );
  });

  it("sınav tuzağı: süre en az 2 dk, soru başına yarım dakika", () => {
    expect(smartTrap.renderSmartTrapNudge(SAMPLE_SMART_TRAP_NUDGE).subject).toBe(
      'TYT Matematik: "Üslü Sayılar" konusunda açık kalan 5 sınav tuzağın var (Tekrar 0 kredi, ~3 dk)',
    );
    expect(smartTrap.renderSmartTrapNudge({ ...SAMPLE_SMART_TRAP_NUDGE, mistakeCount: 1 }).subject).toBe(
      'TYT Matematik: "Üslü Sayılar" konusunda açık kalan 1 sınav tuzağın var (Tekrar 0 kredi, ~2 dk)',
    );
    expect(smartTrap.trapMinutes(3)).toBe(2);
    expect(smartTrap.trapMinutes(9)).toBe(5);
  });

  it("sınav arifesi: kâğıt varken ve yokken; 48 ve 24 saat", () => {
    expect(examEve.renderExamEveCheatSheet(SAMPLE_EXAM_EVE_CHEAT_SHEET).subject).toBe(
      "Sınavına 48 saat kaldı! Sınav Sabahı 15 Dk Özet & Formül Kağıdın hazır",
    );
    expect(examEve.renderExamEveCheatSheet({ ...SAMPLE_EXAM_EVE_CHEAT_SHEET, hoursLeft: 24, cramSheetAvailable: false }).subject).toBe(
      "Sınavına 24 saat kaldı! Son tekrarın hazır",
    );
  });

  it("dönem bitişi: 3 gün ve 24 saat", () => {
    expect(expiry.renderSubscriptionExpiryReminder(SAMPLE_SUBSCRIPTION_EXPIRY_REMINDER).subject).toBe(
      "Plus döneminin bitmesine 3 gün kaldı (Kartından otomatik çekim yapılmaz)",
    );
    expect(expiry.renderSubscriptionExpiryReminder({ ...SAMPLE_SUBSCRIPTION_EXPIRY_REMINDER, window: "24h" }).subject).toBe(
      "Plus döneminin bitmesine 24 saat kaldı (Kartından otomatik çekim yapılmaz)",
    );
  });

  it("haftalık karne: konu öğrenildiyse sayıyla, değilse hazır", () => {
    expect(weekly.renderWeeklyStudyDigest(SAMPLE_WEEKLY_STUDY_DIGEST).subject).toBe(
      "Haftalık Cortex Plus Karnen: 3 yeni konu öğrendin",
    );
    expect(weekly.renderWeeklyStudyDigest({ ...SAMPLE_WEEKLY_STUDY_DIGEST, weeklyLearned: 0 }).subject).toBe(
      "Haftalık Cortex Plus Karnen hazır",
    );
  });

  it("konu satırına satır sonu girmez (başlık enjeksiyonu)", () => {
    const mail = smartTrap.renderSmartTrapNudge({ ...SAMPLE_SMART_TRAP_NUDGE, prepTitle: "TYT\r\nBcc: x@y.z", topicTitle: "A\nB" });
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(subjectPart("a".repeat(200)).length).toBeLessThanOrEqual(80);
  });
});

describe("düğme bağlantıları", () => {
  for (const entry of ENTRIES) {
    it(entry.key, () => {
      const mail = entry.render();
      const hrefs = ctaHrefs(mail.html);
      expect(hrefs.slice(0, 2)).toEqual([entry.cta, entry.cta]);
      expect(mail.text).toContain(entry.cta);
    });
  }

  it("arife: kâğıt yoksa tekrara gider", () => {
    const mail = examEve.renderExamEveCheatSheet({ ...SAMPLE_EXAM_EVE_CHEAT_SHEET, cramSheetAvailable: false });
    expect(ctaHrefs(mail.html)[0]).toBe(`${SAMPLE_ORIGIN}/deneme-sinavlari/${SAMPLE_PREP_ID}/tekrar`);
  });

  it("karne: sıradaki adım yoksa ya da başka alan adına gidiyorsa Sınavlar", () => {
    const none = weekly.renderWeeklyStudyDigest({ ...SAMPLE_WEEKLY_STUDY_DIGEST, nextStep: null });
    expect(ctaHrefs(none.html)[0]).toBe(`${SAMPLE_ORIGIN}/deneme-sinavlari`);
    const foreign = weekly.renderWeeklyStudyDigest({
      ...SAMPLE_WEEKLY_STUDY_DIGEST,
      nextStep: { title: "Adım", href: "https://kotu.example/x" },
    });
    expect(ctaHrefs(foreign.html)[0]).toBe(`${SAMPLE_ORIGIN}/deneme-sinavlari`);
    expect(ownHref("/deneme-sinavlari/x", SAMPLE_ORIGIN, "f")).toBe(`${SAMPLE_ORIGIN}/deneme-sinavlari/x`);
    expect(ownHref("javascript:alert(1)", SAMPLE_ORIGIN, "f")).toBe("f");
  });

  it("sonda eğik çizgili köken çift eğik çizgi üretmez", () => {
    const mail = activation.renderActivation24h({ ...SAMPLE_ACTIVATION_24H, origin: `${SAMPLE_ORIGIN}/` });
    expect(ctaHrefs(mail.html)[0]).toBe(`${SAMPLE_ORIGIN}/deneme-sinavlari/olustur`);
  });
});

describe("altbilgi türleri", () => {
  for (const entry of ENTRIES) {
    it(entry.key, () => {
      const mail = entry.render();
      const prefHref = `href="${escapeHtml(SAMPLE_PREFERENCES_URL)}"`;
      expect(mail.html).toContain("Cortex Plus · <a href=\"mailto:cortexplus@cortexplus.app\"");
      expect(mail.text).toContain(FOOTER_COPY.identity);
      if (TRANSACTIONAL.has(entry.key)) {
        expect(mail.html).not.toContain(prefHref);
        expect(mail.html).not.toContain(SAMPLE_PREFERENCES_URL);
        expect(mail.html).not.toContain(FOOTER_COPY.preferences);
        expect(mail.text).not.toMatch(/abonelikten çık/i);
        expect(mail.html).toContain(FOOTER_COPY.transactional);
      } else {
        expect(mail.html).toContain(prefHref);
        expect(mail.html).toContain(escapeHtml(FOOTER_COPY.preferences));
        expect(mail.html).toContain(FOOTER_COPY.quietHours);
        expect(mail.text).toContain(`${FOOTER_COPY.preferences}: ${SAMPLE_PREFERENCES_URL}`);
      }
      const marketing = entry.module.TEMPLATE_FOOTER === "marketing";
      expect(mail.html.includes(FOOTER_COPY.marketing)).toBe(marketing);
      expect(mail.text.includes(FOOTER_COPY.sender)).toBe(marketing);
    });
  }
});

describe("kaçış", () => {
  const evil = '<script>alert("x")</script>';

  it("ad: etiket ve tırnak HTML'e girmez", () => {
    for (const mail of [
      welcome.renderWelcomeOnboarding({ ...SAMPLE_WELCOME_ONBOARDING, firstName: `Ali ${evil}` }),
      payment.renderPaymentConfirmed({ ...SAMPLE_PAYMENT_CONFIRMED, firstName: `"><img src=x onerror=1>` }),
      weekly.renderWeeklyStudyDigest({ ...SAMPLE_WEEKLY_STUDY_DIGEST, firstName: evil }),
    ]) {
      expect(mail.html).not.toContain("<script");
      expect(mail.html).not.toContain("<img src=x");
      expect(mail.html).not.toContain("onerror=");
    }
  });

  it("başlık, konu, paket adı ve maddeler kaçışlı", () => {
    const mails = [
      smartTrap.renderSmartTrapNudge({ ...SAMPLE_SMART_TRAP_NUDGE, prepTitle: evil, topicTitle: `Konu "1" & <b>` }),
      examEve.renderExamEveCheatSheet({ ...SAMPLE_EXAM_EVE_CHEAT_SHEET, prepTitle: evil, weakestTopics: [evil] }),
      firstUnit.renderFreeFirstUnitCompleted({ ...SAMPLE_FREE_FIRST_UNIT_COMPLETED, prepTitle: evil }),
      payment.renderPaymentConfirmed({ ...SAMPLE_PAYMENT_CONFIRMED, planName: evil, benefits: [evil] }),
      expiry.renderSubscriptionExpiryReminder({ ...SAMPLE_SUBSCRIPTION_EXPIRY_REMINDER, planName: evil }),
      weekly.renderWeeklyStudyDigest({ ...SAMPLE_WEEKLY_STUDY_DIGEST, nextStep: { title: evil, href: "/deneme-sinavlari" } }),
    ];
    for (const mail of mails) {
      expect(mail.html).not.toContain("<script");
      expect(mail.html).toContain("&lt;script&gt;");
      expect(mail.html).toContain("&quot;");
    }
    expect(mails[0].html).toContain("&amp; &lt;b&gt;");
  });

  it("köken ve hazırlık kimliği bağlantıyı bozamaz", () => {
    const mail = smartTrap.renderSmartTrapNudge({ ...SAMPLE_SMART_TRAP_NUDGE, prepId: '"><x' });
    expect(mail.html).not.toContain('"><x');
    expect(ctaHrefs(mail.html)[0]).toBe(`${SAMPLE_ORIGIN}/deneme-sinavlari/%22%3E%3Cx/tekrar`);
  });
});

describe("içerik", () => {
  it("hoş geldin: ücretsiz katman sabitlerden; doğrulama notu yalnız doğrulanmamışta; sınava kalan gün", () => {
    const mail = welcome.renderWelcomeOnboarding(SAMPLE_WELCOME_ONBOARDING);
    expect(mail.text).toContain(FREE_FIRST_LESSON_SENTENCE);
    expect(mail.text).toContain(`Günde ${FREE_CHAT_PER_DAY} öğretmen mesajı`);
    expect(mail.text).toContain(`Ayda ${FREE_PHOTO_PER_MONTH} fotoğraftan soru çözümü`);
    expect(mail.text).toContain(`toplam ${FREE_PAGE_TOTAL} sayfa belge`);
    expect(mail.text).toContain("E-postanı doğrula.");
    expect(mail.text).toContain("Sınavına 42 gün var.");
    expect(mail.text).toContain('"Belgem yok"');
    const verified = welcome.renderWelcomeOnboarding({ ...SAMPLE_WELCOME_ONBOARDING, unverified: false, daysToExam: null });
    expect(verified.text).not.toContain("E-postanı doğrula");
    expect(verified.text).not.toContain("gün var");
  });

  it("ödeme: tutar, KDV, dönem sonu, otomatik çekim, ücretsiz tekrar, veli notu", () => {
    const mail = payment.renderPaymentConfirmed(SAMPLE_PAYMENT_CONFIRMED);
    expect(mail.text).toContain("₺599,00 (KDV dahil)");
    expect(mail.html).toContain("KDV dahil");
    expect(mail.text).toContain("Otomatik çekim yapılmaz");
    expect(mail.text).toContain(payment.AUTO_RENEW_LINE);
    expect(mail.text).toContain(payment.FREE_REVIEW_LINE);
    expect(mail.text).toMatch(/Dönem sonu: 20 Aralık/);
    for (const benefit of SAMPLE_PAYMENT_CONFIRMED.benefits) expect(mail.text).toContain(`- ${benefit}`);
    expect(mail.text).not.toContain(payment.PARENT_PAID_LINE);
    expect(mail.text).toContain(`${SAMPLE_ORIGIN}/odemeler`);

    const parent = payment.renderPaymentConfirmed({ ...SAMPLE_PAYMENT_CONFIRMED, parentPaid: true });
    expect(parent.text).toContain(payment.PARENT_PAID_LINE);
    expect(parent.text).not.toContain("Sözleşme örneğin");

    const addon = payment.renderPaymentConfirmed({ ...SAMPLE_PAYMENT_CONFIRMED, kind: "addon", planName: "Ek Paket", amountKurus: 14900, periodEnd: null });
    expect(addon.text).toContain("₺149,00 (KDV dahil)");
    expect(addon.text).toContain("Otomatik çekim yapılmaz");
    expect(addon.text).not.toContain("Dönem sonu");
  });

  it("ilk konu: veli bağlantısının süresi imzalayan sabitten; kalan konular Plus'ta", () => {
    const mail = firstUnit.renderFreeFirstUnitCompleted(SAMPLE_FREE_FIRST_UNIT_COMPLETED);
    expect(mail.text).toContain(`(bağlantı ${durationLabel(PARENT_LINK_TTL_MS)} geçerli)`);
    expect(mail.text).toContain("WhatsApp");
    expect(mail.text).toContain("Kalan konuların Plus'ta açılır.");
    expect(durationLabel(48 * 3_600_000)).toBe("48 saat");
    expect(durationLabel(72 * 3_600_000)).toBe("3 gün");
  });

  it("arife: kâğıdı açamayan öğrenciye Sınav Sabahı kâğıdından söz edilmez", () => {
    const free = examEve.renderExamEveCheatSheet({ ...SAMPLE_EXAM_EVE_CHEAT_SHEET, cramSheetAvailable: false });
    for (const out of [free.subject, free.html, free.text]) {
      expect(out).not.toMatch(/Sınav Sabahı/i);
      expect(out).not.toMatch(/k[aâ]ğıd|k[aâ]ğıt/i);
      expect(out).not.toContain("sinav-sabahi");
    }
    expect(free.text).toContain("9/12 konu öğrenildi");
    const sheet = examEve.renderExamEveCheatSheet(SAMPLE_EXAM_EVE_CHEAT_SHEET);
    expect(sheet.text).toContain("Kağıdı aç (PDF olarak kaydedebilirsin)");
    // En çok üç zayıf konu.
    const many = examEve.renderExamEveCheatSheet({ ...SAMPLE_EXAM_EVE_CHEAT_SHEET, weakestTopics: ["A1", "B2", "C3", "D4"] });
    expect(many.text).toContain("- C3");
    expect(many.text).not.toContain("D4");
  });

  it("dönem bitişi: sıfır sayılar yazılmaz; ücretsize dönüş ve veli bağlantısı", () => {
    const mail = expiry.renderSubscriptionExpiryReminder(SAMPLE_SUBSCRIPTION_EXPIRY_REMINDER);
    expect(mail.text).toContain("- 7 konu öğrendin");
    expect(mail.text).toContain("- 38 adım tamamladın");
    expect(mail.text).toContain("Yenilemezsen ücretsiz hesaba dönersin; çalışman ve defterin yerinde kalır.");
    expect(mail.text).toContain("Abonelik sayfasından veline");
    const empty = expiry.renderSubscriptionExpiryReminder({ ...SAMPLE_SUBSCRIPTION_EXPIRY_REMINDER, learnedTopics: 0, completedSteps: 0 });
    expect(empty.text).not.toContain("Bu dönemde");
    expect(empty.text).not.toMatch(/\b0 (konu|adım)/);
  });

  it("karne: sessiz hafta suçlanmaz, sıfır sayı yazılmaz", () => {
    const quiet = weekly.renderWeeklyStudyDigest({ ...SAMPLE_WEEKLY_STUDY_DIGEST, weeklyLearned: 0, completedActivities: 0, streakDays: 0 });
    expect(quiet.text).toContain("Bu hafta sessiz geçti");
    expect(quiet.text).not.toMatch(/- 0 /);
    expect(weekly.renderWeeklyStudyDigest(SAMPLE_WEEKLY_STUDY_DIGEST).text).toContain("Pazartesi'nin ilk adımı: Konu Testi · Oran ve Orantı");
  });
});

describe("biçim ve söz denetimi (bütün şablonlar)", () => {
  const all: RenderedMail[] = ENTRIES.map((entry) => entry.render()).concat([
    welcome.renderWelcomeOnboarding({ ...SAMPLE_WELCOME_ONBOARDING, firstName: null, unverified: false }),
    payment.renderPaymentConfirmed({ ...SAMPLE_PAYMENT_CONFIRMED, kind: "addon", periodEnd: null }),
    examEve.renderExamEveCheatSheet({ ...SAMPLE_EXAM_EVE_CHEAT_SHEET, cramSheetAvailable: false, hoursLeft: 24 }),
    weekly.renderWeeklyStudyDigest({ ...SAMPLE_WEEKLY_STUDY_DIGEST, nextStep: null, weeklyLearned: 0 }),
  ]);

  it("600 px tablo düzeni, gizli önizleme satırı, tek birincil düğme, dış CSS yok", () => {
    for (const mail of all) {
      expect(mail.html).toContain("max-width:600px");
      expect(mail.html).toContain('role="presentation"');
      expect(mail.html).toContain('<table role="presentation" width="600"');
      expect(mail.html).toMatch(/<div style="display:none;[^"]*mso-hide:all;/);
      expect(mail.html).toContain("https://cortexplus.app/email/logo-email.png");
      expect(mail.html.match(/v:roundrect /g)?.length).toBe(1);
      expect(mail.html).not.toMatch(/<link\b|<style\b|<script\b/i);
      expect(mail.html.startsWith("<!doctype html>")).toBe(true);
    }
  });

  it("düz metin her e-postada; yer tutucu ya da bozuk değer yok", () => {
    for (const mail of all) {
      expect(mail.text.length).toBeGreaterThan(200);
      expect(mail.text).not.toMatch(/<[a-z]/i);
      for (const out of [mail.subject, mail.html, mail.text]) {
        expect(out).not.toMatch(/undefined|NaN|\bnull\b|\[object/);
      }
    }
  });

  it("tutulamayan söz yok: %100, her zaman doğru, rakip adı, eski ücretsiz katman sayıları", () => {
    for (const mail of all) {
      for (const out of [mail.subject, mail.html, mail.text]) {
        expect(out).not.toContain("%100");
        expect(out).not.toMatch(/her zaman doğru|yüzde yüz|garanti/i);
        expect(out).not.toMatch(/astra|chatgpt|gemini|openai/i);
        expect(out).not.toMatch(/günde \d+ (fotoğraf|foto)/i);
        expect(out).not.toMatch(/sınır yok|sınırsız|haftada \d+ ders|otomatik (olarak )?yenilen(ir|ecek)\b/i);
        expect(out).not.toMatch(/son fırsat|kaçırma|indirim/i);
      }
    }
  });

  it("e-posta başına en çok bir emoji", () => {
    for (const mail of all) {
      const emoji = `${mail.subject}\n${mail.text}`.match(/\p{Extended_Pictographic}/gu) ?? [];
      expect(emoji.length).toBeLessThanOrEqual(1);
    }
  });

  it("şablon klasöründe index dosyası ve yarım iş notu yok", () => {
    const dir = join(process.cwd(), "src/lib/email/templates");
    const files = readdirSync(dir);
    expect(files).not.toContain("index.ts");
    for (const file of files) {
      expect(readFileSync(join(dir, file), "utf8")).not.toMatch(/TODO|FIXME|XXX|lorem/i);
    }
  });
});
