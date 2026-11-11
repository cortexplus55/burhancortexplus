import { escapeHtml, personName } from "@/lib/email/escape";
import { ctaButton, emailShell, footerHtml, footerText, paragraphsHtml, type RenderedMail } from "@/lib/email/templates";
import { FREE_CHAT_PER_DAY, FREE_LESSONS_PER_WEEK, FREE_PHOTO_PER_DAY } from "@/lib/billing/free-meters";
import { FREE_FIRST_LESSON_SENTENCE, FREE_PAGE_TOTAL, PLUS_ONLY_SENTENCE } from "@/lib/billing/free-tier-copy";
import { PLAN_WORK_BY_ID, workCount, type PlanWorkId } from "@/lib/billing/plan-value";
import { allowanceWorkLine, sigmaBenefitLines } from "@/lib/billing/tier-presentation";
import { PLAN_ALLOWANCES, allowanceInWork } from "@/lib/credits/price-table";

/*
  Yaşam döngüsü e-postaları (8 Kasım 2026, ürün sahibi: "siteye yeni kaydolana bizim ismimizle bir mail, premium alana
  okkalı ve samimi bir mail; hangi paketi aldığına göre değişsin; Google ile kaydolsa da"). Saf işlevler: aynı girdi,
  aynı çıktı. Gönderim ve "bir kez" garantisi `lifecycle.ts`te.

  Kurallar: her sayı kredi tablosundan ve ücretsiz katman sabitlerinden hesaplanır (elle yazılmaz; kredi sayısı
  öğrenciye gösterilmez, iş sayısı gösterilir); tutulamayan söz ve sahte aciliyet yok; otomatik yenileme yok
  (`AUTO_RENEW_SUPPORTED = false`) gerçeği açıkça yazılır. Hepsi hesapla ilgili bilgilendirme (hizmet e-postası).
*/

const INK = "#111827";
const MUTED = "#6b7280";
const BRAND = "#4353f3";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Kayıtta küçük harfle yazılan ad "burhan" diye gitmesin: baş harf Türkçe kuralla büyür. */
export function properName(value: string | null | undefined): string {
  const name = personName(value, 1);
  return name ? name.charAt(0).toLocaleUpperCase("tr-TR") + name.slice(1) : "";
}

const fmt = (value: number) => value.toLocaleString("tr-TR");

const DATE_FORMAT = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", weekday: "long", timeZone: "Europe/Istanbul" });
export function longDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : DATE_FORMAT.format(new Date(time));
}

// ---- Ortak parçalar ---------------------------------------------------------------------------------------------

function hero(input: { accent: string; kicker: string; title: string; lead: string }): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr>` +
    `<td style="background:${input.accent};border-radius:16px;padding:24px 22px;">` +
    `<div style="font:600 12px/1.2 ${FONT};letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.82);">${escapeHtml(input.kicker)}</div>` +
    `<div style="font:800 26px/1.2 ${FONT};color:#ffffff;margin-top:8px;">${escapeHtml(input.title)}</div>` +
    `<div style="font:15px/1.55 ${FONT};color:rgba(255,255,255,.92);margin-top:8px;">${escapeHtml(input.lead)}</div>` +
    `</td></tr></table>`
  );
}

function sectionTitle(text: string): string {
  return `<h2 style="margin:22px 0 10px;font:700 16px/1.3 ${FONT};color:${INK};">${escapeHtml(text)}</h2>`;
}

/** Sayı kutuları: iki sütun; her hücre büyük sayı + küçük etiket. */
function numberGrid(items: { value: string; label: string }[]): string {
  const rows: string[] = [];
  for (let index = 0; index < items.length; index += 2) {
    const cell = (item?: { value: string; label: string }) =>
      item
        ? `<td width="50%" style="padding:5px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#f5f6ff;border-radius:12px;padding:12px 14px;">` +
          `<div style="font:800 22px/1.1 ${FONT};color:${BRAND};">${escapeHtml(item.value)}</div>` +
          `<div style="font:13px/1.4 ${FONT};color:${INK};margin-top:3px;">${escapeHtml(item.label)}</div></td></tr></table></td>`
        : `<td width="50%"></td>`;
    rows.push(`<tr>${cell(items[index])}${cell(items[index + 1])}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -5px;">${rows.join("")}</table>`;
}

