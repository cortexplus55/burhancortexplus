import { escapeHtml, personName } from "@/lib/email/escape";
import { SELLER } from "@/lib/legal/seller";
import { appOrigin } from "@/lib/app-url";

/*
  E-posta şablonları (7 Kasım 2026). Hepsi saf işlev: aynı girdi, aynı çıktı; gönderim ayrı (`send.ts`). Tek yerden
  üç tür çıkar ve altbilgisi türüne göre değişir:

  - hizmet: hesapla ilgili bilgilendirme (duyuru, iade, hediye yazıldı, destek cevabı). İzin istemez; altbilgide neden
    aldığı yazar.
  - hatırlatma: çalışma hatırlatması ve sınava kalan gün. Hizmetin kendi bildirimi; her e-postada tek tıkla kapatma.
  - kampanya: duyuru, yeni özellik, davet. Yalnız izin verene gider; kimliğimiz, adresimiz ve tek tıkla çıkış
    bağlantısı altbilgide (Ticari Elektronik İletiler Hakkında Yönetmelik).

  Her dinamik değer `escapeHtml`'den geçer; yöneticinin yazdığı metin de (bağlantılar yalnız https).
*/

export type MailKind = "service" | "reminder" | "marketing";

export type RenderedMail = { subject: string; html: string; text: string };

const INK = "#111827";
const MUTED = "#6b7280";
const BRAND = "#4353f3";
const GOLD = "#fdb300";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Metindeki https bağlantıları tıklanır yapar (önce kaçış, sonra bağlantı; bağlantıdaki `&` bozulmaz). */
export function linkify(escaped: string): string {
  return escaped.replace(/https:\/\/[^\s<]+/g, (url) => {
    const clean = url.replace(/[.,;:!?)]+$/, "");
    const rest = url.slice(clean.length);
    return `<a href="${clean}" style="color:${BRAND};text-decoration:underline;">${clean}</a>${rest}`;
  });
}

/** Düz metin: boş satırla ayrılan paragraflar, paragraf içinde satır sonu. */
export function paragraphsHtml(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 14px;font:15px/1.65 ${FONT};color:${INK};">${linkify(escapeHtml(paragraph)).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

export type TemplateContext = { firstName?: string | null; daysToExam?: number | null };

/**
 * `{ad}` ve `{gün}` yer tutucuları (`{gun}` de kabul edilir). Ad yoksa "Merhaba {ad}," → "Merhaba,"; gün yoksa yer
 * tutucu silinir (yarım cümle kalmasın diye gönderimden önce `unknownTokens` ve sınav tarihi şartıyla uyarılır).
 */
export function renderTokens(text: string, context: TemplateContext): string {
  const name = personName(context.firstName, 1);
  const days = typeof context.daysToExam === "number" && context.daysToExam >= 0 ? String(context.daysToExam) : "";
  return text
    .replace(/[ \t]*\{ad\}/gi, name ? ` ${name}` : "")
    .replace(/\{g[üu]n\}/gi, days)
    .replace(/[ \t]+([,.!?])/g, "$1")
    .replace(/^[ \t]+/gm, "");
}

/** Metinde geçen, tanınmayan yer tutucular (kurucu yanlış yazdıysa gönderimden önce söylenir). */
export function unknownTokens(text: string): string[] {
  const found = text.match(/\{[^{}\s]{1,24}\}/g) ?? [];
  return [...new Set(found.filter((token) => !/^\{(ad|g[üu]n)\}$/i.test(token)))];
}

export function ctaButton(label: string, href: string): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 4px;"><tr><td style="border-radius:999px;background:${BRAND};">` +
    `<a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 26px;font:600 15px/1 ${FONT};color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(label)}</a>` +
    `</td></tr></table>`
  );
}

