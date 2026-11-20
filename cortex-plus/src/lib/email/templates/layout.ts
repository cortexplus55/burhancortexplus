import { emailBrandHeader } from "@/lib/email/brand-header";
import { escapeHtml } from "@/lib/email/escape";
import { properName } from "@/lib/email/lifecycle-templates";
import type { RenderedMail } from "@/lib/email/templates";
import { SELLER } from "@/lib/legal/seller";

export type { RenderedMail };

/*
  Faz 6 e-posta kabuğu (20 Kasım 2026). Sekiz yaşam döngüsü ve işlem e-postası aynı kabuktan çıkar: koyu gece mavisi
  marka bandı (logo + başlık), logonun şeridinden ince bir çizgi, beyaz gövde kartı, tek birincil düğme, isteğe bağlı
  ikincil bağlantı ve türüne göre değişen altbilgi. Saf işlev: aynı girdi, aynı çıktı; gönderim ve kilit ayrı
  (`notifications/dispatch-guard.ts`).

  Kurallar:
  - Tablo düzeni ve satır içi stil (dış CSS ya da <style> yok): Gmail, Apple Mail ve Outlook (Word motoru) aynı çizer.
    En çok 600 px; telefonda %100. Outlook için genişlik koşullu tabloyla sabitlenir, düğme VML ile çizilir.
  - Her dinamik değer `escapeHtml`'den geçer; şablonlar HTML yazmaz, yalnız blok verir.
  - Her e-postanın düz metin hâli aynı bloklardan kurulur (iki biçim birbirinden ayrışmaz).
  - Altbilgi türleri: `transactional` (hesap bilgilendirmesi, çıkış bağlantısı yok), `lifecycle` (tercih ve
    abonelikten çıkma bağlantısı, gece sessizliği), `marketing` (lifecycle + kampanya izni satırı + gönderen kimliği:
    Ticari Elektronik İletiler Hakkında Yönetmelik).
*/

export type FooterVariant = "transactional" | "lifecycle" | "marketing";

export type MailFooter = { variant: "transactional" } | { variant: "lifecycle" | "marketing"; preferencesUrl: string };

export type MailLink = { label: string; href: string };

export type MailBlock =
  | { type: "paragraph"; text: string; lead?: string }
  | { type: "heading"; text: string }
  | { type: "list"; items: readonly string[] }
  | { type: "steps"; items: readonly { title: string; line: string }[] }
  | { type: "stats"; items: readonly { value: string; label: string }[] }
  | { type: "facts"; items: readonly { label: string; value: string }[] }
  | { type: "note"; text: string; lead?: string; tone?: "info" | "warm" };