function steps(items: { title: string; line: string; href?: string }[]): string {
  return items
    .map(
      (item, index) =>
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;"><tr>` +
        `<td width="36" valign="top"><div style="width:28px;height:28px;border-radius:999px;background:${BRAND};color:#fff;text-align:center;font:700 14px/28px ${FONT};">${index + 1}</div></td>` +
        `<td valign="top" style="font:15px/1.55 ${FONT};color:${INK};">` +
        (item.href
          ? `<a href="${escapeHtml(item.href)}" style="color:${INK};font-weight:700;text-decoration:none;">${escapeHtml(item.title)}</a>`
          : `<strong>${escapeHtml(item.title)}</strong>`) +
        `<div style="color:${MUTED};font-size:14px;">${escapeHtml(item.line)}</div></td></tr></table>`,
    )
    .join("");
}

function bullets(lines: string[]): string {
  return (
    `<ul style="margin:0 0 12px;padding:0 0 0 20px;font:15px/1.7 ${FONT};color:${INK};">` +
    lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("") +
    `</ul>`
  );
}

function noteBox(html: string, tone: "info" | "warm" = "info"): string {
  const bg = tone === "warm" ? "#fff8e6" : "#f3f4f6";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0;"><tr><td style="background:${bg};border-radius:12px;padding:14px 16px;font:14px/1.6 ${FONT};color:${INK};">${html}</td></tr></table>`;
}

function examBand(exam: { daysLeft: number; title: string | null } | null): string {
  if (!exam || exam.daysLeft < 1) return "";
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;"><tr><td align="center" style="background:#f5f6ff;border-radius:16px;padding:16px 12px;">` +
    `<div style="font:800 44px/1 ${FONT};color:${BRAND};">${exam.daysLeft}</div>` +
    `<div style="font:600 14px/1.4 ${FONT};color:${INK};margin-top:4px;">gün kaldı${exam.title ? ` · ${escapeHtml(exam.title)}` : ""}</div>` +
    `</td></tr></table>`
  );
}

function greet(name: string): string {
  return `<p style="margin:0 0 12px;font:15px/1.6 ${FONT};color:${MUTED};">${name ? `Merhaba ${escapeHtml(name)},` : "Merhaba,"}</p>`;
}

function signOff(): string {
  return (
    `<p style="margin:18px 0 0;font:15px/1.65 ${FONT};color:${INK};">Takıldığın bir şey olursa bu e-postayı yanıtla; bize ulaşır.</p>` +
    `<p style="margin:10px 0 0;font:15px/1.65 ${FONT};color:${INK};">Sevgiyle,<br><strong>Cortex Plus ekibi</strong></p>`
  );
}

// ---- Hoş geldin -------------------------------------------------------------------------------------------------

export type WelcomeMailInput = {
  firstName?: string | null;
  /** Hesap Google ile mi açıldı (e-posta zaten doğrulanmış), şifreyle mi. */
  via: "google" | "email";
  /** Şifreyle açılmış ve henüz doğrulanmamış hesap: doğrulama bağlantısına işaret edilir. */
  needsVerification?: boolean;
  exam?: { daysLeft: number; title: string | null } | null;
  /** Sıradaki adım varsa ("Kaldığın yerden") ilk adım düğmesi oraya gider. */
  next?: { heading: string; url: string } | null;
  ctaUrl: string;
  createUrl: string;
  solveUrl: string;
};

