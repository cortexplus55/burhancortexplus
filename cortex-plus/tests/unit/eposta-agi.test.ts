import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { maskEmail, promotionalWarning, validateCampaign } from "@/lib/email/campaign";
import { isQuotaError, mapBatchResponse } from "@/lib/email/send-batch";
import {
  absoluteHref,
  renderCampaignMail,
  renderReferralGiftMail,
  renderReferralInviteMail,
  renderReminderMail,
  renderTokens,
  unknownTokens,
} from "@/lib/email/templates";
import { signUnsubscribeToken, unsubscribeHeaders, verifyUnsubscribeToken } from "@/lib/email/unsubscribe";
import { MARKETING_CONSENT_TEXT, MARKETING_CONSENT_VERSION } from "@/lib/legal/marketing-consent";
import { countdownDue, pickReminder, type ReminderInput } from "@/lib/learning/study-reminder";

/*
  E-posta ağı (7 Kasım 2026): imzalı çıkış bağlantısı, şablonlar, yönetimden yazılan mesajın doğrulanması, Resend
  paket yanıtının eşlenmesi, akşam geri sayımının kuralı ve cron'un bağlantıları. SQL tarafı (hedef kitle, kuyruk,
  davet hediyesi tavanı) `eposta-agi-sql.test.ts` içinde PGlite'ta koşar.
*/

const USER = "123e4567-e89b-42d3-a456-426614174000";
const ENV = { APP_SECRET: "test-secret-with-enough-length-0123456789" };
const read = (path: string) => readFileSync(path, "utf8");

