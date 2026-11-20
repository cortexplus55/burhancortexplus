import { PLUS_ONLY_FEATURES } from "@/lib/billing/free-tier-copy";
import { longDate } from "@/lib/email/lifecycle-templates";
import { formatTry } from "@/lib/format";
import type { EmailCategory } from "@/lib/notifications/dispatch-guard";
import {
  properName,
  renderMail,
  subjectPart,
  trimOrigin,
  type FooterVariant,
  type MailBlock,
  type RenderedMail,
} from "@/lib/email/templates/layout";

/*
  Ödeme onayı (işlem e-postası): PayTR geri çağrısı ödemeyi kesinleştirince, hakkın sahibine (veli ödemesinde
  öğrenciye). Otomatik yenileme yok (`AUTO_RENEW_SUPPORTED = false`): bitişten 3 gün önce ve son gün hatırlatılır
  (`plan-notice-mails.ts`). Tutar kuruştan, tarih Türkiye saatiyle.
*/

export const TEMPLATE_KEY = "payment_confirmed" as const;
export const TEMPLATE_CATEGORY = "transactional" satisfies EmailCategory;
export const TEMPLATE_FOOTER = "transactional" satisfies FooterVariant;

export type PaymentConfirmedKind = "plus_monthly" | "plus_weekly" | "plus_yearly" | "sigma" | "addon";

export type PaymentConfirmedInput = {
  firstName: string | null;
  planName: string;
  kind: PaymentConfirmedKind;
  amountKurus: number;
  /** Dönemin bittiği an (ISO); ek pakette yok. */
  periodEnd: string | null;
  benefits: string[];
  parentPaid: boolean;
  origin: string;
};

export const AUTO_RENEW_LINE = "Otomatik çekim yapılmaz: dönem bitmeden 3 gün önce ve son gün hatırlatırız.";
export const ADDON_AUTO_RENEW_LINE = "Otomatik çekim yapılmaz; bu tek seferlik bir ödemeydi.";
export const FREE_REVIEW_LINE =
  "Tekrarların ücretsiz: kayıtlı derslerini ve günü gelen tekrar sorularını açmak hakkından düşmez.";
export const PARENT_PAID_LINE = "Velinin ödemesiyle tanımlandı.";

/** "podcast, video, sözlü, yazılı deneme ve sınav sabahı kâğıdı" (`PLUS_ONLY_FEATURES` sırasıyla). */
function unlockedList(): string {
  const items = PLUS_ONLY_FEATURES.map((item) => item.toLocaleLowerCase("tr-TR"));
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} ve ${items[items.length - 1]}`;
}

export function renderPaymentConfirmed(input: PaymentConfirmedInput): RenderedMail {
  const origin = trimOrigin(input.origin);
  const name = properName(input.firstName);
  const planName = subjectPart(input.planName, 60) || "Plus";
  const addon = input.kind === "addon";
  const subject = addon ? "Ek kullanım hakkın hesabına eklendi" : `${planName} paketin aktif! Sınav yolunda tüm kilitler açıldı`;
  const amount = Number.isFinite(input.amountKurus) ? `${formatTry(Math.max(0, Math.round(input.amountKurus)))} (KDV dahil)` : null;
  const end = addon ? null : longDate(input.periodEnd);
  const benefits = (input.benefits ?? []).map((line) => subjectPart(line, 160)).filter(Boolean).slice(0, 8);

  const facts = [
    { label: "Paket", value: planName },
    ...(amount ? [{ label: "Tutar", value: amount }] : []),
    ...(end ? [{ label: "Dönem sonu", value: end }] : []),
  ];

  const blocks: MailBlock[] = [
    {
      type: "paragraph",
      text: addon
        ? "Ödemen alındı; ek kullanım hakkın hesabına eklendi. Kaldığın yerden devam edebilirsin."
        : `Ödemen alındı; ücretsiz hesapta kapalı olan her şey artık açık: bütün konular, ${unlockedList()}.`,
    },
    ...(input.parentPaid ? [{ type: "note", tone: "warm", text: PARENT_PAID_LINE } as const] : []),
    { type: "facts", items: facts },
    ...(benefits.length ? [{ type: "heading", text: "Paketinde neler var" } as const, { type: "list", items: benefits } as const] : []),
    { type: "paragraph", text: addon ? ADDON_AUTO_RENEW_LINE : AUTO_RENEW_LINE },
    { type: "paragraph", text: FREE_REVIEW_LINE },
    ...(input.parentPaid
      ? []
      : [{ type: "paragraph", text: "Sözleşme örneğin ayrı bir e-postayla gelir; Ödemelerim sayfasından da görebilirsin." } as const]),
  ];

  return renderMail({
    subject,
    preheader: addon
      ? "Ek kullanım hakkın hemen kullanıma açık."
      : `${planName} paketin aktif.${end ? ` Dönem sonu: ${end}.` : ""} Otomatik çekim yapılmaz.`,
    kicker: "Ödemen onaylandı",
    headline: addon ? "Ek kullanım hakkın hazır" : `${planName} paketin aktif`,
    greetingName: name,
    blocks,
    cta: { label: "Çalışmaya devam et", href: `${origin}/deneme-sinavlari` },
    secondary: input.parentPaid ? null : { label: "Ödemelerim", href: `${origin}/odemeler` },
    footer: { variant: "transactional" },
  });
}