export function renderWelcomeMail(input: WelcomeMailInput): RenderedMail {
  const name = properName(input.firstName);
  const subject = name ? `${name}, hoş geldin! Cortex Plus'ta ilk 10 dakikan` : "Hoş geldin! Cortex Plus'ta ilk 10 dakikan";
  const preheader = "Notunu yükle, ilk dersini aç, takıldığın soruyu fotoğrafla: üç adımda başla.";
  const intro =
    "Biz notundan ders, test, podcast ve sözlü pratik çıkaran bir sınav hazırlık uygulamasıyız. Amacımız basit: sen çalışmaya başladığında yanında olmak. Takılırsan anlatırız, ara verirsen kaldığın yeri hatırlatırız, ilerlediğinde görürsün.";
  const stepItems = [
    {
      title: "Notunu yükle ya da hazır müfredattan seç",
      line: "PDF, fotoğraf, Word ya da slayt yükle; ya da dersini seçip hazır müfredattan kur. Konu haritan birkaç dakikada çıkar.",
      href: input.createUrl,
    },
    {
      title: "İlk dersini aç",
      line: "Yaklaşık 5 dakikalık bir ders; sonunda seni kısa bir soru bekliyor.",
      href: input.next?.url ?? input.ctaUrl,
    },
    {
      title: "Takıldığın soruyu fotoğrafla gönder",
      line: "Adım adım çözüm ve akılda kalacak kısa kuralıyla birlikte gelir.",
      href: input.solveUrl,
    },
  ];
  // 11 Kasım 2026 (ürün sahibinin kararı): ilk dersin döngüsü süreye ve haftalık hakka takılmaz; haftalık ders
  // hakkı Çalışma Stüdyosu ve "Farklı anlat" için. Cümleler tek kaynaktan (`free-tier-copy.ts`).
  const freeLines = [
    FREE_FIRST_LESSON_SENTENCE.replace(/\.$/, ""),
    `Haftada ${FREE_LESSONS_PER_WEEK} ders hakkı (Çalışma Stüdyosu ve "Farklı anlat" için)`,
    `Günde ${FREE_CHAT_PER_DAY} öğretmen mesajı ve günde ${FREE_PHOTO_PER_DAY} fotoğraftan çözüm`,
    `Belgelerin ${fmt(FREE_PAGE_TOTAL)} sayfasına kadar işlenir`,
  ];
  const moreLine = `${PLUS_ONLY_SENTENCE} İlk dersten sonraki konular da Plus'ta açılır; hazır olduğunda Abonelik sayfasından bakabilirsin. Acelesi yok, önce ücretsiz hesabınla dene.`;
  const verifyLine =
    input.via === "email" && input.needsVerification
      ? noteBox(
          "📩 <strong>E-postanı doğrula.</strong> Ayrıca gönderdiğimiz doğrulama bağlantısına tıkla; hesabını güvenceye alır. Gelmediyse spam klasörüne de bak.",
          "warm",
        )
      : "";
  const nextLine = input.next
    ? noteBox(`▶️ <strong>Kaldığın yer hazır:</strong> ${escapeHtml(input.next.heading)}`)
    : "";

  const html = emailShell({
    preheader,
    title: subject,
    bodyHtml:
      greet(name) +
      hero({
        accent: BRAND,
        kicker: "Hoş geldin",
        title: name ? `Aramıza hoş geldin, ${name}` : "Aramıza hoş geldin",
        lead: "Seni burada görmek güzel. Hazırsan başlayalım.",
      }) +
      examBand(input.exam ?? null) +
      paragraphsHtml(intro) +
      verifyLine +
      sectionTitle("İlk 10 dakikan") +
      steps(stepItems) +
      ctaButton(input.next ? "Kaldığın yerden devam et" : "İlk adımı at", input.next?.url ?? input.ctaUrl) +
      sectionTitle("Ücretsiz hesabında neler var") +
      bullets(freeLines) +
      paragraphsHtml(moreLine) +
      nextLine +
      signOff(),
    footer: footerHtml("service", null),
  });
  const text = [
    name ? `Merhaba ${name},` : "Merhaba,",
    "",
    name ? `Aramıza hoş geldin, ${name}!` : "Aramıza hoş geldin!",
    "",
    intro,
    ...(input.exam && input.exam.daysLeft >= 1 ? ["", `Sınavına ${input.exam.daysLeft} gün kaldı${input.exam.title ? ` (${input.exam.title})` : ""}.`] : []),
    ...(input.via === "email" && input.needsVerification
      ? ["", "E-postanı doğrula: ayrıca gönderdiğimiz doğrulama bağlantısına tıkla; hesabını güvenceye alır."]
      : []),
    "",
    "İlk 10 dakikan:",
    ...stepItems.map((item, index) => `${index + 1}. ${item.title}: ${item.line}${item.href ? ` ${item.href}` : ""}`),
    "",
    "Ücretsiz hesabında neler var:",
    ...freeLines.map((line) => `- ${line}`),
    moreLine,
    "",
    `${input.next ? "Kaldığın yerden devam et" : "İlk adımı at"}: ${input.next?.url ?? input.ctaUrl}`,
    "",
    "Takıldığın bir şey olursa bu e-postayı yanıtla; bize ulaşır.",
    "Sevgiyle, Cortex Plus ekibi",
    "",
    footerText("service", null),
  ].join("\n");
  return { subject, html, text };
}

// ---- Satın alma / deneme ----------------------------------------------------------------------------------------

export type PurchaseKind = "plus_monthly" | "plus_weekly" | "plus_yearly" | "sigma" | "addon" | "trial";