export type MailContent = {
  subject: string;
  preheader: string;
  /** Bant içinde başlığın üstündeki kısa satır. */
  kicker?: string | null;
  headline: string;
  /** `properName` ile temizlenmiş ad; boşsa "Merhaba,". */
  greetingName: string;
  blocks: MailBlock[];
  cta: MailLink;
  secondary?: MailLink | null;
  footer: MailFooter;
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const PAGE = "#eef0f5";
/** Logonun opak görselinin zemini (`brand-header.ts`, koyu ton): bant aynı renkten başlar, görselin kutusu görünmez. */
const BAND = "#0B0D12";
const BAND_DEEP = "#151c3b";
const INK = "#111827";
const BODY = "#374151";
const MUTED = "#6b7280";
const BRAND = "#4353f3";
const SOFT = "#f5f6ff";
const WARM = "#fff8e6";
const WARM_EDGE = "#f59e0b";
const RIBBON = "linear-gradient(90deg,#ffb224 0%,#ff4d8d 36%,#8b5cf6 68%,#22d3ee 100%)";

export const SIGN_OFF_LINE = "Takıldığın bir şey olursa bu e-postayı yanıtla; bize ulaşır.";
export const SIGN_OFF_NAME = "Cortex Plus ekibi";

export const FOOTER_COPY = {
  transactional: "Bu e-postayı Cortex Plus hesabınla ilgili bir bilgilendirme olduğu için aldın; bildirim tercihlerinden bağımsız gönderilir.",
  preferences: "Bildirim tercihlerini değiştir / abonelikten çık",
  quietHours: "Gece 22:00–08:00 arası e-posta göndermeyiz.",
  marketing: "Kampanya iletilerine izin verdiğin için gönderildi; istediğin an kapatabilirsin.",
  identity: `Cortex Plus · ${SELLER.email}`,
  sender: `Gönderen: ${SELLER.legalName} · ${SELLER.address}`,
} as const;

// ---- Küçük yardımcılar (şablonlar ortak kullanır) ---------------------------------------------------------------

/** "https://cortexplus.app/" → "https://cortexplus.app". */
export function trimOrigin(origin: string): string {
  return String(origin ?? "").trim().replace(/\/+$/, "");
}

/** Bağlantı yalnız kendi adresimize gider (yol ya da tam adres); başka alan adı ya da bozuk adres → `fallback`. */
export function ownHref(href: string | null | undefined, origin: string, fallback: string): string {
  if (!href) return fallback;
  const base = trimOrigin(origin);
  try {
    const url = new URL(href, `${base}/`);
    return url.origin === new URL(base).origin ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

/** Konu satırına giren serbest metin: satır sonu ve denetim karakteri yok (başlık enjeksiyonu), en çok `max` karakter. */
export function subjectPart(value: unknown, max = 80): string {
  const clean = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** Negatif ve bozuk sayı 0; ondalık yuvarlanır. */
export function count(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

/** "1.250" gibi Türkçe sayı. */
export function formatCount(value: number): string {
  return count(value).toLocaleString("tr-TR");
}

export { properName };

/** Süre etiketi: 48 saat → "48 saat", 72 saat → "3 gün" (iki günü aşan tam günler gün olarak). */
export function durationLabel(ms: number): string {
  const hours = Math.max(1, Math.round(ms / 3_600_000));
  return hours > 48 && hours % 24 === 0 ? `${hours / 24} gün` : `${hours} saat`;
}

export function greeting(name: string): string {
  return name ? `Merhaba ${name},` : "Merhaba,";
}

// ---- HTML parçaları ---------------------------------------------------------------------------------------------

function paragraphHtml(text: string, lead?: string): string {
  const strong = lead ? `<strong style="color:${INK};">${escapeHtml(lead)}</strong> ` : "";
  return `<p style="margin:0 0 16px;font:16px/1.6 ${FONT};color:${BODY};">${strong}${escapeHtml(text)}</p>`;
}

function headingHtml(text: string): string {
  return `<h2 style="margin:26px 0 12px;font:700 18px/1.35 ${FONT};color:${INK};">${escapeHtml(text)}</h2>`;
}

function listHtml(items: readonly string[]): string {
  const rows = items
    .map(
      (item) =>
        `<tr><td width="22" valign="top" style="padding:0 0 10px;font:700 16px/1.6 ${FONT};color:${BRAND};">&bull;</td>` +
        `<td valign="top" style="padding:0 0 10px;font:16px/1.6 ${FONT};color:${BODY};">${escapeHtml(item)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">${rows}</table>`;
}

function stepsHtml(items: readonly { title: string; line: string }[]): string {
  return items
    .map(
      (item, index) =>
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;"><tr>` +
        `<td width="44" valign="top"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
        `<td width="30" height="30" align="center" valign="middle" bgcolor="${BRAND}" style="width:30px;height:30px;border-radius:15px;background-color:${BRAND};font:700 14px/30px ${FONT};color:#ffffff;">${index + 1}</td>` +
        `</tr></table></td>` +
        `<td valign="top" style="font:16px/1.5 ${FONT};color:${INK};"><strong>${escapeHtml(item.title)}</strong>` +
        `<div style="margin-top:2px;font:15px/1.55 ${FONT};color:${MUTED};">${escapeHtml(item.line)}</div></td>` +
        `</tr></table>`,
    )
    .join("");
}

function statsHtml(items: readonly { value: string; label: string }[]): string {
  const rows: string[] = [];
  for (let index = 0; index < items.length; index += 3) {
    const slice = items.slice(index, index + 3);
    const width = Math.floor(100 / slice.length);
    rows.push(
      `<tr>` +
        slice
          .map(
            (item) =>
              `<td width="${width}%" valign="top" style="padding:5px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
              `<td bgcolor="${SOFT}" style="background-color:${SOFT};border-radius:14px;padding:14px 12px;" align="center">` +
              `<div style="font:800 26px/1.1 ${FONT};color:${BRAND};">${escapeHtml(item.value)}</div>` +
              `<div style="margin-top:4px;font:13px/1.4 ${FONT};color:${BODY};">${escapeHtml(item.label)}</div>` +
              `</td></tr></table></td>`,
          )
          .join("") +
        `</tr>`,
    );
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">${rows.join("")}</table>`;
}

function factsHtml(items: readonly { label: string; value: string }[]): string {
  const rows = items
    .map(
      (item, index) =>
        `<tr><td style="padding:12px 0;${index ? "border-top:1px solid #e5e7eb;" : ""}font:15px/1.5 ${FONT};color:${MUTED};">${escapeHtml(item.label)}</td>` +
        `<td align="right" style="padding:12px 0;${index ? "border-top:1px solid #e5e7eb;" : ""}font:600 15px/1.5 ${FONT};color:${INK};">${escapeHtml(item.value)}</td></tr>`,
    )
    .join("");
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;"><tr>` +
    `<td bgcolor="#f9fafb" style="background-color:#f9fafb;border-radius:14px;padding:4px 18px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>` +
    `</td></tr></table>`
  );
}

function noteHtml(text: string, lead?: string, tone: "info" | "warm" = "info"): string {
  const bg = tone === "warm" ? WARM : SOFT;
  const edge = tone === "warm" ? WARM_EDGE : BRAND;
  const strong = lead ? `<strong style="color:${INK};">${escapeHtml(lead)}</strong> ` : "";
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px;"><tr>` +
    `<td bgcolor="${bg}" style="background-color:${bg};border-left:4px solid ${edge};border-radius:12px;padding:14px 16px;font:15px/1.6 ${FONT};color:${BODY};">` +
    `${strong}${escapeHtml(text)}</td></tr></table>`
  );
}

function blockHtml(block: MailBlock): string {
  switch (block.type) {
    case "paragraph":
      return paragraphHtml(block.text, block.lead);
    case "heading":
      return headingHtml(block.text);
    case "list":
      return block.items.length ? listHtml(block.items) : "";
    case "steps":
      return block.items.length ? stepsHtml(block.items) : "";
    case "stats":
      return block.items.length ? statsHtml(block.items) : "";
    case "facts":
      return block.items.length ? factsHtml(block.items) : "";
    case "note":
      return noteHtml(block.text, block.lead, block.tone);
  }
}

/** Tek birincil düğme: Outlook'ta VML, öbür istemcilerde dolgu bağlantı (her yeri tıklanır). */
export function ctaButtonHtml(link: MailLink): string {
  const href = escapeHtml(link.href);
  const label = escapeHtml(link.label);
  const vmlWidth = Math.min(520, Math.max(200, Math.round(link.label.length * 9.5) + 64));
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 6px;"><tr><td align="center">` +
    `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" ` +
    `style="height:52px;v-text-anchor:middle;width:${vmlWidth}px;" arcsize="23%" stroke="f" fillcolor="${BRAND}"><w:anchorlock/>` +
    `<center style="color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:16px;font-weight:bold;">${label}</center></v:roundrect><![endif]-->` +
    `<!--[if !mso]><!--><a href="${href}" target="_blank" ` +
    `style="display:inline-block;max-width:100%;box-sizing:border-box;background-color:${BRAND};border-radius:12px;padding:16px 30px;` +
    `font:700 16px/1.3 ${FONT};color:#ffffff;text-align:center;text-decoration:none;-webkit-text-size-adjust:none;">${label}</a><!--<![endif]-->` +
    `</td></tr></table>`
  );
}

function secondaryHtml(link: MailLink): string {
  return (
    `<p style="margin:10px 0 0;text-align:center;font:15px/1.5 ${FONT};color:${MUTED};">` +
    `<a href="${escapeHtml(link.href)}" target="_blank" style="color:${BRAND};text-decoration:underline;">${escapeHtml(link.label)}</a></p>`
  );
}

function footerLine(html: string): string {
  return `<p style="margin:0 0 6px;font:12px/1.6 ${FONT};color:${MUTED};text-align:center;">${html}</p>`;
}

export function footerBlockHtml(footer: MailFooter): string {
  const identity = footerLine(
    `Cortex Plus · <a href="mailto:${escapeHtml(SELLER.email)}" style="color:${MUTED};text-decoration:underline;">${escapeHtml(SELLER.email)}</a>`,
  );
  if (footer.variant === "transactional") {
    return footerLine(escapeHtml(FOOTER_COPY.transactional)) + identity;
  }
  const lines = [
    footerLine(
      `<a href="${escapeHtml(footer.preferencesUrl)}" target="_blank" style="color:${MUTED};text-decoration:underline;">${escapeHtml(FOOTER_COPY.preferences)}</a>`,
    ),
    footerLine(escapeHtml(FOOTER_COPY.quietHours)),
  ];
  if (footer.variant === "marketing") lines.push(footerLine(escapeHtml(FOOTER_COPY.marketing)));
  lines.push(identity);
  if (footer.variant === "marketing") lines.push(footerLine(escapeHtml(FOOTER_COPY.sender)));
  return lines.join("");
}

export function footerBlockText(footer: MailFooter): string {
  if (footer.variant === "transactional") return [FOOTER_COPY.transactional, FOOTER_COPY.identity].join("\n");
  return [
    `${FOOTER_COPY.preferences}: ${footer.preferencesUrl}`,
    FOOTER_COPY.quietHours,
    ...(footer.variant === "marketing" ? [FOOTER_COPY.marketing] : []),
    FOOTER_COPY.identity,
    ...(footer.variant === "marketing" ? [FOOTER_COPY.sender] : []),
  ].join("\n");
}

// ---- Düz metin --------------------------------------------------------------------------------------------------

function blockText(block: MailBlock): string {
  switch (block.type) {
    case "paragraph":
    case "note":
      return block.lead ? `${block.lead} ${block.text}` : block.text;
    case "heading":
      return block.text;
    case "list":
      return block.items.map((item) => `- ${item}`).join("\n");
    case "steps":
      return block.items.map((item, index) => `${index + 1}. ${item.title}: ${item.line}`).join("\n");
    case "stats":
      return block.items.map((item) => `- ${item.value} ${item.label}`).join("\n");
    case "facts":
      return block.items.map((item) => `${item.label}: ${item.value}`).join("\n");
  }
}

// ---- Kabuk ------------------------------------------------------------------------------------------------------

/** Önizleme satırından sonra gövde metni posta listesinde görünmesin diye görünmez dolgu. */
const PREHEADER_FILL = "&#847;&zwnj;&nbsp;".repeat(40);

export function renderMail(content: MailContent): RenderedMail {
  const blocks = content.blocks.map(blockHtml).join("");
  const kicker = content.kicker
    ? `<div style="margin:0 0 8px;font:600 14px/1.4 ${FONT};color:#c9cde4;">${escapeHtml(content.kicker)}</div>`
    : "";
  const html = `<!doctype html>
<html lang="tr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><meta name="format-detection" content="telephone=no,address=no,email=no,date=no">
<title>${escapeHtml(content.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;width:100%;background-color:${PAGE};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${PAGE};">${escapeHtml(content.preheader)}${PREHEADER_FILL}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="width:100%;background-color:${PAGE};"><tr><td align="center" style="padding:24px 12px 32px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">
<tr><td bgcolor="${BAND}" align="center" style="background-color:${BAND};border-radius:20px 20px 0 0;padding:20px 24px 0;">${emailBrandHeader("dark")}</td></tr>
<tr><td bgcolor="${BAND}" align="center" style="background-color:${BAND};background-image:linear-gradient(180deg,${BAND} 0%,${BAND_DEEP} 100%);padding:14px 32px 32px;">
${kicker}<h1 style="margin:0;font:700 28px/1.25 ${FONT};color:#ffffff;">${escapeHtml(content.headline)}</h1>
</td></tr>
<tr><td height="4" bgcolor="#8b5cf6" style="height:4px;line-height:4px;font-size:0;background-color:#8b5cf6;background-image:${RIBBON};">&nbsp;</td></tr>
<tr><td bgcolor="#ffffff" style="background-color:#ffffff;border-radius:0 0 20px 20px;padding:32px 28px 30px;">
<p style="margin:0 0 16px;font:600 16px/1.6 ${FONT};color:${INK};">${escapeHtml(greeting(content.greetingName))}</p>
${blocks}
${ctaButtonHtml(content.cta)}
${content.secondary ? secondaryHtml(content.secondary) : ""}
<p style="margin:26px 0 0;font:15px/1.6 ${FONT};color:${BODY};">${escapeHtml(SIGN_OFF_LINE)}<br><strong style="color:${INK};">${escapeHtml(SIGN_OFF_NAME)}</strong></p>
</td></tr>
<tr><td style="padding:22px 16px 0;">${footerBlockHtml(content.footer)}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;

  const text = [
    "Cortex Plus",
    "",
    content.headline,
    "",
    greeting(content.greetingName),
    "",
    ...content.blocks.map(blockText).filter(Boolean).flatMap((part) => [part, ""]),
    `${content.cta.label}: ${content.cta.href}`,
    ...(content.secondary ? [`${content.secondary.label}: ${content.secondary.href}`] : []),
    "",
    SIGN_OFF_LINE,
    SIGN_OFF_NAME,
    "",
    "--",
    footerBlockText(content.footer),
  ].join("\n");

  return { subject: content.subject, html, text };
}