describe("imzalı çıkış bağlantısı", () => {
  it("imzalar ve doğrular; kategori ve kullanıcı belirteçte taşınır", () => {
    const token = signUnsubscribeToken(USER, "marketing", ENV);
    expect(token).toBeTruthy();
    expect(verifyUnsubscribeToken(token, ENV)).toEqual({ userId: USER, category: "marketing" });
    const reminder = signUnsubscribeToken(USER, "reminder", ENV);
    expect(verifyUnsubscribeToken(reminder, ENV)?.category).toBe("reminder");
  });

  it("kategori değiştirilince ya da imza bozulunca reddeder (başkasının hesabı kapatılamaz)", () => {
    const token = signUnsubscribeToken(USER, "reminder", ENV) as string;
    expect(verifyUnsubscribeToken(token.replace(".reminder.", ".marketing."), ENV)).toBeNull();
    expect(verifyUnsubscribeToken(`${token}x`, ENV)).toBeNull();
    expect(verifyUnsubscribeToken(token.replace(USER, "223e4567-e89b-42d3-a456-426614174000"), ENV)).toBeNull();
    expect(verifyUnsubscribeToken("", ENV)).toBeNull();
    expect(verifyUnsubscribeToken(null, ENV)).toBeNull();
    expect(verifyUnsubscribeToken("a.b", ENV)).toBeNull();
  });

  it("anahtar yoksa ya da kısaysa bağlantı üretilmez: çıkış sunulamayan ileti gönderilmez", () => {
    expect(signUnsubscribeToken(USER, "marketing", {})).toBeNull();
    expect(signUnsubscribeToken(USER, "marketing", { APP_SECRET: "kisa" })).toBeNull();
    expect(signUnsubscribeToken("kullanici", "marketing", ENV)).toBeNull();
    const token = signUnsubscribeToken(USER, "marketing", ENV);
    expect(verifyUnsubscribeToken(token, { APP_SECRET: "baska-bir-gizli-anahtar-0123456789" })).toBeNull();
  });

  it("başlıklar RFC 8058 tek tıkla çıkışı söyler (posta uygulamasının kendi düğmesi için)", () => {
    const headers = unsubscribeHeaders("belirtec");
    expect(headers["List-Unsubscribe"]).toContain("/api/email/abonelik?t=belirtec");
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});

describe("yer tutucular", () => {
  it("{ad} ve {gün} dolar; {gun} de kabul edilir", () => {
    const context = { firstName: "Ayşe Yılmaz", daysToExam: 12 };
    expect(renderTokens("Merhaba {ad}, sınavına {gün} gün kaldı", context)).toBe("Merhaba Ayşe, sınavına 12 gün kaldı");
    expect(renderTokens("{gun} gün", context)).toBe("12 gün");
  });

  it("ad yoksa selamlama düzgün kalır", () => {
    expect(renderTokens("Merhaba {ad}, hoş geldin", { firstName: null })).toBe("Merhaba, hoş geldin");
    expect(renderTokens("Merhaba {ad}!", { firstName: "" })).toBe("Merhaba!");
  });

  it("tanınmayan yer tutucuları bulur", () => {
    expect(unknownTokens("{ad} {gün} {gun} {kalan_gun} {isim}")).toEqual(["{kalan_gun}", "{isim}"]);
    expect(unknownTokens("yer tutucu yok")).toEqual([]);
  });
});

describe("şablonlar", () => {
  it("yönetimden yazılan metin HTML'e kaçışla girer (zararlı etiket çalışmaz)", () => {
    const mail = renderCampaignMail({
      kind: "marketing",
      subject: "Merhaba <script>alert(1)</script>",
      body: 'Satır <img src=x onerror=alert(1)> ve "tırnak"\n\nİkinci paragraf',
      context: { firstName: "<b>Ali</b>", daysToExam: null },
      unsubscribeUrl: "https://cortexplus.app/eposta/abonelik?t=abc",
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain("&lt;img src=x");
  });

  it("kampanya e-postasında çıkış bağlantısı ve gönderen adresi vardır; hizmet duyurusunda çıkış yok", () => {
    const base = { subject: "Duyuru", body: "Yeni özellik geldi.", context: {} };
    const marketing = renderCampaignMail({ ...base, kind: "marketing", unsubscribeUrl: "https://cortexplus.app/eposta/abonelik?t=abc" });
    expect(marketing.html).toContain("/eposta/abonelik?t=abc");
    expect(marketing.text).toContain("/eposta/abonelik?t=abc");
    expect(marketing.html).toContain("Gönderen:");
    const service = renderCampaignMail({ ...base, kind: "service", unsubscribeUrl: null });
    expect(service.html).not.toContain("/eposta/abonelik");
    expect(service.html).toContain("hesabınla ilgili bilgilendirme");
  });

  it("düğme yalnız kendi alan adımıza gider", () => {
    expect(absoluteHref("/ogretmen")).toMatch(/\/ogretmen$/);
    expect(absoluteHref("https://evil.example.com/giris")).toBeNull();
    expect(absoluteHref("//evil.example.com")).toBeNull();
    const mail = renderCampaignMail({
      kind: "service",
      subject: "Duyuru",
      body: "Metin metin metin",
      ctaLabel: "Git",
      ctaPath: "https://evil.example.com",
      context: {},
      unsubscribeUrl: null,
    });
    expect(mail.html).not.toContain("evil.example.com");
  });

  it("akşam hatırlatması kalan günü büyük yazar, adı ve metni kaçışlar, çıkış bağlantısını taşır", () => {
    const mail = renderReminderMail({
      subject: "Sınavına 12 gün kaldı",
      daysLeft: 12,
      prepTitle: "TYT <Matematik>",
      headline: "Sınavına 12 gün kaldı",
      line: "Bugün 20 dakika çalış.",
      ctaUrl: "https://cortexplus.app/ogretmen",
      unsubscribeUrl: "https://cortexplus.app/eposta/abonelik?t=r",
      firstName: "Zeynep",
    });
    expect(mail.html).toContain(">12</div>");
    expect(mail.html).toContain("gün kaldı");
    expect(mail.html).toContain("TYT &lt;Matematik&gt;");
    expect(mail.html).toContain("Merhaba Zeynep,");
    expect(mail.text).toContain("Çalışmaya devam et: https://cortexplus.app/ogretmen");
    expect(mail.text).toContain("/eposta/abonelik?t=r");
  });

  it("sınav günü ya da tarihsiz hatırlatmada büyük sayı çizilmez", () => {
    for (const daysLeft of [0, null]) {
      const mail = renderReminderMail({
        subject: "Kaldığın yer",
        daysLeft,
        prepTitle: "Hazırlık",
        headline: "Kaldığın yer seni bekliyor",
        line: "Devam et.",
        ctaUrl: "https://cortexplus.app/ogretmen",
        unsubscribeUrl: null,
      });
      expect(mail.html).not.toContain("gün kaldı</div>");
    }
  });

  it("davet e-postası hediyeyi ve sınırı dürüstçe söyler; hediye e-postası izin istemez", () => {
    const invite = renderReferralInviteMail({
      firstName: "Can",
      inviteUrl: "https://cortexplus.app/kayit?ref=ABC",
      lessons: 3,
      maxInvites: 3,
      unsubscribeUrl: "https://cortexplus.app/eposta/abonelik?t=m",
    });
    expect(invite.subject).toContain("3 ders");
    expect(invite.html).toContain("ilk çalışmasını yapınca");
    expect(invite.html).toContain("En çok 3 arkadaşın");
    expect(invite.html).toContain("/eposta/abonelik?t=m");
    expect(invite.html).toContain("ref=ABC");
    const gift = renderReferralGiftMail({ firstName: "Can", lessons: 3, ctaUrl: "https://cortexplus.app/ogretmen" });
    expect(gift.html).toContain("3 ders");
    expect(gift.html).not.toContain("/eposta/abonelik");
    expect(gift.html).toContain("hesabınla ilgili bilgilendirme");
  });
});

describe("yönetimden gönderimin doğrulanması", () => {
  const audience = { plan: "all", signupDays: null, examDays: null };
  const valid = { kind: "service", subject: "Bakım duyurusu", body: "Bu gece kısa bir bakım yapacağız.", audience };

  it("geçerli mesajı kabul eder", () => {
    const result = validateCampaign(valid);
    expect(result.ok).toBe(true);
  });

  it("{gün} yalnız sınav tarihi olan hedef kitleye yazılabilir", () => {
    const body = "Sınavına {gün} gün kaldı, çalışmaya devam et.";
    const denied = validateCampaign({ ...valid, body });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error).toContain("{gün}");
    expect(validateCampaign({ ...valid, body, audience: { ...audience, examDays: 30 } }).ok).toBe(true);
  });

  it("eski adla yazılan ya da yanlış yazılan yer tutucuyu gönderimden önce yakalar", () => {
    const result = validateCampaign({ ...valid, body: "Merhaba {isim}, sınavına {kalan_gun} gün var." });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("{isim}");
      expect(result.error).toContain("{kalan_gun}");
    }
  });

  it("düğme: yazı ve adres birlikte, adres yalnız kendi alan adımız", () => {
    expect(validateCampaign({ ...valid, ctaLabel: "Git" }).ok).toBe(false);
    expect(validateCampaign({ ...valid, ctaPath: "/ogretmen" }).ok).toBe(false);
    expect(validateCampaign({ ...valid, ctaLabel: "Git", ctaPath: "https://evil.example.com" }).ok).toBe(false);
    expect(validateCampaign({ ...valid, ctaLabel: "Git", ctaPath: "/ogretmen" }).ok).toBe(true);
  });

  it("çok kısa konu, boş mesaj ve geçersiz tür reddedilir", () => {
    expect(validateCampaign({ ...valid, subject: "ab" }).ok).toBe(false);
    expect(validateCampaign({ ...valid, body: "kısa" }).ok).toBe(false);
    expect(validateCampaign({ ...valid, kind: "reklam" }).ok).toBe(false);
    expect(validateCampaign(null).ok).toBe(false);
  });

  it("hizmet duyurusu kampanya gibi okunuyorsa uyarır (engellemez); kampanya türünde uyarmaz", () => {
    const text = "Yeni indirim kampanyası başladı, hediye kodu: ABC";
    expect(promotionalWarning("service", text)).toContain("Kampanya");
    expect(promotionalWarning("single", text)).toBeTruthy();
    expect(promotionalWarning("marketing", text)).toBeNull();
    expect(promotionalWarning("service", "Bu gece 02:00'de bakım var.")).toBeNull();
    const result = validateCampaign({ ...valid, body: text });
    expect(result.ok && result.warning).toBeTruthy();
  });

  it("panelde adres tam görünmez", () => {
    expect(maskEmail("ayse.yilmaz@gmail.com")).toBe("a***@gmail.com");
  });
});

describe("Resend paket yanıtı", () => {
  it("hatalı satır boş kimlik alır, sıra kaymaz (permissive mod)", () => {
    const { ids, errors } = mapBatchResponse(4, {
      data: [{ id: "a" }, { id: "b" }, { id: "c" }],
      errors: [{ index: 1, message: "Invalid `to` field" }],
    });
    expect(ids).toEqual(["a", null, "b", "c"]);
    expect(errors.get(1)).toContain("Invalid");
    expect(errors.size).toBe(1);
  });

  it("hatasız yanıtta her satır kendi kimliğini alır; eksik kimlik boş kalır", () => {
    expect(mapBatchResponse(2, { data: [{ id: "x" }, { id: "y" }] }).ids).toEqual(["x", "y"]);
    expect(mapBatchResponse(2, { data: [{ id: "x" }] }).ids).toEqual(["x", null]);
  });

  it("kota hatasını hız sınırından ayırır (kota dolunca bekleyenler kuyruğa döner)", () => {
    expect(isQuotaError("daily_quota_exceeded", "You have reached your daily email sending quota")).toBe(true);
    expect(isQuotaError("monthly_quota_exceeded", undefined)).toBe(true);
    expect(isQuotaError("rate_limit_exceeded", "Too many requests")).toBe(false);
    expect(isQuotaError(undefined, undefined)).toBe(false);
  });
});

describe("akşam geri sayımı", () => {
  const base: ReminderInput = {
    hasUnfinishedPath: true,
    hoursSinceActivity: 30,
    daysUntilExam: 20,
    streakDays: 0,
    streakBreaksToday: false,
    alreadyNotifiedToday: false,
  };

  it("son 30 günde her akşam; sonrasında haftada bir; 120 günden uzakta hiç", () => {
    expect(countdownDue(30)).toBe(true);
    expect(countdownDue(4)).toBe(true);
    expect(countdownDue(31)).toBe(false);
    expect(countdownDue(35)).toBe(true);
    expect(countdownDue(120)).toBe(false);
    expect(countdownDue(119)).toBe(true);
    expect(countdownDue(126)).toBe(false);
    expect(countdownDue(3)).toBe(false); // son üç gün ayrı ve daha sert kural
    expect(countdownDue(null)).toBe(false);
    expect(countdownDue(10.5)).toBe(false);
  });

  it("bugün çalışmamış öğrenciye gün sayısıyla gider; çalışana gitmez", () => {
    const reminder = pickReminder({ ...base, studiedToday: false });
    expect(reminder?.kind).toBe("countdown");
    expect(reminder?.title).toBe("Sınavına 20 gün kaldı");
    // Bugün çalışan öğrencinin son etkinliği de yakındır; geri sayım da "kaldığın yer" de gitmez.
    expect(pickReminder({ ...base, hoursSinceActivity: 3, studiedToday: true })).toBeNull();
  });

  it("çalışıp çalışmadığı bilinmiyorsa son etkinliğe bakar", () => {
    expect(pickReminder({ ...base, hoursSinceActivity: 3 })).toBeNull();
    expect(pickReminder({ ...base, hoursSinceActivity: 30 })?.kind).toBe("countdown");
    expect(pickReminder({ ...base, hoursSinceActivity: null })?.kind).toBe("countdown");
  });

  it("yolu bitmiş öğrenciye ve sınav gününe geri sayım gitmez", () => {
    expect(pickReminder({ ...base, hasUnfinishedPath: false })).toBeNull();
    expect(pickReminder({ ...base, hoursSinceActivity: 3, daysUntilExam: 0 })).toBeNull();
  });
});

describe("kampanya izni metni", () => {
  it("izin isteğe bağlı, kapsamı dar ve geri alınabilir diye yazılı; sürüm tarih", () => {
    expect(MARKETING_CONSENT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(MARKETING_CONSENT_TEXT).toContain("tek tıkla çıkabilirim");
    expect(MARKETING_CONSENT_TEXT).not.toMatch(/üçüncü|ortak|paylaş/i);
  });
});

describe("bağlantılar (kaynak denetimi)", () => {
  const cron = read("src/app/api/cron/study-reminders/route.ts");

  it("hatırlatma yalnız e-postası doğrulanmış hesaba, çıkış başlıklarıyla ve günde bir kez gider", () => {
    expect(cron).toContain("verifiedUserIds(");
    expect(cron).toContain("unsubscribeHeaders(token)");
    expect(cron).toContain("idempotencyKey: `reminder-${userId}-${today}`");
    // Çıkış bağlantısı üretilemiyorsa (anahtar yok) ileti gönderilmez.
    expect(cron).toMatch(/if \(!token\)/);
  });

  it("davet ve hediye e-postaları aynı günlük turun içinde (üçüncü cron yok)", () => {
    expect(cron).toContain("sendReferralGiftMails(");
    expect(cron).toContain("sendReferralInviteMails(");
    const vercel = JSON.parse(read("vercel.json")) as { crons: { path: string; schedule: string }[] };
    expect(vercel.crons).toHaveLength(2);
    for (const entry of vercel.crons) expect(entry.schedule).toMatch(/^\d+ \d+ \* \* \*$/);
  });

  it("davet e-postası yalnız kampanya izni verene gider; kampanya gönderimi anahtar kapalıyken açılmaz", () => {
    const daily = read("src/lib/email/daily-mails.ts");
    expect(daily).toContain("email_due_referral_invites");
    expect(daily).toContain("unsubscribeHeaders(token)");
    const campaign = read("src/lib/email/campaign.ts");
    expect(campaign).toContain("isFeatureEnabled(service, MARKETING_EMAIL_FLAG)");
  });

  it("çıkış ucu GET ile hiçbir şeyi değiştirmez, POST ile çıkarır", () => {
    const route = read("src/app/api/email/abonelik/route.ts");
    expect(route).toContain("export async function POST");
    expect(route).not.toMatch(/export async function GET[\s\S]{0,600}setMarketingPreference/);
  });
});