export type PurchaseMailInput = {
  kind: PurchaseKind;
  firstName?: string | null;
  /** Paketin veritabanındaki adı ("Plus", "Sigma", "Ek Kredi 150"). */
  planName: string;
  /** Hakkın bittiği an (ISO); ek pakette yok. */
  endsAt?: string | null;
  /** Deneme: kaç günlük. */
  trialDays?: number | null;
  /** Ek paket: plan satırındaki kredi miktarı. */
  addonCredits?: number | null;
  /** Hakkı velinin ödemesiyle tanımlandıysa. */
  giftedByParent?: boolean;
  exam?: { daysLeft: number; title: string | null } | null;
  next?: { heading: string; url: string } | null;
  ctaUrl: string;
  paymentsUrl: string;
  renewUrl: string;
};

/** Pakete göre dönem hakkı (kredi): sayılar buradan işe çevrilir. */
export function allowanceForPurchase(input: Pick<PurchaseMailInput, "kind" | "trialDays" | "addonCredits">): number {
  switch (input.kind) {
    case "plus_weekly":
      return PLAN_ALLOWANCES.plusWeekly;
    case "plus_yearly":
      return PLAN_ALLOWANCES.plusYearly;
    case "sigma":
      return PLAN_ALLOWANCES.sigmaMonthly;
    case "addon":
      return Math.max(0, Math.round(input.addonCredits ?? 0));
    case "trial": {
      const days = Math.min(90, Math.max(1, Math.round(input.trialDays ?? 14)));
      return Math.round((PLAN_ALLOWANCES.plusMonthly * days) / 30);
    }
    default:
      return PLAN_ALLOWANCES.plusMonthly;
  }
}

const GRID_IDS: PlanWorkId[] = ["lesson", "podcast", "oral", "written", "video", "photo"];

function workGrid(allowance: number) {
  return GRID_IDS.map((id) => ({ value: fmt(workCount(allowance, PLAN_WORK_BY_ID[id])), label: PLAN_WORK_BY_ID[id].noun }));
}

const GRID_NOTE = "Her sayı, hakkın tamamı o işe verilirse ulaşılan miktardır; işler aynı haktan düşer, yani hepsini birden yapamazsın.";

type Variant = {
  subject: (name: string) => string;
  accent: string;
  kicker: string;
  title: (name: string) => string;
  lead: string;
  body: string;
  gridTitle?: string;
  lines?: () => string[];
  cta: string;
};

function variantFor(input: PurchaseMailInput, end: string | null): Variant {
  switch (input.kind) {
    case "plus_weekly":
      return {
        subject: (name) => (name ? `${name}, Sınav Haftan başladı: 7 gün boyunca Plus açık` : "Sınav Haftan başladı: 7 gün boyunca Plus açık"),
        accent: "#0f766e",
        kicker: "Sınav Haftası",
        title: (name) => (name ? `Sınav Haftan başladı, ${name}` : "Sınav Haftan başladı"),
        lead: end ? `${end} gününe kadar Plus'ın her özelliği açık.` : "7 gün boyunca Plus'ın her özelliği açık.",
        body: "Sınava kısa süre kala bu yoğunluğu seni tek başına bırakmamak için hazırladık. Bu hak haftalıktır; boş bırakmadan kullanman için sana yedi günlük bir yol önerelim:",
        gridTitle: "Bu haftaki hakkın",
        lines: () => [
          "İlk gün: hazırlığında en zayıf konuyu bul ve onun dersini aç.",
          "Orta günler: günde bir ders ve testi; akşam bir podcast dinle.",
          "Son günler: yazılı denemeyi çöz, yanlışlarına dön.",
          "Sınav sabahı: hazırlık sayfasındaki Sınav Sabahı kâğıdını aç (formüller, tuzaklar, en çok yanıldığın noktalar).",
        ],
        cta: "Haftamı başlat",
      };
    case "sigma":
      return {
        subject: (name) => (name ? `${name}, Sigma'ya hoş geldin: en yüksek limit hesabında` : "Sigma'ya hoş geldin: en yüksek limit hesabında"),
        accent: "#6d28d9",
        kicker: "Sigma",
        title: (name) => (name ? `Sigma'ya hoş geldin, ${name}` : "Sigma'ya hoş geldin"),
        lead: "Ciddi çalışma için en geniş hak artık hesabında.",
        body: "Bu pakette Plus'taki her şey var, üstüne çok daha geniş bir aylık hak ve daha yüksek belge limiti. Sınav dönemini tek başına bırakmak istemeyenler için.",
        gridTitle: "Bu ayki hakkın",
        lines: () => sigmaBenefitLines(),
        cta: "Çalışmaya başla",
      };
    case "addon":
      return {
        subject: () => "Ek paketin hesabına eklendi",
        accent: BRAND,
        kicker: "Ek paket",
        title: () => "Ek paketin hazır",
        lead: "Hakkın hemen kullanıma açık.",
        body: "Paketin hesabına eklendi. Kaldığın yerden devam edebilirsin.",
        cta: "Kaldığın yerden devam et",
      };
    case "trial":
      return {
        subject: (name) => (name ? `${name}, ${input.trialDays ?? 14} günlük Plus denemen başladı` : `${input.trialDays ?? 14} günlük Plus denemen başladı`),
        accent: "#b45309",
        kicker: "Plus denemesi",
        title: (name) => (name ? `Plus denemen açıldı, ${name}` : "Plus denemen açıldı"),
        lead: end ? `${end} gününe kadar Plus'ın her özelliği açık.` : "Deneme süresince Plus'ın her özelliği açık.",
        body: "Kod hesabına tanımlandı; kart bilgisi istenmedi ve ücret alınmaz. Süre bitince hesabın ücretsiz plana döner, hiçbir şey kesilmez. Deneme boyunca podcast, sözlü ve yazılı deneme, video ders dahil her şeyi dene.",
        gridTitle: "Deneme süresince hakkın",
        cta: "Denemeye başla",
      };
    case "plus_yearly":
    case "plus_monthly":
    default:
      return {
        subject: (name) => (name ? `${name}, Plus'a hoş geldin! Bir ay boyunca her şey açık` : "Plus'a hoş geldin! Bir ay boyunca her şey açık"),
        accent: "#b45309",
        kicker: "Plus",
        title: (name) => (name ? `Plus'a hoş geldin, ${name}` : "Plus'a hoş geldin"),
        lead: "Ödemen alındı; hesabında her şey açık.",
        body: "Güvenip bizi seçtiğin için teşekkürler. Bu andan itibaren ücretsiz hesapta kapalı olan her şey açık: podcast, sözlü deneme, yazılı deneme ve video ders. Derslerde de haftalık sınır yok; hakkın aylık olarak yenilenir.",
        gridTitle: "Bu ayki hakkın",
        cta: "Çalışmaya başla",
      };
  }
}