export function footerHtml(kind: MailKind, unsubscribeUrl: string | null): string {
  const line = (text: string) => `<p style="margin:0 0 6px;font:12px/1.6 ${FONT};color:${MUTED};">${text}</p>`;
  if (kind === "service") {
    return (
      line("Bu e-posta, Cortex Plus hesabınla ilgili bilgilendirme olarak gönderildi.") +
      line(`Soruların için <a href="mailto:${escapeHtml(SELLER.email)}" style="color:${MUTED};">${escapeHtml(SELLER.email)}</a>`)
    );
  }
  const unsub = unsubscribeUrl
    ? `<a href="${escapeHtml(unsubscribeUrl)}" style="color:${MUTED};text-decoration:underline;">buradan tek tıkla çıkabilirsin</a>`
    : "";
  if (kind === "reminder") {
    return (
      line("Bu hatırlatmayı, Cortex Plus'ta çalışma hatırlatmalarını açık tuttuğun için aldın.") +
      (unsub ? line(`İstemiyorsan ${unsub}; Ayarlar'dan da değiştirebilirsin.`) : "")
    );
  }
  return (
    line("Bu e-postayı, Cortex Plus'tan duyuru ve kampanya e-postaları almayı kabul ettiğin için aldın.") +
    (unsub ? line(`Artık almak istemiyorsan ${unsub}.`) : "") +
    line(`Gönderen: ${escapeHtml(SELLER.legalName)} · ${escapeHtml(SELLER.address)}`)
  );
}