export function renderPurchaseMail(input: PurchaseMailInput): RenderedMail {
  const name = properName(input.firstName);
  const end = longDate(input.endsAt);
  const variant = variantFor(input, end);
  const allowance = allowanceForPurchase(input);
  const subject = variant.subject(name);

  const showGrid = input.kind !== "addon" && variant.gridTitle;
  const grid = showGrid ? workGrid(allowance) : [];
  const extra = input.kind === "addon" ? allowanceInWork(allowance) : null;
  const perLine =
    input.kind === "plus_weekly"
      ? allowanceWorkLine(allowance, "hafta")
      : input.kind === "addon" || input.kind === "trial"
        ? null
        : allowanceWorkLine(allowance);
  const extraLine = extra ? `Yaklaşık ${fmt(extra.messages)} mesaj ya da ${fmt(extra.lessons)} ders kadar ek kullanım.` : null;
  const lines = variant.lines ? variant.lines() : [];
  const giftLine = input.giftedByParent ? "💙 Bu paket, velinin yaptığı ödemeyle senin hesabına tanımlandı. Bol şans!" : null;
  const endLine =
    input.kind === "addon"
      ? null
      : end
        ? `Hakkın ${end} gününe kadar açık. Otomatik yenileme yok: o güne kadar hiçbir şey kesilmez, sonra hesabın ücretsiz plana döner. Bitişten 3 gün önce ve bittiği gün sana haber veririz; devam etmek istersen Abonelik sayfasından yenilersin.`
        : "Otomatik yenileme yok: süre bitince hesabın ücretsiz plana döner ve haber veririz.";
  const contractLine =
    input.kind === "trial" || input.giftedByParent
      ? null
      : "Satın alma bilgilerin ve sözleşme örneğin ayrı bir e-postayla geldi; Ödemelerim sayfasından da görebilirsin.";
  const nextLine = input.next ? `Kaldığın yer hazır: ${input.next.heading}` : null;

  const html = emailShell({
    preheader: variant.lead,
    title: subject,
    bodyHtml:
      greet(name) +
      hero({ accent: variant.accent, kicker: variant.kicker, title: variant.title(name), lead: variant.lead }) +
      examBand(input.exam ?? null) +
      paragraphsHtml(variant.body) +
      (giftLine ? noteBox(escapeHtml(giftLine), "warm") : "") +
      (showGrid ? sectionTitle(variant.gridTitle!) + numberGrid(grid) + `<p style="margin:8px 0 0;font:12px/1.5 ${FONT};color:${MUTED};">${escapeHtml(GRID_NOTE)}</p>` : "") +
      (perLine ? `<p style="margin:12px 0 0;font:15px/1.6 ${FONT};color:${INK};"><strong>${escapeHtml(perLine)}.</strong></p>` : "") +
      (extraLine ? paragraphsHtml(extraLine) : "") +
      (lines.length ? sectionTitle(input.kind === "sigma" ? "Sigma ile" : "Önerimiz") + bullets(lines) : "") +
      (nextLine ? noteBox(`▶️ <strong>${escapeHtml(nextLine)}</strong>`) : "") +
      ctaButton(input.next ? "Kaldığın yerden devam et" : variant.cta, input.next?.url ?? input.ctaUrl) +
      (endLine ? sectionTitle("Süre ve yenileme") + paragraphsHtml(endLine) : "") +
      (contractLine
        ? `<p style="margin:0 0 6px;font:13px/1.6 ${FONT};color:${MUTED};">${escapeHtml(contractLine)} <a href="${escapeHtml(input.paymentsUrl)}" style="color:${BRAND};">Ödemelerim</a></p>`
        : "") +
      signOff(),
    footer: footerHtml("service", null),
  });

  const text = [
    name ? `Merhaba ${name},` : "Merhaba,",
    "",
    variant.title(name),
    variant.lead,
    "",
    variant.body,
    ...(giftLine ? ["", giftLine] : []),
    ...(showGrid ? ["", `${variant.gridTitle}:`, ...grid.map((item) => `- ${item.value} ${item.label}`), GRID_NOTE] : []),
    ...(perLine ? ["", `${perLine}.`] : []),
    ...(extraLine ? ["", extraLine] : []),
    ...(lines.length ? ["", input.kind === "sigma" ? "Sigma ile:" : "Önerimiz:", ...lines.map((line) => `- ${line}`)] : []),
    ...(nextLine ? ["", nextLine] : []),
    "",
    `${input.next ? "Kaldığın yerden devam et" : variant.cta}: ${input.next?.url ?? input.ctaUrl}`,
    ...(endLine ? ["", endLine] : []),
    ...(contractLine ? ["", `${contractLine} ${input.paymentsUrl}`] : []),
    "",
    "Takıldığın bir şey olursa bu e-postayı yanıtla; bize ulaşır.",
    "Sevgiyle, Cortex Plus ekibi",
    "",
    footerText("service", null),
  ].join("\n");
  return { subject, html, text };
}

/** Pakete ait satırlardan hangi türün gideceği (veritabanı satırından). */
export function purchaseKindFor(plan: {
  slug?: string | null;
  tier?: string | null;
  billing_period?: string | null;
  is_premium?: boolean | null;
  name?: string | null;
}): PurchaseKind | null {
  const haystack = `${plan.slug ?? ""} ${plan.name ?? ""}`.toLowerCase();
  if (plan.billing_period === "one_time" || /^ek-kredi/.test(plan.slug ?? "")) return plan.is_premium ? null : "addon";
  if (!plan.is_premium) return null;
  if ((plan.tier ?? "").toLowerCase() === "sigma" || haystack.includes("sigma")) return "sigma";
  if (plan.billing_period === "weekly") return "plus_weekly";
  if (plan.billing_period === "yearly") return "plus_yearly";
  return "plus_monthly";
}

/** Bakım ekranı için: bu e-postaların adı ve ne zaman gittiği (yönetimdeki kart). */
export const LIFECYCLE_MAILS = [
  { id: "welcome", name: "Hoş geldin", when: "Kayıt ve kurulum tamamlanınca (e-posta ya da Google), bir kez." },
  { id: "plus_monthly", name: "Plus (aylık)", when: "Ödeme kesinleşince, ödemenin yararlanıcısına." },
  { id: "plus_weekly", name: "Sınav Haftası (7 günlük Plus)", when: "Ödeme kesinleşince." },
  { id: "sigma", name: "Sigma", when: "Ödeme kesinleşince." },
  { id: "addon", name: "Ek paket", when: "Ödeme kesinleşince." },
  { id: "trial", name: "Plus denemesi (beta kodu)", when: "Kod kullanılıp deneme açılınca." },
] as const;
export type LifecycleMailId = (typeof LIFECYCLE_MAILS)[number]["id"];