export function footerText(kind: MailKind, unsubscribeUrl: string | null): string {
  if (kind === "service") return `Bu e-posta Cortex Plus hesabınla ilgili bilgilendirme olarak gönderildi. Sorular: ${SELLER.email}`;
  if (kind === "reminder") {
    return `Bu hatırlatmayı çalışma hatırlatmalarını açık tuttuğun için aldın.${unsubscribeUrl ? ` Çıkmak için: ${unsubscribeUrl}` : ""}`;
  }
  return [
    "Bu e-postayı Cortex Plus'tan duyuru ve kampanya e-postaları almayı kabul ettiğin için aldın.",
    unsubscribeUrl ? `Artık almak istemiyorsan: ${unsubscribeUrl}` : "",
    `Gönderen: ${SELLER.legalName} · ${SELLER.address}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Ortak kabuk: marka başlığı, kart, altbilgi. Tablo düzeni (Outlook dahil her istemcide aynı görünür). */
export function emailShell(options: { preheader: string; title: string; bodyHtml: string; footer: string }): string {
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(options.title)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f3f4f6;">${escapeHtml(options.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;">
<tr><td style="padding:0 6px 14px;font:700 19px/1.2 ${FONT};color:${INK};">Cortex <span style="color:${GOLD};">Plus</span></td></tr>
<tr><td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:20px;padding:28px 24px;">${options.bodyHtml}</td></tr>
<tr><td style="padding:16px 8px 0;">${options.footer}</td></tr>
</table></td></tr></table></body></html>`;
}

/** Düğme bağlantısı yalnız kendi adresimize gider (yol ya da tam adres); başka alan adı reddedilir → `null`. */
export function absoluteHref(path: string | null | undefined): string | null {
  if (!path) return null;
  const origin = appOrigin();
  try {
    const url = new URL(path, `${origin}/`);
    return url.origin === new URL(origin).origin ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Yönetimden yazılan mesaj (tek kişi, hizmet duyurusu ya da kampanya). */
export function renderCampaignMail(input: {
  kind: MailKind;
  subject: string;
  body: string;
  ctaLabel?: string | null;
  ctaPath?: string | null;
  context: TemplateContext;
  unsubscribeUrl: string | null;
}): RenderedMail {
  const subject = renderTokens(input.subject, input.context).replace(/\s+/g, " ").trim();
  const body = renderTokens(input.body, input.context);
  const href = input.ctaLabel ? absoluteHref(input.ctaPath) : null;
  const html = emailShell({
    preheader: body.replace(/\s+/g, " ").slice(0, 110),
    title: subject,
    bodyHtml:
      `<h1 style="margin:0 0 16px;font:700 21px/1.3 ${FONT};color:${INK};">${escapeHtml(subject)}</h1>` +
      paragraphsHtml(body) +
      (href && input.ctaLabel ? ctaButton(input.ctaLabel, href) : ""),
    footer: footerHtml(input.kind, input.unsubscribeUrl),
  });
  const text = [subject, "", body, href && input.ctaLabel ? `\n${input.ctaLabel}: ${href}` : "", "", footerText(input.kind, input.unsubscribeUrl)]
    .filter((part) => part !== null)
    .join("\n");
  return { subject, html, text };
}

/** Sınava kalan günü büyük yazan akşam hatırlatması. */
export function renderReminderMail(input: {
  subject: string;
  daysLeft: number | null;
  prepTitle: string;
  headline: string;
  line: string;
  ctaUrl: string;
  unsubscribeUrl: string | null;
  firstName?: string | null;
}): RenderedMail {
  const name = personName(input.firstName, 1);
  const hero =
    input.daysLeft !== null && input.daysLeft >= 1
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;"><tr><td align="center" style="background:#f5f6ff;border-radius:16px;padding:20px 12px;">` +
        `<div style="font:800 56px/1 ${FONT};color:${BRAND};">${input.daysLeft}</div>` +
        `<div style="font:600 15px/1.4 ${FONT};color:${INK};margin-top:6px;">gün kaldı</div>` +
        `</td></tr></table>`
      : "";
  const html = emailShell({
    preheader: input.line,
    title: input.subject,
    bodyHtml:
      `<p style="margin:0 0 12px;font:15px/1.6 ${FONT};color:${MUTED};">${name ? `Merhaba ${escapeHtml(name)},` : "Merhaba,"}</p>` +
      hero +
      `<h1 style="margin:0 0 6px;font:700 20px/1.3 ${FONT};color:${INK};">${escapeHtml(input.headline)}</h1>` +
      `<p style="margin:0 0 4px;font:13px/1.5 ${FONT};color:${MUTED};">${escapeHtml(input.prepTitle)}</p>` +
      `<p style="margin:14px 0 18px;font:15px/1.65 ${FONT};color:${INK};">${escapeHtml(input.line)}</p>` +
      ctaButton("Çalışmaya devam et", input.ctaUrl),
    footer: footerHtml("reminder", input.unsubscribeUrl),
  });
  const text = [
    name ? `Merhaba ${name},` : "Merhaba,",
    "",
    input.headline,
    input.prepTitle,
    "",
    input.line,
    "",
    `Çalışmaya devam et: ${input.ctaUrl}`,
    "",
    footerText("reminder", input.unsubscribeUrl),
  ].join("\n");
  return { subject: input.subject, html, text };
}

/** Kayıttan sonra, kampanya izni verene giden "arkadaşlarını davet et" e-postası. */
export function renderReferralInviteMail(input: {
  firstName?: string | null;
  inviteUrl: string;
  lessons: number;
  maxInvites: number;
  unsubscribeUrl: string | null;
}): RenderedMail {
  const subject = `Arkadaşını davet et, ikinize de ${input.lessons} ders hediye`;
  const name = personName(input.firstName, 1);
  const html = emailShell({
    preheader: `Davet ettiğin her arkadaşın ilk çalışmasını yapınca ikinize de ${input.lessons} ders eklenir.`,
    title: subject,
    bodyHtml:
      `<p style="margin:0 0 12px;font:15px/1.6 ${FONT};color:${MUTED};">${name ? `Merhaba ${escapeHtml(name)},` : "Merhaba,"}</p>` +
      `<h1 style="margin:0 0 14px;font:700 21px/1.3 ${FONT};color:${INK};">Arkadaşınla birlikte çalış, ikiniz de kazanın</h1>` +
      paragraphsHtml(
        `Bağlantını bir arkadaşınla paylaş. Arkadaşın kayıt olup hesabını doğrular ve ilk çalışmasını yapınca ikinize de ${input.lessons} ders hediye eklenir.\n\n` +
          `En çok ${input.maxInvites} arkadaşın için hediye alırsın. Hediyeler yalnız gerçekten kayıt olup çalışmaya başlayan arkadaşların için yazılır.`,
      ) +
      ctaButton("Davet bağlantımı al", input.inviteUrl) +
      `<p style="margin:14px 0 0;font:13px/1.6 ${FONT};color:${MUTED};">Bağlantın: <a href="${escapeHtml(input.inviteUrl)}" style="color:${BRAND};">${escapeHtml(input.inviteUrl)}</a></p>`,
    footer: footerHtml("marketing", input.unsubscribeUrl),
  });
  const text = [
    name ? `Merhaba ${name},` : "Merhaba,",
    "",
    `Bağlantını bir arkadaşınla paylaş. Arkadaşın kayıt olup hesabını doğrular ve ilk çalışmasını yapınca ikinize de ${input.lessons} ders hediye eklenir.`,
    `En çok ${input.maxInvites} arkadaşın için hediye alırsın.`,
    "",
    `Davet bağlantın: ${input.inviteUrl}`,
    "",
    footerText("marketing", input.unsubscribeUrl),
  ].join("\n");
  return { subject, html, text };
}

/** Davet edene: arkadaşı ilk çalışmasını yaptı, hediye yazıldı. Hesapla ilgili bilgilendirme (izin istemez). */
export function renderReferralGiftMail(input: { firstName?: string | null; lessons: number; ctaUrl: string }): RenderedMail {
  const subject = `Davet hediyen yazıldı: ${input.lessons} ders`;
  const name = personName(input.firstName, 1);
  const html = emailShell({
    preheader: `Arkadaşın ilk çalışmasını yaptı; hesabına ${input.lessons} ders eklendi.`,
    title: subject,
    bodyHtml:
      `<p style="margin:0 0 12px;font:15px/1.6 ${FONT};color:${MUTED};">${name ? `Merhaba ${escapeHtml(name)},` : "Merhaba,"}</p>` +
      `<h1 style="margin:0 0 14px;font:700 21px/1.3 ${FONT};color:${INK};">Arkadaşın ilk çalışmasını yaptı</h1>` +
      paragraphsHtml(`Davet ettiğin arkadaşın hesabını doğrulayıp ilk çalışmasını yaptı. Hesabına ${input.lessons} ders hediye eklendi.`) +
      ctaButton("Çalışmaya git", input.ctaUrl),
    footer: footerHtml("service", null),
  });
  const text = [
    name ? `Merhaba ${name},` : "Merhaba,",
    "",
    `Davet ettiğin arkadaşın hesabını doğrulayıp ilk çalışmasını yaptı. Hesabına ${input.lessons} ders hediye eklendi.`,
    "",
    `Çalışmaya git: ${input.ctaUrl}`,
    "",
    footerText("service", null),
  ].join("\n");
  return { subject, html, text };
}

/**
 * Plan bildirimi (8 Kasım 2026): "Plus'ın 3 gün sonra bitiyor" ve "Plus'ın bugün bitti". Otomatik yenileme olmadığı
 * için (`AUTO_RENEW_SUPPORTED = false`) öğrencinin bitişi kaçırmaması gerekiyordu; önce yalnız uygulama içi
 * bildirimdi. Hesabın kendisiyle ilgili bilgi (hizmet e-postası): izin istemez, çıkış bağlantısı yok.
 */
export function renderPlanNoticeMail(input: {
  firstName?: string | null;
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
}): RenderedMail {
  const name = personName(input.firstName, 1);
  const html = emailShell({
    preheader: input.body.slice(0, 110),
    title: input.title,
    bodyHtml:
      `<p style="margin:0 0 12px;font:15px/1.6 ${FONT};color:${MUTED};">${name ? `Merhaba ${escapeHtml(name)},` : "Merhaba,"}</p>` +
      `<h1 style="margin:0 0 14px;font:700 21px/1.3 ${FONT};color:${INK};">${escapeHtml(input.title)}</h1>` +
      paragraphsHtml(input.body) +
      ctaButton(input.ctaLabel, input.ctaUrl),
    footer: footerHtml("service", null),
  });
  const text = [
    name ? `Merhaba ${name},` : "Merhaba,",
    "",
    input.title,
    "",
    input.body,
    "",
    `${input.ctaLabel}: ${input.ctaUrl}`,
    "",
    footerText("service", null),
  ].join("\n");
  return { subject: input.title, html, text };
}
